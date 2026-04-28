"""Base classes and data types for price providers.

Every concrete provider (GESN SQLite, CSV, composite, etc.) implements the
PriceProvider ABC defined here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data classes returned by providers
# ---------------------------------------------------------------------------


@dataclass
class NormCandidate:
    """A norm (GESN/FER code) found during search."""

    code: str  # e.g. "08-02-001-01"
    name: str  # Human-readable description
    unit: str  # e.g. "м³", "100 м²"
    collection: str  # e.g. "08" — first 2 digits
    score: float = 0.0  # Relevance score 0..1
    source: str = ""  # Which provider returned this


@dataclass
class PriceRecord:
    """Pricing data for a single norm code."""

    code: str
    name: str
    unit: str
    direct_cost: float  # Total direct cost per unit
    labor_cost: float = 0.0
    machinery_cost: float = 0.0
    materials_cost: float = 0.0
    price_year: int = 2022  # Base year of the price (ФСНБ-2022)
    price_region: str = ""  # Region code / name
    source: str = ""  # Which provider returned this


@dataclass
class ResourceRecord:
    """A single resource line from a norm."""

    resource_code: str
    name: str
    resource_type: str  # "labor", "machinery", "material"
    unit: str
    norm_quantity: float  # Per unit of work
    total_quantity: float = 0.0  # norm_quantity * work_quantity
    unit_price: float | None = None
    total_price: float = 0.0
    price_found: bool = False
    price_source: str = ""


@dataclass
class ProviderMetadata:
    """Descriptive metadata about a provider instance."""

    name: str
    provider_type: str
    description: str = ""
    record_count: int = 0
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Abstract base class
# ---------------------------------------------------------------------------


class PriceProvider(ABC):
    """Abstract base for all price-data providers."""

    @abstractmethod
    async def search_norms(
        self,
        query: str,
        *,
        collection: str = "",
        unit: str = "",
        limit: int = 10,
    ) -> list[NormCandidate]:
        """Search for norms matching *query*.

        Parameters
        ----------
        query:
            Free-text search string (Russian).
        collection:
            If non-empty, restrict to norms whose code starts with this
            prefix (e.g. ``"08"``).
        unit:
            If non-empty, filter by measurement unit.
        limit:
            Maximum number of results to return.
        """

    @abstractmethod
    async def get_price(self, norm_code: str) -> PriceRecord | None:
        """Return pricing data for an exact *norm_code*, or ``None``."""

    async def get_price_by_prefix(self, code_prefix: str) -> PriceRecord | None:
        """Find first FER price matching a code prefix (fallback lookup).

        Default implementation returns ``None``.  Concrete providers may
        override to support prefix-based fuzzy matching.
        """
        return None

    @abstractmethod
    async def get_resources(
        self, norm_code: str, work_quantity: float = 1.0
    ) -> list[ResourceRecord]:
        """Return resource breakdown for *norm_code*.

        *work_quantity* is used to calculate ``total_quantity`` on each
        resource line.
        """

    def search_resources_by_name(self, name: str, limit: int = 5) -> list[dict]:
        """Search resource_prices table by name substring match.

        Returns list of dicts with keys: code, name, price, measure_unit.
        Default implementation returns empty list.
        """
        return []

    @abstractmethod
    def metadata(self) -> ProviderMetadata:
        """Return descriptive metadata about this provider."""
