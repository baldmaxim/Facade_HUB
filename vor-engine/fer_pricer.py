"""FER-based pricing engine for VOR V6.

Correct method learned through 4 iterations:
1. Match ГЭСН code for VOR position
2. Get FER price (direct_cost × FER_INDEX = full work cost per unit)
3. Get unaccounted materials from resources table (type='material_unaccounted')
4. Price unaccounted materials from resource_prices or market prices
5. Total = FER work cost + unaccounted materials cost
6. Check against benchmark

Key insights:
- FER already includes labor + machinery + accounted materials
- Unaccounted materials (бетон, блоки, трубы, раствор) must be added separately
- ГЭСН units like "100 м2", "1000 м3" require dividing quantity
- One VOR line may need multiple ГЭСН codes (complex works)
- NO FALLBACK PRICES — if not found, mark as NOT_FOUND
"""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("vor_agent.fer_pricer")

_DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "gesn.db"

# FER index: direct_cost × 2.12 = full cost (inflation 1.18 × overhead 1.8)
FER_INDEX = 2.12
# Resource price index: price × 1.18 = current price (inflation only)
RES_INDEX = 1.18
# Standard labor rate
LABOR_RATE = 873.0


@dataclass
class PricedResource:
    code: str
    name: str
    type: str  # material_unaccounted, material, machinery, labor
    unit: str
    norm_qty: float  # per unit of ГЭСН work
    total_qty: float  # norm_qty × gesn_quantity
    unit_price_2025: float
    line_total: float
    price_source: str  # "ФССЦ", "ФЕР", "NOT_FOUND"


@dataclass
class PricedGesn:
    code: str
    name: str
    gesn_unit: str
    gesn_multiplier: float  # 100 for "100 м2", 1000 for "1000 м3", 1 otherwise
    gesn_quantity: float  # VOR qty / multiplier
    fer_direct_cost: float  # base price per ГЭСН unit
    fer_price_2025: float  # fer_direct_cost × FER_INDEX
    fer_total: float  # fer_price_2025 × gesn_quantity
    unaccounted: list[PricedResource] = field(default_factory=list)
    unaccounted_total: float = 0.0


@dataclass
class PricedVorPosition:
    vor_idx: int
    vor_name: str
    vor_unit: str
    vor_qty: float
    gesn_items: list[PricedGesn] = field(default_factory=list)
    extra_materials: list[PricedResource] = field(default_factory=list)
    total_work: float = 0.0  # sum of FER costs
    total_materials: float = 0.0  # sum of unaccounted + extra
    total: float = 0.0
    per_unit: float = 0.0
    benchmark_status: str = ""  # OK, LOW, HIGH, NO_BENCHMARK
    benchmark_range: str = ""
    not_found_count: int = 0
    reasoning: str = ""


