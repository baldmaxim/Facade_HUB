"""WebSocket router for live VOR pricing — V5 LLM pipeline."""
import asyncio
import io
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse

from vor.parser import parse_vor_excel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vor", tags=["vor"])

# Active pricing sessions
_sessions: dict[str, dict] = {}

MAX_SESSIONS = 500
SESSION_TTL = 3600  # 1 hour

# Per-LLM-call timeout (3 min) with 1 retry
PER_CALL_TIMEOUT = 180
MAX_RETRIES = 1


def _cleanup_old_sessions():
    """Remove sessions older than TTL."""
    now = time.time()
    expired = [sid for sid, s in _sessions.items()
               if now - s.get('created_at', 0) > SESSION_TTL]
    for sid in expired:
        del _sessions[sid]


def create_session_from_bytes(excel_bytes: bytes) -> tuple[str, int] | tuple[None, str]:
    """Create a pricing session from raw Excel bytes.

    Returns (session_id, position_count) on success, or (None, error_message) on failure.
    """
    items = parse_vor_excel(excel_bytes)
    if not items:
        return None, "Не удалось распарсить Excel. Проверьте формат файла."

    leaves = [i for i in items if not (i.raw_data and i.raw_data.get('total') == 0)
              and i.quantity and i.quantity > 0 and i.name]

    if not leaves:
        return None, "Не найдено позиций для расценки."

    _cleanup_old_sessions()
    if len(_sessions) >= MAX_SESSIONS:
        return None, "Слишком много активных сессий. Попробуйте позже."

    session_id = str(uuid.uuid4())[:8]
    _sessions[session_id] = {
        "items": leaves,
        "all_items": items,
        "original_bytes": excel_bytes,
        "results": [],
        "priced_bytes": None,
        "status": "pending",
        "websockets": [],
        "created_at": time.time(),
        "priced_count": 0,
    }
    return session_id, len(leaves)


@router.post("/price")
async def start_pricing(file: UploadFile = File(...)):
    """Upload VOR Excel and start pricing. Returns session_id."""
    content = await file.read()
    result = create_session_from_bytes(content)

    if result[0] is None:
        return {"error": result[1]}

    session_id, positions = result
    return {"session_id": session_id, "positions": positions}


@router.websocket("/live/{session_id}")
async def vor_live(ws: WebSocket, session_id: str):
    """WebSocket for live pricing updates."""
    await ws.accept()

    session = _sessions.get(session_id)
    if not session:
        await ws.send_json({"type": "error", "message": "Session not found"})
        await ws.close()
        return

    session["websockets"].append(ws)

    try:
        # If pricing already started, send existing results
        for r in session["results"]:
            await ws.send_json(r)

        # If not started yet, start V5 LLM pricing
        if session["status"] == "pending":
            session["status"] = "running"
            asyncio.create_task(_run_v5_pricing(session_id))

        # Keep connection alive until pricing done or disconnect
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=120)
            except asyncio.TimeoutError:
                continue
    except WebSocketDisconnect:
        if ws in session["websockets"]:
            session["websockets"].remove(ws)


