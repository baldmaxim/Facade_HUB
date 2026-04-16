"""Domain context builder — loads expert knowledge for each domain.

Each domain expert gets ~100K tokens of context:
- Full encyclopedia (1000-1700 lines)
- Relevant ГЭСН section names and codes
- Price range benchmarks
- Domain-specific rules and red flags
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

import yaml

logger = logging.getLogger("vor_agent.context")

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent  # .
_CONFIG_PATH = Path(__file__).resolve().parent.parent / "vor_config.yaml"


def load_domain_context(domain: str, db_path: str | Path | None = None) -> str:
    """Build full context string for a domain expert.

    Combines:
    1. Encyclopedia text (if available)
    2. ГЭСН sections and code catalog for this domain's collections
    3. Price range benchmarks from price_ranges.yaml
    4. Domain-specific supplements from config

    Returns a single string ready to insert into system prompt.
    Target: ~80-100K chars (~25-30K tokens).
    """
    parts = []

    # Load config
    config = {}
    if _CONFIG_PATH.exists():
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}

    expert_cfg = config.get("experts", {}).get(domain, {})

    # 1. Encyclopedia
    enc_text = _load_encyclopedia(expert_cfg)
    if enc_text:
        parts.append(f"# ЭНЦИКЛОПЕДИЯ: {domain.upper()}\n\n{enc_text}")

    # 2. ГЭСН catalog for this domain
    collections = expert_cfg.get("collections", [])
    if collections:
        db = db_path or (_PROJECT_ROOT / "data" / "gesn.db")
        catalog = _load_gesn_catalog(str(db), collections)
        if catalog:
            parts.append(f"# КАТАЛОГ ГЭСН (сборники: {', '.join(collections)})\n\n{catalog}")

    # 3. Price ranges
    ranges_text = _load_price_ranges(domain)
    if ranges_text:
        parts.append(f"# ЦЕНОВЫЕ ДИАПАЗОНЫ\n\n{ranges_text}")

    # 4. Domain supplements (waste defaults, keywords, etc.)
    supplements = expert_cfg.get("supplements", [])
    for supp_rel in supplements:
        supp_path = _PROJECT_ROOT / supp_rel
        if supp_path.exists():
            parts.append(supp_path.read_text(encoding="utf-8"))

    context = "\n\n---\n\n".join(parts)
    logger.info(
        "Domain context %s: %d chars (%d parts, enc=%d, catalog=%s)",
        domain, len(context), len(parts),
        len(enc_text) if enc_text else 0,
        "yes" if collections else "no",
    )
    return context


def _load_encyclopedia(expert_cfg: dict) -> str | None:
    """Load encyclopedia markdown file."""
    enc_rel = expert_cfg.get("encyclopedia", "")
    if not enc_rel:
        return None

    enc_path = _PROJECT_ROOT / enc_rel
    if not enc_path.exists():
        logger.warning("Encyclopedia not found: %s", enc_path)
        return None

    text = enc_path.read_text(encoding="utf-8")
    # Trim to 80K chars if too large
    if len(text) > 80000:
        text = text[:80000] + "\n\n[...обрезано до 80K символов...]"
    return text


def _load_gesn_catalog(db_path: str, collections: list[str]) -> str:
    """Load ГЭСН sections and work codes for given collections.

    Returns formatted text with section hierarchy and work codes.
    """
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    lines = []
    for coll_code in collections:
        # Get collection name
        cur.execute(
            "SELECT name FROM collections WHERE code = ?",
            (coll_code,),
        )
        coll_row = cur.fetchone()
        coll_name = coll_row[0] if coll_row else f"Сборник {coll_code}"

        lines.append(f"## Сборник {coll_code}: {coll_name}")
        lines.append("")

        # Get sections
        cur.execute("""
            SELECT s.code, s.name
            FROM sections s
            JOIN collections c ON s.collection_id = c.id
            WHERE c.code = ?
            ORDER BY s.code
        """, (coll_code,))

        for sec_row in cur.fetchall():
            sec_code, sec_name = sec_row
            lines.append(f"### {sec_code} {sec_name}")

            # Get works in this section (first 50 per section to control size)
            cur.execute("""
                SELECT w.code, w.name, w.measure_unit
                FROM works w
                WHERE w.section_id = (
                    SELECT s.id FROM sections s
                    JOIN collections c ON s.collection_id = c.id
                    WHERE c.code = ? AND s.code = ?
                    LIMIT 1
                )
                ORDER BY w.code
                LIMIT 50
            """, (coll_code, sec_code))

            for w_row in cur.fetchall():
                w_code, w_name, w_unit = w_row
                lines.append(f"- `{w_code}` {w_name} [{w_unit or ''}]")

            lines.append("")

    conn.close()

    text = "\n".join(lines)
    # Trim if too large
    if len(text) > 50000:
        text = text[:50000] + "\n\n[...каталог обрезан до 50K символов...]"
    return text


def _load_price_ranges(domain: str) -> str:
    """Load price ranges relevant to this domain."""
    ranges_path = Path(__file__).resolve().parent.parent / "price_ranges.yaml"
    if not ranges_path.exists():
        return ""

    with open(ranges_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    lines = []

    # Materials
    materials = data.get("materials", {})
    if materials:
        lines.append("## Диапазоны цен материалов")
        for name, info in materials.items():
            unit = info.get("unit", "")
            min_p = info.get("min", "?")
            max_p = info.get("max", "?")
            lines.append(f"- {name}: {min_p}-{max_p} руб/{unit}")

    # Works
    works = data.get("works", {})
    if works:
        lines.append("\n## Диапазоны цен работ")
        for name, info in works.items():
            unit = info.get("unit", "")
            min_p = info.get("min", "?")
            max_p = info.get("max", "?")
            lines.append(f"- {name}: {min_p}-{max_p} руб/{unit}")

    # Position totals
    totals = data.get("position_totals", {})
    if totals:
        lines.append("\n## Бенчмарки итогов позиций")
        for name, info in totals.items():
            unit = info.get("unit", "")
            min_p = info.get("min", "?")
            max_p = info.get("max", "?")
            lines.append(f"- {name}: {min_p}-{max_p} руб/{unit}")

    return "\n".join(lines)