class FerPricer:
    """Prices VOR positions using FER method + unaccounted materials."""

    def __init__(self, db_path: str | Path | None = None):
        self.db_path = str(db_path or _DB_PATH)
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

    # ── Main entry point ─────────────────────────────────────────

    def price_position(
        self,
        vor_idx: int,
        vor_name: str,
        vor_unit: str,
        vor_qty: float,
        gesn_codes: list[tuple[str, float]],
        extra_materials: list[tuple[str, str, float, float]] | None = None,
    ) -> PricedVorPosition:
        """Price a VOR position with given ГЭСН codes.

        Args:
            vor_idx: VOR row index
            vor_name: Position description
            vor_unit: VOR unit (м2, м3, шт, etc.)
            vor_qty: VOR quantity
            gesn_codes: List of (gesn_code, quantity_in_vor_units).
                        The pricer handles unit conversion internally.
            extra_materials: Optional list of (name, unit, qty, unit_price_2025)
                           for materials not in ГЭСН composition.

        Returns:
            PricedVorPosition with full breakdown.
        """
        result = PricedVorPosition(
            vor_idx=vor_idx, vor_name=vor_name,
            vor_unit=vor_unit, vor_qty=vor_qty,
        )

        for gesn_code, qty_raw in gesn_codes:
            pg = self._price_gesn(gesn_code, qty_raw)
            if pg:
                result.gesn_items.append(pg)
                result.total_work += pg.fer_total
                result.total_materials += pg.unaccounted_total
                result.not_found_count += sum(
                    1 for u in pg.unaccounted if u.price_source == "NOT_FOUND"
                )

        if extra_materials:
            for name, unit, qty, price in extra_materials:
                pr = PricedResource(
                    code="", name=name, type="extra_material",
                    unit=unit, norm_qty=0, total_qty=qty,
                    unit_price_2025=price, line_total=round(qty * price, 2),
                    price_source="market",
                )
                result.extra_materials.append(pr)
                result.total_materials += pr.line_total

        result.total = round(result.total_work + result.total_materials, 2)
        result.per_unit = round(result.total / vor_qty, 2) if vor_qty > 0 else 0

        return result

    # ── ГЭСН pricing ────────────────────────────────────────────

    def _price_gesn(self, code: str, qty_raw: float) -> PricedGesn | None:
        """Price a single ГЭСН code."""
        cur = self.conn.cursor()

        # Get work info
        cur.execute(
            "SELECT name, measure_unit FROM works WHERE code = ?", (code,)
        )
        work = cur.fetchone()
        if not work:
            logger.warning("ГЭСН code not found: %s", code)
            return None

        gesn_unit = work["measure_unit"] or ""
        multiplier = self._extract_multiplier(gesn_unit)
        gesn_qty = qty_raw / multiplier if multiplier > 0 else qty_raw

        # Get FER price
        cur.execute(
            "SELECT direct_cost FROM fer_prices WHERE code = ? AND direct_cost > 0",
            (code,),
        )
        fer = cur.fetchone()
        fer_dc = fer["direct_cost"] if fer else 0
        fer_2025 = round(fer_dc * FER_INDEX, 2)
        fer_total = round(fer_2025 * gesn_qty, 2)

        pg = PricedGesn(
            code=code, name=work["name"] or "",
            gesn_unit=gesn_unit, gesn_multiplier=multiplier,
            gesn_quantity=round(gesn_qty, 4),
            fer_direct_cost=fer_dc, fer_price_2025=fer_2025,
            fer_total=fer_total,
        )

        # Get unaccounted materials
        cur.execute("""
            SELECT r.code, r.name, r.measure_unit, r.quantity
            FROM resources r
            JOIN works w ON r.work_id = w.id
            WHERE w.code = ? AND r.type = 'material_unaccounted'
        """, (code,))

        for row in cur.fetchall():
            rcode = row["code"] or ""
            rname = row["name"] or ""
            runit = row["measure_unit"] or ""
            norm_qty = row["quantity"] or 0
            total_qty = round(norm_qty * gesn_qty, 4)

            # Look up price
            price_2025, source = self._get_resource_price(rcode)

            line_total = round(total_qty * price_2025, 2) if price_2025 > 0 else 0

            pg.unaccounted.append(PricedResource(
                code=rcode, name=rname, type="material_unaccounted",
                unit=runit, norm_qty=norm_qty, total_qty=total_qty,
                unit_price_2025=price_2025, line_total=line_total,
                price_source=source,
            ))
            pg.unaccounted_total += line_total

        return pg

    # ── Resource price lookup ────────────────────────────────────

    def _get_resource_price(self, code: str) -> tuple[float, str]:
        """Get price for a resource code. Returns (price_2025, source).

        Uses exact match first, then prefix match (ГЭСН resource codes
        are group codes like '05.2.02.09' while ФССЦ uses specific codes
        like '05.2.02.09-0011').
        """
        if not code or code in ("1", "2"):
            return 0, "NOT_FOUND"

        cur = self.conn.cursor()

        # Try exact match first
        cur.execute(
            "SELECT price, measure_unit FROM resource_prices WHERE code = ? AND price > 0",
            (code,),
        )
        row = cur.fetchone()
        if row:
            raw_unit = row["measure_unit"] or ""
            mult = self._extract_multiplier(raw_unit)
            price = row["price"] / mult * RES_INDEX
            return round(price, 2), "ФССЦ"

        # Prefix match: '05.2.02.09' matches '05.2.02.09-0011'
        if len(code) >= 6:
            cur.execute(
                "SELECT price, measure_unit FROM resource_prices WHERE code LIKE ? AND price > 0 ORDER BY price LIMIT 1",
                (code + "%",),
            )
            row = cur.fetchone()
            if row:
                raw_unit = row["measure_unit"] or ""
                mult = self._extract_multiplier(raw_unit)
                price = row["price"] / mult * RES_INDEX
                return round(price, 2), "ФССЦ-prefix"

        return 0, "NOT_FOUND"

    # ── Search helpers ───────────────────────────────────────────

    def search_gesn(self, query: str, collection: str | None = None, limit: int = 10) -> list[dict]:
        """Search ГЭСН codes by keywords."""
        cur = self.conn.cursor()
        words = [w.strip().lower() for w in query.split() if len(w.strip()) >= 3]
        if not words:
            return []

        params = [f"%{words[0]}%"]
        where = "LOWER(w.name) LIKE ?"
        if collection:
            where += " AND w.collection_code = ?"
            params.append(collection)

        score_cases = []
        for word in words:
            score_cases.append("(CASE WHEN LOWER(w.name) LIKE ? THEN 1 ELSE 0 END)")
            params.append(f"%{word}%")
        score = " + ".join(score_cases)

        sql = f"""
            SELECT w.code, w.name, w.measure_unit, w.collection_code,
                   COALESCE(fp.direct_cost, 0) as fer_cost,
                   ({score}) as sc
            FROM works w
            LEFT JOIN fer_prices fp ON w.code = fp.code
            WHERE {where}
            ORDER BY sc DESC, fer_cost DESC, w.code
            LIMIT ?
        """
        params.append(limit)
        cur.execute(sql, params)

        return [
            {
                "code": r["code"], "name": r["name"],
                "unit": r["measure_unit"] or "",
                "collection": r["collection_code"] or "",
                "fer_cost": r["fer_cost"],
                "fer_2025": round(r["fer_cost"] * FER_INDEX, 2),
            }
            for r in cur.fetchall()
        ]

    def search_resource_price(self, query: str, unit: str | None = None, limit: int = 5) -> list[dict]:
        """Search resource prices by name."""
        cur = self.conn.cursor()
        words = [w.strip().lower() for w in query.split() if len(w.strip()) >= 3]
        if not words:
            return []

        params = [f"%{words[0]}%"]
        where = "LOWER(rp.name) LIKE ?"
        if unit:
            where += " AND LOWER(rp.measure_unit) LIKE ?"
            params.append(f"%{unit.lower()}%")

        score_cases = []
        for w in words:
            score_cases.append("(CASE WHEN LOWER(rp.name) LIKE ? THEN 1 ELSE 0 END)")
            params.append(f"%{w}%")
        score = " + ".join(score_cases)

        sql = f"""
            SELECT rp.code, rp.name, rp.price, rp.measure_unit
            FROM resource_prices rp
            WHERE {where} AND rp.price > 0
            ORDER BY ({score}) DESC, rp.price
            LIMIT ?
        """
        params.append(limit)
        cur.execute(sql, params)

        results = []
        for r in cur.fetchall():
            raw = r["measure_unit"] or ""
            mult = self._extract_multiplier(raw)
            base_unit = re.sub(r"^\d+\s*", "", raw).strip()
            results.append({
                "code": r["code"], "name": r["name"],
                "price_2025": round(r["price"] / mult * RES_INDEX, 2),
                "unit": base_unit or raw,
            })
        return results

    # ── Helpers ──────────────────────────────────────────────────

    @staticmethod
    def _extract_multiplier(unit_str: str) -> float:
        """Extract quantity multiplier: '100 м2' → 100, '1000 м3' → 1000."""
        if not unit_str:
            return 1.0
        m = re.match(r"^(\d+)\s+", unit_str.strip())
        return float(m.group(1)) if m else 1.0
