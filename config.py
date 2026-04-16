"""VOR configuration loading and provider factory.

Configuration is read from a YAML file (``vor_config.yaml``) and converted
into typed dataclasses.  The module also contains a factory function that
instantiates :class:`PriceProvider` objects from their config dicts.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from vor.providers.base import PriceProvider


# ---------------------------------------------------------------------------
# Config dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ExpertConfig:
    """Configuration for a single domain expert agent."""

    domain: str
    collections: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    encyclopedia: str = ""
    supplements: list[str] = field(default_factory=list)
    waste_defaults: dict[str, float] = field(default_factory=dict)


@dataclass
class VorConfig:
    """Top-level VOR pricing configuration."""

    providers: list[dict[str, Any]] = field(default_factory=list)
    experts: dict[str, ExpertConfig] = field(default_factory=dict)
    llm: dict[str, Any] = field(default_factory=dict)
    settings: dict[str, Any] = field(default_factory=dict)

    # -- Convenience properties for common settings -----------------------

    @property
    def tender_markup(self) -> float:
        return self.settings.get("tender_markup", 1.15)

    @property
    def confidence_green(self) -> float:
        thresholds = self.settings.get("confidence_thresholds", {})
        return thresholds.get("green", 0.70)

    @property
    def confidence_yellow(self) -> float:
        thresholds = self.settings.get("confidence_thresholds", {})
        return thresholds.get("yellow", 0.40)

    @property
    def encyclopedia_max_chars(self) -> int:
        return self.settings.get("encyclopedia_max_chars", 12000)

    @property
    def max_parallel_experts(self) -> int:
        return self.settings.get("max_parallel_experts", 6)

    @property
    def active_domains(self) -> list[str]:
        """List of domain names to run. Empty = all domains active."""
        return self.settings.get("active_domains", [])

    @property
    def output_format(self) -> str:
        return self.settings.get("output_format", "v3")


# ---------------------------------------------------------------------------
# Loading helpers
# ---------------------------------------------------------------------------


def _parse_expert(data: dict[str, Any]) -> ExpertConfig:
    """Convert a raw YAML dict into an :class:`ExpertConfig`."""
    return ExpertConfig(
        domain=data.get("domain", ""),
        collections=data.get("collections", []),
        keywords=data.get("keywords", []),
        encyclopedia=data.get("encyclopedia", ""),
        supplements=data.get("supplements", []),
        waste_defaults=data.get("waste_defaults", {}),
    )


def load_config(config_path: str | Path | None = None) -> VorConfig:
    """Load VOR configuration from a YAML file.

    Search order when *config_path* is ``None``:

    1. ``./vor_config.yaml``
    2. ``vor/vor_config.yaml``  (relative to cwd)
    3. The ``vor_config.yaml`` bundled next to this module.
    4. Fall back to :func:`default_config`.
    """
    path: Path | None = None

    if config_path is not None:
        path = Path(config_path)
        if not path.is_file():
            raise FileNotFoundError(f"Config file not found: {config_path}")
    else:
        candidates = [
            Path("vor_config.yaml"),
            Path("vor/vor_config.yaml"),
            Path(__file__).with_name("vor_config.yaml"),
        ]
        for candidate in candidates:
            if candidate.is_file():
                path = candidate
                break

    if path is None:
        return default_config()

    with open(path, encoding="utf-8") as fh:
        raw: dict = yaml.safe_load(fh) or {}

    # Parse experts
    experts: dict[str, ExpertConfig] = {}
    for key, expert_data in raw.get("experts", {}).items():
        if isinstance(expert_data, dict):
            experts[key] = _parse_expert(expert_data)

    return VorConfig(
        providers=raw.get("providers", []),
        experts=experts,
        llm=raw.get("llm", {}),
        settings=raw.get("settings", {}),
    )


def default_config() -> VorConfig:
    """Return sensible defaults without any YAML file.

    Includes the GESN SQLite provider and all 6 standard domain experts.
    """
    providers = [
        {
            "type": "gesn_sqlite",
            "path": "data/gesn.db",
        },
    ]

    experts = {
        "masonry": ExpertConfig(
            domain="masonry",
            collections=["08"],
            keywords=["кладк", "кирпич", "газобетон", "газосиликат", "блок", "ПГП", "перегородк"],
            encyclopedia="skills/kladka-expert/ENCYCLOPEDIA_FINAL.md",
            supplements=["skills/kladka-expert/vor_parsing_rules.md"],
            waste_defaults={"кирпич": 0.03, "газобетон": 0.03, "раствор": 0.02},
        ),
        "concrete": ExpertConfig(
            domain="concrete",
            collections=["06", "07"],
            keywords=["бетон", "монолит", "ж/б", "железобетон", "арматур", "опалуб", "фундамент", "свай"],
            encyclopedia="skills/monolit-expert/ENCYCLOPEDIA_MONOLIT.md",
            waste_defaults={"бетон": 0.02, "арматура": 0.08},
        ),
        "electrical": ExpertConfig(
            domain="electrical",
            collections=["21", "33"],
            keywords=["электр", "кабел", "провод", "щит", "автомат", "розетк", "освещ"],
            encyclopedia="skills/electro-expert/ENCYCLOPEDIA_ELECTRO.md",
        ),
        "facade": ExpertConfig(
            domain="facade",
            collections=["15", "26"],
            keywords=["фасад", "утеплен", "штукатур", "облицов", "навесн"],
            encyclopedia="skills/fasad-expert/ENCYCLOPEDIA_FASAD.md",
            waste_defaults={"утеплитель_минвата": 0.15, "утеплитель_xps": 0.04},
        ),
        "roofing": ExpertConfig(
            domain="roofing",
            collections=["12"],
            keywords=["кровл", "крыш", "водосток", "мембран"],
            encyclopedia="skills/krovlya-expert/ENCYCLOPEDIA_KROVLYA.md",
        ),
        "hvac": ExpertConfig(
            domain="hvac",
            collections=["16", "17", "18", "20"],
            keywords=["вентиляц", "отоплен", "кондиц", "водопровод", "канализац", "сантехн"],
            encyclopedia="skills/ovik-expert/ENCYCLOPEDIA_OVIK.md",
        ),
        "earthworks": ExpertConfig(
            domain="earthworks",
            collections=["01", "02"],
            keywords=["земляны", "грунт", "котлован", "траншея", "обратная засыпк"],
            encyclopedia="skills/zemlya-expert/ENCYCLOPEDIA_EARTHWORKS.md",
        ),
        "finishing": ExpertConfig(
            domain="finishing",
            collections=["15"],
            keywords=["отделоч", "малярн", "покраск", "обои", "плитк"],
            encyclopedia="skills/otdelka-expert/ENCYCLOPEDIA_FINISHING.md",
        ),
        "low_voltage": ExpertConfig(
            domain="low_voltage",
            collections=["33"],
            keywords=["слаботоч", "видеонаблюд", "скуд", "пожарная сигнал", "домофон"],
            encyclopedia="skills/slabotek-expert/ENCYCLOPEDIA_SLABOTEK.md",
        ),
        "doors": ExpertConfig(
            domain="doors",
            collections=[],
            keywords=["двер", "ворот", "люк", "витраж", "светопрозрачн"],
            encyclopedia="skills/dveri-expert/ENCYCLOPEDIA_DVERI.md",
        ),
        "landscaping": ExpertConfig(
            domain="landscaping",
            collections=[],
            keywords=["благоустр", "озелен", "газон", "дорожк", "площадк"],
            encyclopedia="skills/blagoustroistvo-expert/ENCYCLOPEDIA_BLAGOUSTROISTVO.md",
        ),
        "ext_networks": ExpertConfig(
            domain="ext_networks",
            collections=["23", "27"],
            keywords=["наружные сети", "наружный водопровод", "теплотрасс", "ливнёвк"],
            encyclopedia="skills/naruzhnye-seti-expert/ENCYCLOPEDIA_NARSETI.md",
        ),
    }

    settings: dict[str, Any] = {
        "active_domains": ["masonry", "concrete"],
        "tender_markup": 1.15,
        "confidence_thresholds": {"green": 0.70, "yellow": 0.40},
        "encyclopedia_max_chars": 12000,
        "max_parallel_experts": 6,
        "output_format": "v3",
    }

    return VorConfig(
        providers=providers,
        experts=experts,
        llm={"model": "openrouter/qwen/qwen3.6-plus:free"},
        settings=settings,
    )


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------


def create_provider_from_config(
    provider_cfg: dict[str, Any],
    project_root: Path | None = None,
) -> PriceProvider:
    """Instantiate a :class:`PriceProvider` from a config dict.

    Supported ``type`` values:

    * ``"gesn_sqlite"`` — requires ``path`` (to the ``.db`` file).
    * ``"csv"`` — requires ``path`` (to the ``.csv`` file).

    Relative paths are resolved against *project_root* (or cwd if
    *project_root* is ``None``).
    """
    ptype = provider_cfg.get("type", "")
    raw_path = provider_cfg.get("path", "")

    if project_root is None:
        project_root = Path.cwd()

    resolved = Path(raw_path)
    if not resolved.is_absolute():
        resolved = project_root / resolved

    if ptype == "gesn_sqlite":
        from vor.providers.gesn_sqlite import GesnSqliteProvider

        return GesnSqliteProvider(str(resolved))

    if ptype == "csv":
        from vor.providers.csv_provider import CsvPriceProvider

        return CsvPriceProvider(str(resolved))

    raise ValueError(f"Unknown provider type: {ptype!r}")