async def _run_v5_pricing(session_id: str):
    """Run V5 LLM pipeline and push events via WebSocket dashboard."""
    session = _sessions[session_id]
    items = session["all_items"]
    leaves = session["items"]
    excel_bytes = session["original_bytes"]

    await _broadcast(session, {"type": "start", "total": len(leaves)})

    try:
        from vor.pipeline import VorPipeline
        from vor.providers.gesn_sqlite import GesnSqliteProvider
        from vor.config import default_config
        from vor.llm_runtime import run_vor_simple_completion
        # from vor.main import get_app_state  # standalone: not needed

        state = get_app_state()

        # Find gesn.db
        db_path = Path(__file__).parent.parent.parent / "data" / "gesn.db"
        if not db_path.is_file():
            for alt in [Path("data/gesn.db"), Path("backend/data/gesn.db")]:
                if alt.is_file():
                    db_path = alt
                    break

        if not db_path.is_file():
            await _broadcast(session, {
                "type": "error",
                "message": "База ГЭСН (gesn.db) не найдена",
            })
            session["status"] = "error"
            return

        pipeline = VorPipeline(gesn_db_path=str(db_path))
        provider = GesnSqliteProvider(str(db_path))
        config = default_config()

        # LLM callback with per-call timeout
        async def _llm_cb(system_prompt: str, user_prompt: str) -> str:
            model_override = str(config.llm.get("model", "") or "")
            for attempt in range(1 + MAX_RETRIES):
                try:
                    result = await asyncio.wait_for(
                        run_vor_simple_completion(
                            state.llm,
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            model_override=model_override or None,
                        ),
                        timeout=PER_CALL_TIMEOUT,
                    )
                    if not result or not result.strip():
                        raise RuntimeError("LLM вернул пустой ответ")
                    return result
                except asyncio.TimeoutError:
                    if attempt < MAX_RETRIES:
                        logger.warning("VOR LLM timeout (%ds), retry %d",
                                       PER_CALL_TIMEOUT, attempt + 1)
                        continue
                    raise RuntimeError(
                        f"LLM не ответил за {PER_CALL_TIMEOUT}с"
                    )

        # Progress callback — translate V5 events to dashboard WS messages
        def _on_progress(stage: str, pct: float, msg: str) -> None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
            asyncio.run_coroutine_threadsafe(
                _broadcast(session, {
                    "type": "progress",
                    "stage": stage,
                    "pct": round(pct, 3),
                    "message": msg,
                }),
                loop,
            )

        # Section-level callback — sends section list + completed section data
        def _on_section_complete(domain_name, priced_section, indices, items_list, **kwargs):
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return

            # Special: section assignments list (with position detail)
            if domain_name == "__sections__":
                assignments = kwargs.get("assignments", {})
                sections_list = []
                total_classified = 0
                for name, data in assignments.items():
                    if isinstance(data, dict):
                        count = data.get("count", 0)
                        total_classified += count
                        sections_list.append({
                            "name": name,
                            "count": count,
                            "positions": data.get("positions", []),
                            "preview": data.get("preview", []),
                        })
                    else:
                        # Old format: just count
                        total_classified += data
                        sections_list.append({"name": name, "count": data})
                asyncio.run_coroutine_threadsafe(
                    _broadcast(session, {
                        "type": "sections",
                        "sections": sections_list,
                        "total_classified": total_classified,
                    }),
                    loop,
                )
                return

            # Expert completed — send section result with positions
            positions_data = []
            row_to_item = {}
            if items_list:
                for item in items_list:
                    row_num = getattr(item, "row_num", None)
                    if isinstance(row_num, int) and row_num > 0:
                        row_to_item[row_num] = item
            if priced_section and priced_section.positions:
                for pos in priced_section.positions:
                    item_name = ""
                    item_unit = ""
                    item_qty = 0
                    source_item = row_to_item.get(pos.original_idx)
                    if source_item is not None:
                        item_name = source_item.name
                        item_unit = source_item.unit
                        item_qty = source_item.quantity or 0
                    total = 0
                    detailed_items = []
                    for it in (pos.items or []):
                        comp = getattr(it, "composition", None)
                        up = getattr(it, 'unit_price', 0) or 0
                        qty = getattr(comp, 'quantity', 0) or 0
                        line_total = up * qty
                        if line_total > 100_000_000:
                            logger.warning(
                                "High line total: %.0f (%s, price=%.0f, qty=%.0f)",
                                line_total, getattr(comp, 'name', ''), up, qty,
                            )
                        total += line_total
                        comp_type = getattr(comp, "type", None)
                        detailed_items.append({
                            "type": getattr(comp_type, "value", str(comp_type or "")),
                            "code": getattr(comp, "code", "") or "",
                            "name": getattr(comp, "name", "") or "",
                            "unit": getattr(comp, "unit", "") or "",
                            "quantity": round(qty, 4),
                            "quantity_formula": getattr(comp, "quantity_formula", "") or "",
                            "unit_price": round(up, 2),
                            "price_source": getattr(it, "price_source", "") or "",
                            "total_price": round(line_total, 2),
                        })
                    per_unit = (total / item_qty) if item_qty else 0
                    positions_data.append({
                        "idx": pos.original_idx,
                        "name": item_name,
                        "unit": item_unit,
                        "qty": round(item_qty, 2),
                        "total": round(total, 0),
                        "position_total": round(total, 2),
                        "per_unit": round(per_unit, 2),
                        "items_count": len(pos.items),
                        "confidence": pos.confidence,
                        "notes": getattr(pos, "notes", "") or "",
                        "items": detailed_items,
                    })

            verification = priced_section.verification if priced_section else None
            asyncio.run_coroutine_threadsafe(
                _broadcast(session, {
                    "type": "section_complete",
                    "section": domain_name,
                    "positions": positions_data,
                    "count": len(positions_data),
                    "verification": {
                        "section_total": round(verification.section_total, 2) if verification else 0,
                        "coverage_pct": round(verification.coverage_pct, 2) if verification else 0,
                        "passed": verification.passed if verification else False,
                        "red_flags": list(verification.red_flags or []) if verification else [],
                        "market_range": list(verification.market_range or ()) if verification else [],
                    },
                    "coverage": round(verification.coverage_pct, 0) if verification else 0,
                    "passed": verification.passed if verification else False,
                }),
                loop,
            )

        # Run V5 pipeline
        priced_bytes = await pipeline.run_multiagent_v5(
            excel_bytes=excel_bytes,
            provider=provider,
            llm_callback=_llm_cb,
            config=config,
            on_progress=_on_progress,
            project_root=str(Path(__file__).parent.parent.parent.parent),
            on_section_complete=_on_section_complete,
        )

        session["priced_bytes"] = priced_bytes

        # Count priced positions from the assembled Excel
        total_cost = 0
        matched_count = 0
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(priced_bytes), data_only=True)
            ws = wb.active
            for row in ws.iter_rows(min_row=2, max_col=20, values_only=True):
                if row and len(row) > 15 and row[14]:  # Column O has price
                    matched_count += 1
                    try:
                        total_cost += float(row[15] or 0)  # Column P
                    except (ValueError, TypeError):
                        pass
        except Exception:
            pass

        await _broadcast(session, {
            "type": "complete",
            "matched": matched_count,
            "total": total_cost,
            "per_m2": int(total_cost * 1.89 / 50000) if total_cost > 0 else 0,
            "download_url": f"/api/vor/download/{session_id}",
        })
        session["status"] = "complete"
        logger.info("VOR dashboard session %s complete: %d positions", session_id, matched_count)

    except Exception as e:
        logger.exception("VOR V5 dashboard pricing failed for session %s", session_id)
        await _broadcast(session, {
            "type": "error",
            "message": f"Ошибка расценки: {str(e)}",
        })
        session["status"] = "error"


