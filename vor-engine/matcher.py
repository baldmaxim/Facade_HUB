"""GESN code matcher for VOR items.

Two matching strategies:
  A) Keyword search — stem Russian words and search ``works`` table with LIKE.
  B) Exact code extraction — pull an XX-XX-XXX-XX pattern from the item name.

For each VOR item the best match is returned as a ``GesnMatch`` with up to 5
ranked alternatives.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from vor.models import GesnMatch, VorItem

# ---------------------------------------------------------------------------
# Unit compatibility
# ---------------------------------------------------------------------------

# Canonical forms — every alias maps to one canonical key.
_UNIT_ALIASES: dict[str, str] = {
    "м³": "м3",
    "м3": "м3",
    "куб.м": "м3",
    "куб. м": "м3",
    "м²": "м2",
    "м2": "м2",
    "кв.м": "м2",
    "кв. м": "м2",
    "шт": "шт",
    "шт.": "шт",
    "штук": "шт",
    "штука": "шт",
    "т": "т",
    "тонна": "т",
    "тонн": "т",
    "м.п.": "м",
    "м": "м",
    "пог.м": "м",
    "пог. м": "м",
    "м.п": "м",
    "км": "км",
    "га": "га",
    "100 м2": "100 м2",
    "100 м²": "100 м2",
    "100 кв.м": "100 м2",
    "1000 м2": "1000 м2",
    "1000 м²": "1000 м2",
    "100 м3": "100 м3",
    "100 м³": "100 м3",
    "1000 м3": "1000 м3",
    "1000 м³": "1000 м3",
    "100 шт": "100 шт",
    "10 шт": "10 шт",
    "10 м": "10 м",
    "100 м": "100 м",
    "10 м3": "10 м3",
    "10 т": "10 т",
    "100 т": "100 т",
}

# Pairs that are compatible with a multiplier (but not identical).
_UNIT_COMPATIBLE: dict[tuple[str, str], float] = {
    ("м2", "100 м2"): 0.01,
    ("100 м2", "м2"): 100.0,
    ("м2", "1000 м2"): 0.001,
    ("1000 м2", "м2"): 1000.0,
    ("м3", "100 м3"): 0.01,
    ("100 м3", "м3"): 100.0,
    ("м3", "1000 м3"): 0.001,
    ("1000 м3", "м3"): 1000.0,
    ("м3", "10 м3"): 0.1,
    ("10 м3", "м3"): 10.0,
    ("шт", "100 шт"): 0.01,
    ("100 шт", "шт"): 100.0,
    ("шт", "10 шт"): 0.1,
    ("10 шт", "шт"): 10.0,
    ("м", "100 м"): 0.01,
    ("100 м", "м"): 100.0,
    ("м", "10 м"): 0.1,
    ("10 м", "м"): 10.0,
    ("м", "1000 м"): 0.001,
    ("1000 м", "м"): 1000.0,
    ("т", "10 т"): 0.1,
    ("10 т", "т"): 10.0,
    ("т", "100 т"): 0.01,
    ("100 т", "т"): 100.0,
}

# Russian suffix patterns to strip (sorted longest-first so we try them in order).
_RU_SUFFIXES = sorted(
    [
        "ость", "ение", "ание", "ации", "ация", "ения", "ении",
        "ного", "ному", "ными", "ской", "ском",
        "ные", "ных", "ным", "ной", "ого", "ому", "ами",
        "ов", "ей", "ий", "ый", "ая", "ое", "ые",
        "ок", "ек", "ка", "ки", "ке", "ку",
        "ом", "ем",
        "а", "о", "у", "е", "и", "ы",
    ],
    key=len,
    reverse=True,
)

# Small Russian stop-words to skip when building search keywords.
_STOP_WORDS = frozenset(
    {
        "и", "в", "на", "из", "от", "до", "за", "по", "с", "к", "о",
        "для", "при", "без", "под", "над", "об", "не", "ни",
        "или", "то", "как", "все", "его", "ее", "их", "мы",
        "они", "она", "он", "мм", "см",
    }
)

# Regex for GESN code pattern XX-XX-XXX-XX (2-2-3-2 digits).
_GESN_CODE_RE = re.compile(r"\b(\d{2}-\d{2}-\d{3}-\d{2})\b")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def match_gesn_items(
    items: list[VorItem],
    gesn_db_path: str | Path,
) -> list[GesnMatch]:
    """Match all VOR items to GESN codes.

    For each item:
    1. Try exact code extraction from item name.
    2. If no code found, do keyword search.
    3. Pick best match, assign confidence.
    4. Return ``GesnMatch`` with alternatives.
    """
    gesn_db_path = str(gesn_db_path)
    conn = sqlite3.connect(gesn_db_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        results: list[GesnMatch] = []

        for idx, item in enumerate(items):
            # Strategy B — exact code extraction
            code = _extract_gesn_code(item.name)
            if code is not None:
                cursor.execute(
                    """
                    SELECT w.code, w.name, w.measure_unit,
                           f.direct_cost, f.labor_cost, f.machinery_cost, f.materials_cost
                    FROM works w
                    LEFT JOIN fer_prices f ON w.code = f.code
                    WHERE w.code = ?
                    LIMIT 1
                    """,
                    (code,),
                )
                row = cursor.fetchone()
                if row is not None:
                    unit_score = _score_unit_compatibility(item.unit, row["measure_unit"] or "")
                    conf, level = _assign_confidence(1.0, unit_score, 1)
                    if unit_score < 0.5:
                        conf = max(conf * 0.5, 0.3)  # Stricter penalty for unit mismatch
                        # Recalculate level after penalty
                        if conf >= 0.7:
                            level = "green"
                        elif conf >= 0.4:
                            level = "yellow"
                        else:
                            level = "red"
                    results.append(
                        GesnMatch(
                            item_idx=idx,
                            gesn_code=row["code"],
                            gesn_name=row["name"] or "",
                            gesn_unit=row["measure_unit"] or "",
                            confidence=conf,
                            confidence_level=level,
                            alternatives=[],
                            reasoning=f"Exact code {code} extracted from item name",
                        )
                    )
                    continue

            # Strategy A — keyword search
            candidates = _keyword_search(item.name, item.unit, cursor, limit=5)

            if not candidates:
                results.append(
                    GesnMatch(
                        item_idx=idx,
                        gesn_code="",
                        gesn_name="",
                        gesn_unit="",
                        confidence=0.0,
                        confidence_level="red",
                        alternatives=[],
                        reasoning="No matching GESN codes found",
                    )
                )
                continue

            best = candidates[0]
            alternatives = [
                {
                    "gesn_code": c["code"],
                    "gesn_name": c["name"],
                    "gesn_unit": c["unit"],
                    "score": c["score"],
                }
                for c in candidates[1:]
            ]

            unit_score = _score_unit_compatibility(item.unit, best["unit"])
            conf, level = _assign_confidence(best["score"], unit_score, len(candidates))

            results.append(
                GesnMatch(
                    item_idx=idx,
                    gesn_code=best["code"],
                    gesn_name=best["name"],
                    gesn_unit=best["unit"],
                    confidence=conf,
                    confidence_level=level,
                    alternatives=alternatives,
                    reasoning=f"Keyword search matched {len(candidates)} candidate(s)",
                )
            )

        return results
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_gesn_code(text: str) -> str | None:
    """Extract GESN code pattern ``XX-XX-XXX-XX`` from *text*.

    Returns the first match or ``None``.
    """
    m = _GESN_CODE_RE.search(text)
    return m.group(1) if m else None


def _stem_russian(word: str) -> str:
    """Naive Russian stemmer — strip common suffixes, truncate to 5-6 chars.

    This is intentionally simplistic.  A full Snowball stemmer would be better
    but adds a dependency; this covers the 80 % case for keyword search.
    """
    word = word.lower().strip()
    if len(word) <= 4:
        return word

    # Strip known suffixes (longest first).
    for suf in _RU_SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            word = word[: -len(suf)]
            break

    # Truncate to at most 6 chars.
    return word[:6]


def _keyword_search(
    name: str,
    unit: str,
    cursor: sqlite3.Cursor,
    limit: int = 5,
) -> list[dict]:
    """Search the GESN ``works`` table by stemmed keywords.

    Returns up to *limit* candidates sorted by descending score.  Each
    candidate is a dict with keys ``code``, ``name``, ``unit``, ``score``.
    """
    # Tokenise and stem.
    raw_words = re.findall(r"[а-яёА-ЯЁa-zA-Z0-9]+", name)
    stems = []
    for w in raw_words:
        low = w.lower()
        if low in _STOP_WORDS or len(low) < 3:
            continue
        stems.append(_stem_russian(low))

    if not stems:
        return []

    # Build LIKE clauses — require at least the first stem, score others.
    # We use a two-pass approach:
    #   1. Query rows matching *any* stem (OR).
    #   2. Score locally by keyword overlap + unit compatibility.
    like_clauses = " OR ".join(["w.name LIKE ?"] * len(stems))
    params = [f"%{s}%" for s in stems]

    query = f"""
        SELECT DISTINCT w.code, w.name, w.measure_unit
        FROM works w
        WHERE w.name != '' AND ({like_clauses})
        LIMIT 200
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()

    if not rows:
        return []

    # Score each candidate.
    scored: list[dict] = []
    for row in rows:
        row_name_lower = (row["name"] or "").lower()
        # Count how many stems appear in the candidate name.
        hits = sum(1 for s in stems if s in row_name_lower)
        keyword_score = hits / len(stems) if stems else 0.0

        unit_score = _score_unit_compatibility(unit, row["measure_unit"] or "")

        # Combined score: 70 % keyword overlap + 30 % unit compatibility.
        combined = 0.7 * keyword_score + 0.3 * unit_score

        scored.append(
            {
                "code": row["code"],
                "name": row["name"] or "",
                "unit": row["measure_unit"] or "",
                "score": round(combined, 4),
            }
        )

    # Sort descending by score, then alphabetically by code for stability.
    scored.sort(key=lambda c: (-c["score"], c["code"]))
    return scored[:limit]


