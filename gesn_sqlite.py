"""GesnSqliteProvider -- wraps gesn.db as a PriceProvider.

Reuses the proven SQL patterns from ``vor.matcher`` (keyword
search, stemming, unit scoring) and ``vor.pricer`` (FER lookup,
resource fetch, bulk price lookup).
"""

from __future__ import annotations

import asyncio
import logging
import re
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

from vor.matcher import (
    _score_unit_compatibility,
    _stem_russian,
    _STOP_WORDS,
    _UNIT_ALIASES,
    _UNIT_COMPATIBLE,
)
from vor.providers.base import (
    NormCandidate,
    PriceProvider,
    PriceRecord,
    ProviderMetadata,
    ResourceRecord,
)

# Default measure units by resource type (from pricer.py).
_DEFAULT_UNITS: dict[str, str] = {
    "labor": "чел.-ч",
    "labor_operator": "чел.-ч",
    "machinery": "маш.-ч",
}


# ---------------------------------------------------------------------------
# GesnSqliteProvider
# ---------------------------------------------------------------------------


class GesnSqliteProvider(PriceProvider):
    """Price provider backed by the GESN/FER SQLite database.

    Parameters
    ----------
    db_path:
        Path to ``gesn.db``.
    provider_name:
        Human-readable name (default ``"GESN/FER SQLite"``).
    """

    def __init__(self, db_path: str | Path, *, provider_name: str = "GESN/FER SQLite") -> None:
        self._db_path = str(db_path)
        self._provider_name = provider_name

        # Support SQLite URI strings (e.g. "file:...?mode=memory&cache=shared")
        # used in tests.  For normal file paths, verify existence eagerly.
        self._is_uri = self._db_path.startswith("file:")
        if not self._is_uri and not Path(self._db_path).is_file():
            raise FileNotFoundError(f"GESN database not found: {self._db_path}")

    # ------------------------------------------------------------------
    # Internal: connection helper
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        if self._is_uri:
            conn = sqlite3.connect(self._db_path, uri=True)
        else:
            conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # PriceProvider.search_norms
    # ------------------------------------------------------------------

    async def search_norms(
        self,
        query: str,
        *,
        collection: str = "",
        unit: str = "",
        limit: int = 10,
    ) -> list[NormCandidate]:
        """Keyword search over the ``works`` table.

        Uses the same stemming + LIKE approach as ``matcher._keyword_search``.
        """

        def _search_sync() -> list[NormCandidate]:
            # Tokenise and stem.
            raw_words = re.findall(r"[а-яёА-ЯЁa-zA-Z0-9]+", query)
            stems: list[str] = []
            for w in raw_words:
                low = w.lower()
                if low in _STOP_WORDS or len(low) < 3:
                    continue
                stems.append(_stem_russian(low))

            if not stems:
                return []

            # Build LIKE clauses -- match rows containing *any* stem.
            like_clauses = " OR ".join(["w.name LIKE ?"] * len(stems))
            params: list[str] = [f"%{s}%" for s in stems]

            # Optional collection filter.
            collection_filter = ""
            if collection:
                collection_filter = "AND w.code LIKE ?"
                params.append(f"{collection}%")

            sql = f"""
                SELECT DISTINCT w.code, w.name, w.measure_unit
                FROM works w
                WHERE w.name != '' AND ({like_clauses})
                {collection_filter}
                LIMIT 200
            """

            conn = self._connect()
            try:
                cursor = conn.cursor()
                cursor.execute(sql, params)
                rows = cursor.fetchall()
            finally:
                conn.close()

            if not rows:
                return []

            # Score each candidate (same as matcher._keyword_search).
            scored: list[NormCandidate] = []
            for row in rows:
                row_name_lower = (row["name"] or "").lower()
                hits = sum(1 for s in stems if s in row_name_lower)
                keyword_score = hits / len(stems) if stems else 0.0

                row_unit = row["measure_unit"] or ""

                unit_score = _score_unit_compatibility(unit, row_unit) if unit else 0.0

                # Combined score: 70% keyword overlap + 30% unit compatibility.
                combined = 0.7 * keyword_score + 0.3 * unit_score

                # Unit filter: skip incompatible if an explicit unit was requested.
                if unit and unit_score == 0.0:
                    # Still include but with lower score -- the caller can decide.
                    pass

                code = row["code"] or ""
                scored.append(
                    NormCandidate(
                        code=code,
                        name=row["name"] or "",
                        unit=row_unit,
                        collection=code[:2] if len(code) >= 2 else code,
                        score=round(combined, 4),
                        source=self._provider_name,
                    )
                )

            # Sort descending by score, then alphabetically by code.
            scored.sort(key=lambda c: (-c.score, c.code))
            return scored[:limit]

        return await asyncio.to_thread(_search_sync)

    # ------------------------------------------------------------------
    # PriceProvider.get_price
    # ------------------------------------------------------------------

    async def get_price(self, norm_code: str) -> PriceRecord | None:
        """Look up FER price breakdown for a GESN code.

        Same SQL as ``pricer._lookup_fer_price``.
        """

        def _get_price_sync() -> PriceRecord | None:
            conn = self._connect()
            try:
                cursor = conn.cursor()

                # Fetch work name and unit.
                cursor.execute(
                    "SELECT name, measure_unit FROM works WHERE code = ? LIMIT 1",
                    (norm_code,),
                )
                work_row = cursor.fetchone()
                work_name = (work_row["name"] or "") if work_row else ""
                work_unit = (work_row["measure_unit"] or "") if work_row else ""

                # Fetch FER price.
                cursor.execute(
                    """
                    SELECT direct_cost, labor_cost, machinery_cost,
                           operator_labor_cost, materials_cost, labor_hours
                    FROM fer_prices
                    WHERE code = ?
                    LIMIT 1
                    """,
                    (norm_code,),
                )
                row = cursor.fetchone()
            finally:
                conn.close()

            if row is None:
                return None

            return PriceRecord(
                code=norm_code,
                name=work_name,
                unit=work_unit,
                direct_cost=row["direct_cost"] or 0.0,
                labor_cost=row["labor_cost"] or 0.0,
                machinery_cost=row["machinery_cost"] or 0.0,
                materials_cost=row["materials_cost"] or 0.0,
                price_year=2022,
                price_region="",
                source=self._provider_name,
            )

        return await asyncio.to_thread(_get_price_sync)

    # ------------------------------------------------------------------
    # PriceProvider.get_price_by_prefix
    # ------------------------------------------------------------------

    async def get_price_by_prefix(self, code_prefix: str) -> PriceRecord | None:
        """Find first FER price matching a code prefix (fuzzy fallback).

        Searches ``fer_prices`` for any code starting with *code_prefix*,
        ordered alphabetically so the result is deterministic.
        """

        def _get_price_by_prefix_sync() -> PriceRecord | None:
            conn = self._connect()
            try:
                cursor = conn.cursor()

                # Look up the first FER price whose code starts with the prefix.
                cursor.execute(
                    """
                    SELECT fp.code, fp.direct_cost, fp.labor_cost,
                           fp.machinery_cost, fp.operator_labor_cost,
                           fp.materials_cost, fp.labor_hours
                    FROM fer_prices fp
                    WHERE fp.code LIKE ?
                    ORDER BY fp.code
                    LIMIT 1
                    """,
                    (code_prefix + "%",),
                )
                row = cursor.fetchone()
                if row is None:
                    return None

                matched_code = row["code"]

                # Fetch the work name and unit for this code.
                cursor.execute(
                    "SELECT name, measure_unit FROM works WHERE code = ? LIMIT 1",
                    (matched_code,),
                )
                work_row = cursor.fetchone()
                work_name = (work_row["name"] or "") if work_row else ""
                work_unit = (work_row["measure_unit"] or "") if work_row else ""

                return PriceRecord(
                    code=matched_code,
                    name=work_name,
                    unit=work_unit,
                    direct_cost=row["direct_cost"] or 0.0,
                    labor_cost=row["labor_cost"] or 0.0,
                    machinery_cost=row["machinery_cost"] or 0.0,
                    materials_cost=row["materials_cost"] or 0.0,
                    price_year=2022,
                    price_region="",
                    source=self._provider_name,
                )
            finally:
                conn.close()

        return await asyncio.to_thread(_get_price_by_prefix_sync)

    # ------------------------------------------------------------------
    # PriceProvider.get_resources
    # ------------------------------------------------------------------

    async def get_resources(
        self, norm_code: str, work_quantity: float = 1.0
    ) -> list[ResourceRecord]:
        """Look up resources for a GESN code, scale by *work_quantity*.

        Combines the logic of ``pricer._lookup_resources`` (fetch + filter)
        and ``pricer._bulk_lookup_prices`` (unit prices).
        """

        def _get_resources_sync() -> list[ResourceRecord]:
            conn = self._connect()
            try:
                cursor = conn.cursor()

                # Fetch resources (same SQL as pricer._lookup_resources).
                try:
                    cursor.execute(
                        """
                        SELECT r.code, r.name, r.type, r.measure_unit, r.quantity
                        FROM resources r
                        JOIN works w ON r.work_id = w.id
                        WHERE w.code = ?
                        ORDER BY r.id
                        """,
                        (norm_code,),
                    )
                    rows = cursor.fetchall()
                except sqlite3.OperationalError:
                    return []

                if not rows:
                    return []

                # Bulk-lookup resource prices (same as pricer._bulk_lookup_prices).
                codes = [r["code"] for r in rows if r["code"] and r["code"] != "1"]
                price_map = self._bulk_lookup_prices(codes, cursor)
            finally:
                conn.close()

            # Build ResourceRecord list (same filtering as pricer._lookup_resources).
            details: list[ResourceRecord] = []
            for row in rows:
                res_code = row["code"] or ""

                # Skip aggregate labor total (code "1").
                if res_code == "1":
                    continue

                norm_qty: float = 0.0
                try:
                    norm_qty = float(row["quantity"]) if row["quantity"] is not None else 0.0
                except (TypeError, ValueError):
                    norm_qty = 0.0

                if norm_qty == 0.0:
                    continue

                res_type = row["type"] or ""
                measure_unit = row["measure_unit"] or ""

                # Fill in default units for resources that lack them.
                if not measure_unit and res_type in _DEFAULT_UNITS:
                    measure_unit = _DEFAULT_UNITS[res_type]

                res_name = row["name"] or ""
                if res_code == "2" and (not res_name or res_name == "2"):
                    res_name = "Затраты труда машинистов"

                total_qty = round(norm_qty * work_quantity, 6)

                # Price info.
                price_info = price_map.get(res_code)
                unit_price: float | None = None
                total_price = 0.0
                price_found = False
                price_source = ""

                if price_info:
                    unit_price = price_info.get("price", 0.0) or 0.0
                    price_found = True
                    total_price = round(total_qty * unit_price, 2)
                    price_source = self._provider_name

                details.append(
                    ResourceRecord(
                        resource_code=res_code,
                        name=res_name,
                        resource_type=res_type,
                        unit=measure_unit,
                        norm_quantity=norm_qty,
                        total_quantity=total_qty,
                        unit_price=unit_price,
                        total_price=total_price,
                        price_found=price_found,
                        price_source=price_source,
                    )
                )

            return details

        return await asyncio.to_thread(_get_resources_sync)

    # ------------------------------------------------------------------
    # PriceProvider.metadata
    # ------------------------------------------------------------------

    def metadata(self) -> ProviderMetadata:
        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM works")
            work_count = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            work_count = 0
        finally:
            conn.close()

        return ProviderMetadata(
            name=self._provider_name,
            provider_type="gesn_sqlite",
            description=f"GESN/FER norms from {Path(self._db_path).name}",
            record_count=work_count,
        )

    # ------------------------------------------------------------------
    # PriceProvider.search_resources_by_name
    # ------------------------------------------------------------------

    # Sanity cap: skip resource prices above this threshold (rubles per unit).
    # Prevents absurd outliers from one bad DB match from polluting estimates.
    _MAX_UNIT_PRICE = 50_000_000  # 50 million rubles

    def search_resources_by_name(self, name: str, limit: int = 5) -> list[dict]:
        """Search resource_prices table by name substring match.

        Returns list of dicts with keys: code, name, price, measure_unit.
        Ordered by price DESC so highest-priced (most specific) match comes first.

        Prefers ``resource_prices.measure_unit`` (more complete) over
        ``resources.measure_unit`` via COALESCE.
        """
        if not name or not name.strip():
            return []

        conn = self._connect()
        try:
            cursor = conn.cursor()
            # Support multi-word queries: "клей газобетон" → LIKE '%клей%' AND LIKE '%газобетон%'
            terms = [t.strip() for t in name.strip().split() if t.strip()]
            if not terms:
                return []
            where_clauses = " AND ".join("LOWER(rp.name) LIKE ?" for _ in terms)
            params = [f"%{t.lower()}%" for t in terms] + [limit * 4]
            cursor.execute(
                f"""
                SELECT rp.code, rp.name, rp.price,
                       COALESCE(rp.measure_unit, r.measure_unit, '') as measure_unit
                FROM resource_prices rp
                LEFT JOIN resources r ON rp.code = r.code
                WHERE {where_clauses}
                ORDER BY rp.price DESC
                LIMIT ?
                """,
                params,
            )
            results: list[dict] = []
            seen_codes: set[str] = set()
            for row in cursor.fetchall():
                code = row["code"] or ""
                if code in seen_codes:
                    continue
                seen_codes.add(code)

                price = row["price"] or 0.0

                # Sanity cap: skip absurdly high prices.
                if price > self._MAX_UNIT_PRICE:
                    logger.warning(
                        "search_resources_by_name: skipping %s (price=%.2f > %.0f cap)",
                        code, price, self._MAX_UNIT_PRICE,
                    )
                    continue

                results.append({
                    "code": code,
                    "name": row["name"] or "",
                    "price": price,
                    "measure_unit": row["measure_unit"] or "",
                })
                if len(results) >= limit:
                    break
            return results
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Internal: bulk price lookup (from pricer._bulk_lookup_prices)
    # ------------------------------------------------------------------

    @staticmethod
    def _bulk_lookup_prices(
        codes: list[str], cursor: sqlite3.Cursor
    ) -> dict[str, dict]:
        """Look up prices for multiple resource codes at once."""
        if not codes:
            return {}
        unique = list(set(codes))
        result: dict[str, dict] = {}
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
