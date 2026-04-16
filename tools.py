"""DB-backed tools for the AI-Smetчик agent.

Each tool is a pure function that queries gesn.db and returns structured data.
No fallbacks, no hardcoded prices — if not found, returns None.
Tools are designed for both Gemini function calling and Claude Code batch mode.
"""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from vor.constants import (
    FER_INDEX_2025,
    FSSC_INDEX_2025,
    STANDARD_LABOR_RATE,
)

logger = logging.getLogger("vor_agent.tools")

# ═══════════════════════════════════════════════════════════════════════
# Tool context — holds preloaded DB connection
# ═══════════════════════════════════════════════════════════════════════

_DEFAULT_DB = Path(__file__).resolve().parent.parent.parent.parent / "data" / "gesn.db"


class ToolContext:
    """Holds DB connection and caches for agent tools."""

    def __init__(self, db_path: str | Path | None = None):
        self.db_path = str(db_path or _DEFAULT_DB)
        self._conn: sqlite3.Connection | None = None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None


# ═══════════════════════════════════════════════════════════════════════
# Tool 1: search_gesn — find ГЭСН codes by description
# ═══════════════════════════════════════════════════════════════════════


def search_gesn(
    ctx: ToolContext,
    query: str,
    collection: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Search ГЭСН codes by keywords.

    Args:
        query: Search string (e.g. "кладка газобетон 400мм")
        collection: Optional collection code filter (e.g. "08" for masonry)
        limit: Max results (default 10)

    Returns:
        List of {code, name, unit, collection_code, section_name, has_fer_price}
    """
    cur = ctx.conn.cursor()

    # Build keyword search: require first keyword, rank by total matches
    words = [w.strip().lower() for w in query.split() if len(w.strip()) >= 3]
    if not words:
        return []

    # First keyword is required, rest boost ranking
    params: list = [f"%{words[0]}%"]
    where = "LOWER(w.name) LIKE ?"
    if collection:
        where += " AND w.collection_code = ?"
        params.append(collection)

    # Scoring: count how many keywords match
    score_parts = []
    for word in words:
        score_parts.append("(CASE WHEN LOWER(w.name) LIKE ? THEN 1 ELSE 0 END)")
        params.append(f"%{word}%")
    score_expr = " + ".join(score_parts)

    sql = f"""
        SELECT w.code, w.name, w.measure_unit,
               w.collection_code,
               s.name as section_name,
               CASE WHEN fp.code IS NOT NULL THEN 1 ELSE 0 END as has_fer,
               ({score_expr}) as score
        FROM works w
        LEFT JOIN sections s ON w.section_id = s.id
        LEFT JOIN fer_prices fp ON w.code = fp.code
        WHERE {where}
        ORDER BY score DESC,
            (CASE WHEN fp.code IS NOT NULL THEN 1 ELSE 0 END) DESC,
            w.code
        LIMIT ?
    """
    params.append(limit)

    cur.execute(sql, params)
    results = []
    for row in cur.fetchall():
        results.append({
            "code": row["code"],
            "name": row["name"],
            "unit": row["measure_unit"] or "",
            "collection_code": row["collection_code"] or "",
            "section_name": row["section_name"] or "",
            "has_fer_price": bool(row["has_fer"]),
        })
    return results


# ═══════════════════════════════════════════════════════════════════════
# Tool 2: get_composition — normative resource list for a ГЭСН code
# ═══════════════════════════════════════════════════════════════════════


def get_composition(ctx: ToolContext, gesn_code: str) -> list[dict] | None:
    """Get full normative resource composition for a ГЭСН code.

    Returns list of resources from the DB `resources` table.
    Each resource has a norm_quantity (per unit of work).

    Returns None if code not found.
    """
    cur = ctx.conn.cursor()

    cur.execute("""
        SELECT r.code, r.name, r.type, r.measure_unit, r.quantity,
               w.measure_unit as work_unit
        FROM resources r
        JOIN works w ON r.work_id = w.id
        WHERE w.code = ?
        ORDER BY r.type, r.name
    """, (gesn_code,))

    rows = cur.fetchall()
    if not rows:
        return None

    results = []
    for row in rows:
        results.append({
            "code": row["code"] or "",
            "name": row["name"] or "",
            "type": row["type"] or "unknown",
            "unit": row["measure_unit"] or "",
            "norm_quantity": row["quantity"] or 0.0,
            "work_unit": row["work_unit"] or "",
        })
    return results


# ═══════════════════════════════════════════════════════════════════════
# Tool 3: get_price — price for a specific resource code
# ═══════════════════════════════════════════════════════════════════════


def get_price(ctx: ToolContext, resource_code: str) -> dict | None:
    """Look up price for a resource by its code.

    Returns None if not found. NO FALLBACK.
    Price is in ФСНБ-2022 base level.
    """
    cur = ctx.conn.cursor()

    # Try resource_prices first
    cur.execute("""
        SELECT code, name, price, measure_unit
        FROM resource_prices
        WHERE code = ? AND price > 0
    """, (resource_code,))
    row = cur.fetchone()
    if row:
        raw_unit = row["measure_unit"] or ""
        price = row["price"]
        multiplier = _extract_unit_multiplier(raw_unit)
        base_unit = re.sub(r"^\d+\s*", "", raw_unit).strip()

        return {
            "code": row["code"],
            "name": row["name"] or "",
            "base_price": price,
            "unit_price": round(price / multiplier, 2) if multiplier > 0 else price,
            "raw_unit": raw_unit,
            "base_unit": base_unit or raw_unit,
            "multiplier": multiplier,
            "price_level": "ФСНБ-2022",
            "index_2025": FSSC_INDEX_2025,
            "price_2025": round(price / multiplier * FSSC_INDEX_2025, 2) if multiplier > 0 else round(price * FSSC_INDEX_2025, 2),
        }

    # Try fer_prices (for work items)
    cur.execute("""
        SELECT code, name, direct_cost, labor_cost, machinery_cost, materials_cost
        FROM fer_prices
        WHERE code = ? AND direct_cost > 0
    """, (resource_code,))
    row = cur.fetchone()
    if row:
        dc = row["direct_cost"]
        return {
            "code": row["code"],
            "name": row["name"] or "",
            "base_price": dc,
            "unit_price": dc,
            "raw_unit": "",
            "base_unit": "",
            "multiplier": 1,
            "price_level": "ФЕР-2022",
            "index_2025": FER_INDEX_2025,
            "price_2025": round(dc * FER_INDEX_2025, 2),
            "breakdown": {
                "labor": row["labor_cost"] or 0,
                "machinery": row["machinery_cost"] or 0,
                "materials": row["materials_cost"] or 0,
            },
        }

    return None


# ═══════════════════════════════════════════════════════════════════════
# Tool 4: search_resource — fuzzy search by name
# ═══════════════════════════════════════════════════════════════════════


def search_resource(
    ctx: ToolContext,
    name: str,
    unit: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Fuzzy search resources by name. Used when code lookup fails.

    Returns list of matches with prices. Empty list if nothing found.
    """
    cur = ctx.conn.cursor()

    words = [w.strip().lower() for w in name.split() if len(w.strip()) >= 3]
    if not words:
        return []

    # First keyword required, rest boost ranking
    params: list = [f"%{words[0]}%"]
    where = "LOWER(rp.name) LIKE ?"
    if unit:
        norm_unit = _normalize_unit(unit)
        where += " AND (LOWER(rp.measure_unit) LIKE ? OR LOWER(rp.measure_unit) LIKE ?)"
        params.extend([f"%{norm_unit}%", f"%{unit.lower()}%"])

    score_parts = []
    for word in words:
        score_parts.append("(CASE WHEN LOWER(rp.name) LIKE ? THEN 1 ELSE 0 END)")
        params.append(f"%{word}%")
    score_expr = " + ".join(score_parts)

    sql = f"""
        SELECT rp.code, rp.name, rp.price, rp.measure_unit
        FROM resource_prices rp
        WHERE {where} AND rp.price > 0
        ORDER BY ({score_expr}) DESC, rp.price
        LIMIT ?
    """
    params.append(limit)

    cur.execute(sql, params)
    results = []
    for row in cur.fetchall():
        raw_unit = row["measure_unit"] or ""
        multiplier = _extract_unit_multiplier(raw_unit)
        base_unit = re.sub(r"^\d+\s*", "", raw_unit).strip()
        price = row["price"]

        results.append({
            "code": row["code"],
            "name": row["name"] or "",
            "base_price": price,
            "unit_price_2025": round(price / multiplier * FSSC_INDEX_2025, 2),
            "raw_unit": raw_unit,
            "base_unit": base_unit,
            "multiplier": multiplier,
        })
    return results


# ═══════════════════════════════════════════════════════════════════════
# Tool 5: calculate_total — full position cost calculation
# ═══════════════════════════════════════════════════════════════════════


def calculate_total(
    ctx: ToolContext,
    gesn_code: str,
    quantity: float,
) -> dict | None:
    """Calculate full position cost from ГЭСН code + quantity.

    Gets composition from DB, prices each resource, multiplies by quantity.
    Returns breakdown with totals. None if code not found.
    """
    composition = get_composition(ctx, gesn_code)
    if composition is None:
        return None

    # Get FER price for the work itself
    fer_info = get_price(ctx, gesn_code)

    breakdown = []
    total_cost = 0.0
    warnings = []
    not_found_count = 0

    for res in composition:
        norm_qty = res["norm_quantity"] or 0
        total_qty = round(norm_qty * quantity, 4)

        price_info = get_price(ctx, res["code"]) if res["code"] else None

        if price_info:
            unit_price_2025 = price_info["price_2025"]
            line_total = round(total_qty * unit_price_2025, 2)
            price_source = price_info["price_level"]
        elif res["type"] == "labor":
            unit_price_2025 = STANDARD_LABOR_RATE
            line_total = round(total_qty * STANDARD_LABOR_RATE, 2)
            price_source = "labor_rate"
        elif res["type"] == "labor_operator":
            unit_price_2025 = STANDARD_LABOR_RATE
            line_total = round(total_qty * STANDARD_LABOR_RATE, 2)
            price_source = "labor_rate"
        else:
            unit_price_2025 = 0
            line_total = 0
            price_source = "NOT_FOUND"
            not_found_count += 1
            warnings.append(f"Price not found: {res['name']} ({res['code']})")

        total_cost += line_total
        breakdown.append({
            "type": res["type"],
            "code": res["code"],
            "name": res["name"],
            "unit": res["unit"],
            "norm_qty": norm_qty,
            "total_qty": total_qty,
            "unit_price_2025": unit_price_2025,
            "line_total": line_total,
            "price_source": price_source,
        })

    per_unit = round(total_cost / quantity, 2) if quantity > 0 else 0

    return {
        "gesn_code": gesn_code,
        "quantity": quantity,
        "total_cost": round(total_cost, 2),
        "per_unit": per_unit,
        "fer_price_2025": fer_info["price_2025"] if fer_info else None,
        "resource_count": len(breakdown),
        "not_found_count": not_found_count,
        "breakdown": breakdown,
        "warnings": warnings,
    }


# ═══════════════════════════════════════════════════════════════════════
# Tool 6: check_benchmark — compare against market ranges
# ═══════════════════════════════════════════════════════════════════════

_BENCHMARKS: dict[str, dict] = {}


def _load_benchmarks():
    """Load benchmarks from price_ranges.yaml."""
    global _BENCHMARKS
    if _BENCHMARKS:
        return
    import yaml
    ranges_path = Path(__file__).resolve().parent.parent / "price_ranges.yaml"
    if ranges_path.exists():
        with open(ranges_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        _BENCHMARKS = data.get("position_totals", {})


def check_benchmark(work_description: str, unit: str, price_per_unit: float) -> dict:
    """Compare price_per_unit against known market benchmarks.

    Returns: {status, range_min, range_max, benchmark_name, recommendation}
    """
    _load_benchmarks()

    desc_lower = work_description.lower()

    for bench_name, bench in _BENCHMARKS.items():
        keywords = bench.get("keywords", [bench_name])
        if any(kw in desc_lower for kw in keywords):
            range_min = bench.get("min", 0)
            range_max = bench.get("max", float("inf"))

            if price_per_unit < range_min:
                status = "LOW"
                rec = f"Price {price_per_unit:.0f} below minimum {range_min} for {bench_name}"
            elif price_per_unit > range_max:
                status = "HIGH"
                rec = f"Price {price_per_unit:.0f} above maximum {range_max} for {bench_name}"
            else:
                status = "OK"
                rec = f"Price {price_per_unit:.0f} within range {range_min}-{range_max} for {bench_name}"

            return {
                "status": status,
                "range_min": range_min,
                "range_max": range_max,
                "benchmark_name": bench_name,
                "recommendation": rec,
            }

    return {
        "status": "NO_BENCHMARK",
        "range_min": 0,
        "range_max": 0,
        "benchmark_name": "",
        "recommendation": "No benchmark found for this work type",
    }


# ═══════════════════════════════════════════════════════════════════════
# Tool 7: get_encyclopedia — domain knowledge excerpt
# ═══════════════════════════════════════════════════════════════════════


def get_encyclopedia(domain: str, topic: str | None = None) -> str | None:
    """Get encyclopedia text for a domain expert.

    Returns full encyclopedia content (for context loading)
    or a filtered excerpt if topic is specified.
    """
    import yaml as _yaml

    config_path = Path(__file__).resolve().parent.parent / "vor_config.yaml"
    if not config_path.exists():
        return None

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = _yaml.safe_load(f) or {}

    experts = cfg.get("experts", {})
    expert = experts.get(domain)
    if not expert:
        return None

    enc_rel = expert.get("encyclopedia", "")
    if not enc_rel:
        return None

    enc_path = Path(__file__).resolve().parent.parent.parent.parent / enc_rel
    if not enc_path.exists():
        return None

    text = enc_path.read_text(encoding="utf-8")

    if topic:
        # Extract relevant section (~2000 chars around topic mention)
        topic_lower = topic.lower()
        idx = text.lower().find(topic_lower)
        if idx >= 0:
            start = max(0, idx - 1000)
            end = min(len(text), idx + 2000)
            return text[start:end]
        return None

    return text


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════


def _extract_unit_multiplier(raw_unit: str) -> float:
    """Extract quantity multiplier from unit string like '100 м2' → 100."""
    if not raw_unit:
        return 1.0
    m = re.match(r"^(\d+)\s+", raw_unit.strip())
    if m:
        return float(m.group(1))
    return 1.0


def _normalize_unit(unit: str) -> str:
    """Normalize unit for comparison."""
    u = unit.lower().strip().replace(".", "").replace(" ", "")
    aliases = {
        "м²": "м2", "кв.м": "м2", "квм": "м2",
        "м³": "м3", "куб.м": "м3", "кубм": "м3",
        "маш-ч": "машч", "маш.-ч": "машч",
        "чел-ч": "челч", "чел.-ч": "челч",
        "пог.м": "м", "п.м": "м", "погм": "м", "мп": "м",
    }
    return aliases.get(u, u)