def _score_unit_compatibility(vor_unit: str, gesn_unit: str) -> float:
    """Score how well two measurement units match.

    Returns:
        1.0 — exact match (possibly after alias normalisation).
        0.5 — compatible with a multiplier (e.g. ``м²`` vs ``100 м2``).
        0.0 — incompatible / unknown.
    """
    if not vor_unit or not gesn_unit:
        return 0.0

    v = vor_unit.strip().lower()
    g = gesn_unit.strip().lower()

    # Direct string equality.
    if v == g:
        return 1.0

    # Normalise through aliases.
    cv = _UNIT_ALIASES.get(v, v)
    cg = _UNIT_ALIASES.get(g, g)

    if cv == cg:
        return 1.0

    # Check compatible pairs.
    if (cv, cg) in _UNIT_COMPATIBLE:
        return 0.5

    return 0.0


def _assign_confidence(
    score: float,
    unit_compat: float,
    candidate_count: int,
) -> tuple[float, str]:
    """Assign a confidence value (0-1) and level (green/yellow/red).

    Heuristic:
    - ``score`` is keyword overlap (0-1) or 1.0 for exact code match.
    - ``unit_compat`` is 0.0 / 0.5 / 1.0.
    - ``candidate_count`` — fewer strong candidates → higher confidence.
    """
    # Weighted combination.
    conf = 0.6 * score + 0.3 * unit_compat + 0.1 * min(1.0, 1.0 / max(candidate_count, 1))

    # Clamp.
    conf = max(0.0, min(1.0, conf))

    if conf >= 0.7:
        level = "green"
    elif conf >= 0.4:
        level = "yellow"
    else:
        level = "red"

    return round(conf, 4), level