async def _broadcast(session: dict, data: dict):
    """Send to all connected WebSockets and store in results."""
    # Store for late-joining clients
    session["results"].append(data)

    dead = []
    for ws in session["websockets"]:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        session["websockets"].remove(ws)


@router.get("/dashboard/{session_id}")
async def vor_dashboard(session_id: str, request: Request):
    """Serve the live dashboard HTML."""
    html_path = Path(__file__).parent / "templates" / "vor_live.html"
    if not html_path.exists():
        return HTMLResponse("<h1>Dashboard not found</h1>", status_code=404)

    html = html_path.read_text(encoding="utf-8")

    # Determine backend URL from request (for WS connection)
    backend_url = str(request.base_url).rstrip("/")

    # Get initial positions (if session already has results)
    session = _sessions.get(session_id)
    positions_json = json.dumps(session.get("results", []) if session else [], ensure_ascii=False)

    # Replace Jinja2-style template variables
    html = html.replace("{{ session_id }}", session_id)
    html = html.replace("{{ backend_url }}", backend_url)
    html = html.replace("{{ positions | tojson }}", positions_json)

    return HTMLResponse(html)


@router.get("/download/{session_id}")
async def vor_download(session_id: str):
    """Download priced Excel for a completed session."""
    session = _sessions.get(session_id)
    if not session:
        return {"error": "Сессия не найдена"}
    if session["status"] != "complete":
        return {"error": "Расценка ещё не завершена"}

    priced_bytes = session.get("priced_bytes")
    if not priced_bytes:
        return {"error": "Расценённый файл не найден"}

    return StreamingResponse(
        io.BytesIO(priced_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=VOR_priced.xlsx"},
    )
