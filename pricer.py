"""FER price lookup and cost calculation for matched GESN codes.

Given a list of ``GesnMatch`` objects and per-item quantities this module
looks up base FER prices from ``gesn.db`` and computes totals.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from vor.constants import FER_INDEX_2025, FSSC_INDEX_2025


def _get_unit_multiplier(raw_unit: str) -> float:
    """Extract unit multiplier from strings like '100 м2', '1000 м3'.

    Returns how many base units the price covers.
    E.g., '100 м2' means price is per 100 м2, so divide by 100.
    """
    if not raw_unit:
        return 1.0
    m = re.match(r'^(\d+)\s*[а-яa-z]', raw_unit.strip(), re.IGNORECASE)
    if m:
        return float(m.group(1))
    return 1.0
from vor.models import (
    GesnMatch,
    PositionBreakdown,
    PriceResult,
    ResourceDetail,
    ResourceLine,
    WorkBreakdown,
)


def calculate_prices(
    matches: list[GesnMatch],
    quantities: dict[int, float],  # item_idx → quantity
    gesn_db_path: str | Path,
) -> list[PriceResult]:
    """For each matched GESN code with a quantity, look up FER price and calculate total.

    Items without a quantity in *quantities* are silently skipped (they will
    be priced once quantity extraction provides a value).

    Items whose GESN code has no FER price row are included with zero costs
    and a note explaining the situation.
    """
    gesn_db_path = str(gesn_db_path)
    conn = sqlite3.connect(gesn_db_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        results: list[PriceResult] = []

        for match in matches:
            idx = match.item_idx

            # Skip items without quantity.
            if idx not in quantities:
                continue

            qty = quantities[idx]

            # Skip items that were not matched to any GESN code.
            if not match.gesn_code:
                results.append(
                    PriceResult(
                        item_idx=idx,
                        quantity=qty,
                        gesn_code="",
                        fer_direct_cost=0.0,
                        notes="No GESN code matched — cannot look up price",
                    )
                )
                continue

            price = _lookup_fer_price(match.gesn_code, cursor)

            # Look up GESN resources for this code (regardless of FER price).
            resources = _lookup_resources(match.gesn_code, qty, cursor)

            if price is None:
                results.append(
                    PriceResult(
                        item_idx=idx,
                        quantity=qty,
                        gesn_code=match.gesn_code,
                        fer_direct_cost=0.0,
                        notes=f"No FER price found for code {match.gesn_code}",
                        resources=resources,
                    )
                )
                continue

            direct = price["direct_cost"] or 0.0
            labor = price["labor_cost"] or 0.0
            machinery = price["machinery_cost"] or 0.0
            materials = price["materials_cost"] or 0.0

            # Divide by unit multiplier: "100 м2" means price is per 100 units
            multiplier = _get_unit_multiplier(price.get("measure_unit", ""))

            results.append(
                PriceResult(
                    item_idx=idx,
                    quantity=qty,
                    gesn_code=match.gesn_code,
                    fer_direct_cost=direct,
                    fer_labor=labor,
                    fer_machinery=machinery,
                    fer_materials=materials,
                    total_base=round(qty * direct * FER_INDEX_2025 / multiplier, 2),
                    resources=resources,
                )
            )

        return results
    finally:
        conn.close()


def _lookup_fer_price(gesn_code: str, cursor: sqlite3.Cursor) -> dict | None:
    """Look up FER price breakdown for a GESN code.

    Returns a dict with keys ``direct_cost``, ``labor_cost``,
    ``machinery_cost``, ``materials_cost``, ``labor_hours``,
    ``measure_unit`` — or ``None`` if the code is not found.
    """
    cursor.execute(
        """
        SELECT f.direct_cost, f.labor_cost, f.machinery_cost,
               f.operator_labor_cost, f.materials_cost, f.labor_hours,
               w.measure_unit
        FROM fer_prices f
        LEFT JOIN works w ON w.code = f.code
        WHERE f.code = ?
        LIMIT 1
        """,
        (gesn_code,),
    )
    row = cursor.fetchone()
    if row is None:
        return None

    return {
        "direct_cost": row["direct_cost"],
        "labor_cost": row["labor_cost"],
        "machinery_cost": row["machinery_cost"],
        "operator_labor_cost": row["operator_labor_cost"],
        "materials_cost": row["materials_cost"],
        "labor_hours": row["labor_hours"],
        "measure_unit": row["measure_unit"] or "",
    }


def _lookup_resources(
    gesn_code: str, work_quantity: float, cursor: sqlite3.Cursor
) -> list[ResourceDetail]:
    """Look up resources for a GESN code and scale by work quantity.

    Joins through the ``works`` table (code -> work_id) to find all
    resource rows. Returns an empty list when the code has no matching
    work, no resources, or the resources table does not exist.
    """
    try:
        cursor.execute(
            """
            SELECT r.code, r.name, r.type, r.measure_unit, r.quantity
            FROM resources r
            JOIN works w ON r.work_id = w.id
            WHERE w.code = ?
            ORDER BY r.id
            """,
            (gesn_code,),
        )
        rows = cursor.fetchall()
    except sqlite3.OperationalError:
        # Table may not exist in test databases.
        return []

    # Default measure units by resource type (many resources lack explicit units)
    _DEFAULT_UNITS = {
        "labor": "чел.-ч",
        "labor_operator": "чел.-ч",
        "machinery": "маш.-ч",
    }

    details: list[ResourceDetail] = []
    for row in rows:
        res_code = row["code"] or ""

        # Skip aggregate/summary codes:
        # Code "1" = aggregate labor total (дубль трудозатрат)
        # Code "2" used as labor_operator is kept only if it has a name
        if res_code == "1":
            continue

        norm_qty = row["quantity"] if row["quantity"] is not None else 0.0
        # Handle string quantities gracefully.
        try:
            norm_qty = float(norm_qty)
        except (TypeError, ValueError):
            norm_qty = 0.0

        # Skip zero-quantity resources
        if norm_qty == 0.0:
            continue

        res_type = row["type"] or ""
        measure_unit = row["measure_unit"] or ""

        # Fill in default units for resources that lack them
        if not measure_unit and res_type in _DEFAULT_UNITS:
            measure_unit = _DEFAULT_UNITS[res_type]

        res_name = row["name"] or ""
        # For code "2" (machine operator labor), provide a readable name
        if res_code == "2" and (not res_name or res_name == "2"):
            res_name = "Затраты труда машинистов"

        details.append(
            ResourceDetail(
                resource_code=res_code,
                name=res_name,
                type=res_type,
                measure_unit=measure_unit,
                norm_quantity=norm_qty,
                total_quantity=round(norm_qty * work_quantity, 6),
            )
        )
    return details


# ---------------------------------------------------------------------------
# V3: Resource breakdown with prices
# ---------------------------------------------------------------------------


def build_work_breakdown(
    gesn_code: str,
    work_quantity: float,
    gesn_db_path: str | Path,
    *,
    gesn_name: str = "",
    gesn_unit: str = "",
) -> WorkBreakdown:
    """Build a complete WorkBreakdown for a single GESN code.

    Fetches resources from DB, looks up individual resource prices,
    and groups into materials / machinery / labor.
    """
    gesn_db_path = str(gesn_db_path)
    conn = sqlite3.connect(gesn_db_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Look up work name/unit if not provided
        if not gesn_name:
            cursor.execute(
                "SELECT name, measure_unit FROM works WHERE code = ? LIMIT 1",
                (gesn_code,),
            )
            row = cursor.fetchone()
            if row:
                gesn_name = row["name"] or ""
                if not gesn_unit:
                    gesn_unit = row["measure_unit"] or ""

        # Fetch resources
        resource_lines = _fetch_resource_lines(gesn_code, work_quantity, cursor)
    finally:
        conn.close()

    # Split into categories
    materials: list[ResourceLine] = []
    machinery: list[ResourceLine] = []
    labor_lines: list[ResourceLine] = []

    for rl in resource_lines:
        if rl.resource_type in ("material", "material_unaccounted"):
            materials.append(rl)
        elif rl.resource_type == "machinery":
            machinery.append(rl)
        elif rl.resource_type in ("labor", "labor_operator"):
            labor_lines.append(rl)

    total = sum(rl.total_price for rl in resource_lines)

    return WorkBreakdown(
        gesn_code=gesn_code,
        gesn_name=gesn_name,
        measure_unit=gesn_unit,
        quantity=work_quantity,
        materials=materials,
        machinery=machinery,
        labor_lines=labor_lines,
        total_cost=round(total, 2),
    )


def _fetch_resource_lines(
    gesn_code: str, work_quantity: float, cursor: sqlite3.Cursor
) -> list[ResourceLine]:
    """Fetch resources for a GESN code, look up prices, return ResourceLine list."""
    try:
        cursor.execute(
            """
            SELECT r.code, r.name, r.type, r.measure_unit, r.quantity
            FROM resources r
            JOIN works w ON r.work_id = w.id
            WHERE w.code = ?
            ORDER BY
              CASE r.type
                WHEN 'labor' THEN 1
                WHEN 'material' THEN 2
                WHEN 'material_unaccounted' THEN 3
                WHEN 'machinery' THEN 4
                WHEN 'labor_operator' THEN 5
              END,
              r.id
            """,
            (gesn_code,),
        )
        rows = cursor.fetchall()
    except sqlite3.OperationalError:
        return []

    # Preload resource prices for all codes in this work
    codes = [row["code"] for row in rows if row["code"] and row["code"] != "1"]
    price_map = _bulk_lookup_prices(codes, cursor)

    _DEFAULT_UNITS = {
        "labor": "чел.-ч",
        "labor_operator": "чел.-ч",
        "machinery": "маш.-ч",
    }

    lines: list[ResourceLine] = []
    for row in rows:
        res_code = row["code"] or ""
        if res_code == "1":
            continue

        norm_qty = 0.0
        try:
            norm_qty = float(row["quantity"]) if row["quantity"] is not None else 0.0
        except (TypeError, ValueError):
            pass
        if norm_qty == 0.0:
            continue

        res_type = row["type"] or ""
        measure_unit = row["measure_unit"] or ""
        if not measure_unit and res_type in _DEFAULT_UNITS:
            measure_unit = _DEFAULT_UNITS[res_type]

        res_name = row["name"] or ""
        if res_code == "2" and (not res_name or res_name == "2"):
            res_name = "Затраты труда машинистов"

        total_qty = round(norm_qty * work_quantity, 6)

        # Look up price
        price_info = price_map.get(res_code)
        unit_price = 0.0
        price_found = False
        if price_info:
            unit_price = price_info.get("price", 0.0) or 0.0
            price_found = True

        total_price = round(total_qty * unit_price * FSSC_INDEX_2025, 2)

        lines.append(
            ResourceLine(
                resource_code=res_code,
                name=res_name,
                resource_type=res_type,
                measure_unit=measure_unit,
                norm_quantity=norm_qty,
                total_quantity=total_qty,
                unit_price=unit_price,
                total_price=total_price,
                price_found=price_found,
            )
        )

    return lines


def _bulk_lookup_prices(
    codes: list[str], cursor: sqlite3.Cursor
) -> dict[str, dict]:
    """Look up prices for multiple resource codes at once."""
    if not codes:
        return {}
    # Deduplicate
    unique = list(set(codes))
    result: dict[str, dict] = {}
    # SQLite has a limit on variables; batch if needed
    batch_size = 500
    for i in range(0, len(unique), batch_size):
        batch = unique[i : i + batch_size]
        placeholders = ",".join("?" * len(batch))
        try:
            cursor.execute(
                f"SELECT code, price, price_opt, type FROM resource_prices WHERE code IN ({placeholders})",
                batch,
            )
            for row in cursor.fetchall():
                result[row["code"]] = {
                    "price": row["price"],
                    "price_opt": row["price_opt"],
                    "type": row["type"],
                }
        except sqlite3.OperationalError:
            pass
    return result
