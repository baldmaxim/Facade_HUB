"""CompositeProvider — merges results from multiple PriceProviders.

Providers are tried in priority order (first = highest priority).
"""

from __future__ import annotations

import asyncio

from vor.providers.base import (
    NormCandidate,
    PriceProvider,
    PriceRecord,
    ProviderMetadata,
    ResourceRecord,
)


class CompositeProvider(PriceProvider):
    """Combines multiple :class:`PriceProvider` instances.

    *providers* is an ordered list — the first entry has the highest
    priority for ``get_price`` / ``get_resources`` lookups.  For
    ``search_norms``, all providers are queried in parallel, and results
    are merged (de-duplicated by code, keeping the highest score).
    """

    def __init__(self, providers: list[PriceProvider]) -> None:
        if not providers:
            raise ValueError("CompositeProvider requires at least one provider")
        self._providers = list(providers)

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
        # Query all providers concurrently.
        tasks = [
            p.search_norms(query, collection=collection, unit=unit, limit=limit)
            for p in self._providers
        ]
        all_results = await asyncio.gather(*tasks)

        # Merge: deduplicate by code, keep highest score.
        best: dict[str, NormCandidate] = {}
        for candidates in all_results:
            for c in candidates:
                existing = best.get(c.code)
                if existing is None or c.score > existing.score:
                    best[c.code] = c

        merged = sorted(best.values(), key=lambda c: c.score, reverse=True)
        return merged[:limit]

    async def get_price(self, norm_code: str) -> PriceRecord | None:
        # Try providers in priority order; return the first hit.
        for provider in self._providers:
            result = await provider.get_price(norm_code)
            if result is not None:
                return result
        return None

    async def get_resources(
        self, norm_code: str, work_quantity: float = 1.0
    ) -> list[ResourceRecord]:
        # Try providers in priority order; return the first non-empty list.
        for provider in self._providers:
            result = await provider.get_resources(norm_code, work_quantity)
            if result:
                return result
        return []

    def metadata(self) -> ProviderMetadata:
        children = [p.metadata() for p in self._providers]
        names = [m.name for m in children]
        total_records = sum(m.record_count for m in children)
        return ProviderMetadata(
            name="Composite",
            provider_type="composite",
            description=f"Composite of {len(children)} providers: {', '.join(names)}",
            record_count=total_records,
            extra={"children": [m.__dict__ for m in children]},
        )
