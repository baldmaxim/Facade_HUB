"""CsvPriceProvider — loads prices from a CSV file.

Useful for overrides, supplementary price lists, or testing.  The CSV
is read into memory once on construction; no async I/O is required
at query time.
"""

from __future__ import annotations

import csv
import os
from pathlib import Path

from vor.providers.base import (
    NormCandidate,
    PriceProvider,
    PriceRecord,
    ProviderMetadata,
    ResourceRecord,
)


class CsvPriceProvider(PriceProvider):
    """Provider backed by a single CSV file.

    Expected columns (case-insensitive header):

    Required:
        code, name, unit, direct_cost

    Optional:
        labor_cost, machinery_cost, materials_cost,
        price_year, price_region, source
    """

    def __init__(self, csv_path: str) -> None:
        self._path = Path(csv_path)
        if not self._path.is_file():
            raise FileNotFoundError(f"CSV file not found: {csv_path}")

        # code -> dict of row values
        self._rows: dict[str, dict[str, str]] = {}
        self._load()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load(self) -> None:
        with open(self._path, encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            if reader.fieldnames is None:
                return
            # Normalize header names to lowercase
            reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]
            for row in reader:
                # Normalize keys to lowercase
                row = {k.strip().lower(): v.strip() for k, v in row.items()}
                code = row.get("code", "").strip()
                if code:
                    self._rows[code] = row

    @staticmethod
    def _float(value: str, default: float = 0.0) -> float:
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _int(value: str, default: int = 0) -> int:
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    def _collection_of(self, code: str) -> str:
        """Return the first 2 characters of *code* (the collection prefix)."""
        return code[:2] if len(code) >= 2 else code

    # ------------------------------------------------------------------
    # PriceProvider interface
    # ------------------------------------------------------------------

    async def search_norms(
        self,
        query: str,
        *,
        collection: str = "",
        unit: str = "",
        limit: int = 10,
    ) -> list[NormCandidate]:
        query_words = query.lower().split()
        if not query_words:
            return []

        results: list[NormCandidate] = []
        for code, row in self._rows.items():
            # Collection filter
            if collection and not code.startswith(collection):
                continue

            # Unit filter
            row_unit = row.get("unit", "")
            if unit and row_unit.lower() != unit.lower():
                continue

            # Keyword matching
            name_lower = row.get("name", "").lower()
            matched = sum(1 for w in query_words if w in name_lower)
            if matched == 0:
                continue

            score = matched / len(query_words)
            results.append(
                NormCandidate(
                    code=code,
                    name=row.get("name", ""),
                    unit=row_unit,
                    collection=self._collection_of(code),
                    score=score,
                    source=f"csv:{self._path.name}",
                )
            )

        results.sort(key=lambda c: c.score, reverse=True)
        return results[:limit]

    async def get_price(self, norm_code: str) -> PriceRecord | None:
        row = self._rows.get(norm_code)
        if row is None:
            return None

        return PriceRecord(
            code=norm_code,
            name=row.get("name", ""),
            unit=row.get("unit", ""),
            direct_cost=self._float(row.get("direct_cost", "")),
            labor_cost=self._float(row.get("labor_cost", "")),
            machinery_cost=self._float(row.get("machinery_cost", "")),
            materials_cost=self._float(row.get("materials_cost", "")),
            price_year=self._int(row.get("price_year", ""), default=2000),
            price_region=row.get("price_region", ""),
            source=row.get("source", f"csv:{self._path.name}"),
        )

    async def get_resources(
        self, norm_code: str, work_quantity: float = 1.0
    ) -> list[ResourceRecord]:
        """CSV files do not contain resource breakdowns.

        Resource data requires a structured database (GESN/FER SQLite).
        Use CompositeProvider to combine CSV prices with a GESN provider
        that supplies resource breakdowns.
        """
        return []

    def metadata(self) -> ProviderMetadata:
        return ProviderMetadata(
            name=f"CSV: {self._path.name}",
            provider_type="csv",
            description=f"CSV price list loaded from {self._path}",
            record_count=len(self._rows),
        )
