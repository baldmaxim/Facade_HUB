"""Data models for the VOR auto-pricing pipeline.

Includes both the original MVP models and the extended reasoning-engine models
introduced in v2 (the "smart VOR" system).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ===========================================================================
# Original MVP models (unchanged for backward compatibility)
# ===========================================================================


@dataclass
class VorItem:
    """A single line item from the uploaded VOR Excel."""

    row_num: int              # Original Excel row number
    name: str                 # Work description (e.g., "Кладка стен из газобетона D500")
    unit: str                 # Unit of measurement (e.g., "м³", "м²", "100 м²")
    quantity: float | None    # Pre-filled quantity (None if empty)
    section: str              # Section header (e.g., "Стены и перегородки")
    raw_data: dict            # Original row data for reference


@dataclass
class GesnMatch:
    """Result of matching a VOR item to a GESN code."""

    item_idx: int             # Index into VorItem list
    gesn_code: str            # e.g., "08-02-001-01"
    gesn_name: str            # e.g., "Кладка стен из блоков ячеистого бетона"
    gesn_unit: str            # e.g., "м³"
    confidence: float         # 0.0 to 1.0
    confidence_level: str     # "green", "yellow", "red"
    alternatives: list[dict] = field(default_factory=list)  # Top-3 alternative codes
    reasoning: str = ""       # Why this code was chosen


@dataclass
class QuantityPlan:
    """Plan for extracting a quantity from Revit model."""

    item_idx: int
    source: str               # "model" or "normative" or "manual"
    category: str             # Revit BuiltInCategory (e.g., "OST_Walls")
    parameter: str            # What to measure (e.g., "Volume", "Area")
    filter_criteria: dict = field(default_factory=dict)  # e.g., {"type_name_contains": "газобетон"}
    unit_conversion: float = 1.0  # Multiply raw value by this (e.g., 0.01 for "100 м²")
    notes: str = ""


@dataclass
class ResourceDetail:
    """A single resource line from GESN norm."""

    resource_code: str        # "91.01.01-034"
    name: str                 # "Бульдозеры, мощность 59 кВт"
    type: str                 # "labor", "labor_operator", "machinery", "material"
    measure_unit: str         # "маш.-ч", "м³", "т"
    norm_quantity: float      # Quantity per unit of work (from GESN)
    total_quantity: float     # norm_quantity × work quantity


@dataclass
class PriceResult:
    """Calculated price for a VOR item."""

    item_idx: int
    quantity: float           # Extracted quantity
    gesn_code: str
    fer_direct_cost: float    # FER base price per unit (FSNB-2022)
    fer_labor: float = 0.0
    fer_machinery: float = 0.0
    fer_materials: float = 0.0
    total_base: float = 0.0   # quantity × fer_direct_cost
    notes: str = ""
    resources: list[ResourceDetail] = field(default_factory=list)


@dataclass
class VorResult:
    """Complete result of VOR pipeline processing."""

    items: list[VorItem] = field(default_factory=list)
    matches: list[GesnMatch] = field(default_factory=list)
    plans: list[QuantityPlan] = field(default_factory=list)
    prices: list[PriceResult] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)  # [{item_idx, stage, message}]
    stats: dict = field(default_factory=dict)  # {total, green, yellow, red, not_found, total_cost}
    # --- v2: reasoning engine outputs ---
    reasoning_items: list[ReasoningItem] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    vor_plan: str = ""            # High-level LLM plan for the entire VOR
    cross_check: str = ""         # Cross-check summary from Stage D
    # --- v3: resource breakdown ---
    breakdowns: list[PositionBreakdown] = field(default_factory=list)


# ===========================================================================
# V2: Reasoning engine models
# ===========================================================================


class FindingSeverity(Enum):
    """Severity of an AI finding."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class FindingCategory(Enum):
    """Category of an AI finding."""
    MULTI_LAYER = "multi_layer"           # Wall/floor decomposed into layers
    IMPLICIT_WORK = "implicit_work"       # AI-added item (scaffolding, transport, etc.)
    UNIT_MISMATCH = "unit_mismatch"       # VOR unit != GESN unit
    MISSING_ITEM = "missing_item"         # Model element not covered by VOR
    DUPLICATE_ITEM = "duplicate_item"     # Two VOR lines for the same work
    PARAMETER_DRIVEN = "parameter_driven" # Decision driven by element parameter
    OPENING_DEDUCTION = "opening_deduction"  # Window/door deduction
    WASTE_FACTOR = "waste_factor"         # Material waste coefficient applied
    CROSS_CHECK = "cross_check"           # Cross-check finding
    CONTRADICTION = "contradiction"       # Contradiction between VOR and model
    LEVEL_SPECIFIC = "level_specific"     # Different treatment above/below grade


@dataclass
class WallLayer:
    """A single layer in a compound wall structure."""
    material: str            # e.g., "газобетон D500"
    thickness_mm: float      # e.g., 400.0
    function: str            # "structure", "insulation", "finish", "substrate"
    gesn_collection: str     # e.g., "08" for masonry, "26" for insulation
    suggested_gesn: str = "" # e.g., "08-02-001-01"
    quantity_parameter: str = ""  # "Volume" or "Area"


@dataclass
class ElementDecomposition:
    """Decomposition of a complex element (e.g., multi-layer wall) into VOR items."""
    source_type_name: str    # Revit type name, e.g., "НС-400 (газобетон D500 400мм + утеплитель 150мм)"
    source_category: str     # Revit category, e.g., "OST_Walls"
    instance_count: int      # How many instances in the model
    layers: list[WallLayer] = field(default_factory=list)
    total_area_m2: float = 0.0
    total_volume_m3: float = 0.0
    notes: str = ""


@dataclass
class ReasoningItem:
    """Full reasoning chain for a single VOR position.

    This is the core output of the reasoning engine. Each VOR item gets one of
    these, documenting *why* a particular GESN code was chosen, how the quantity
    was computed, and what nuances were detected.
    """

    item_idx: int                # Index into VorItem list
    item_name: str               # Copy of VorItem.name for readability

    # Stage B: Model exploration
    model_elements_found: str = ""     # Description of what was found in model
    decomposition: ElementDecomposition | None = None  # If multi-layer

    # Stage C: GESN matching reasoning
    reasoning_chain: str = ""          # Free-text chain of thought (LLM output)
    gesn_code: str = ""                # Final chosen code
    gesn_name: str = ""                # Name of chosen GESN work
    gesn_alternatives: list[dict] = field(default_factory=list)
    confidence: float = 0.0
    confidence_level: str = "red"      # "green", "yellow", "red"

    # Stage D: Quantity reasoning
    quantity_reasoning: str = ""       # How quantity was derived
    raw_quantity: float = 0.0          # Quantity before adjustments
    adjustments: list[str] = field(default_factory=list)  # e.g., ["opening deduction -16 m2", "waste +3%"]
    final_quantity: float = 0.0        # Quantity after adjustments

    # Related findings
    finding_refs: list[int] = field(default_factory=list)  # Indices into VorResult.findings

    # Sub-items generated from decomposition
    generated_items: list[dict] = field(default_factory=list)
    # Each: {"name": "...", "gesn_code": "...", "unit": "...", "quantity": ..., "reasoning": "..."}


@dataclass
class Finding:
    """A discovery or warning raised by the reasoning engine.

    Findings are observations that go beyond simple GESN matching:
    contradictions, missing items, implicit work, etc.
    """

    category: FindingCategory
    severity: FindingSeverity
    title: str                    # Short headline, e.g., "Отсутствуют леса для высотных стен"
    description: str              # Detailed explanation
    affected_items: list[int] = field(default_factory=list)  # VOR item indices
    suggested_action: str = ""    # What to do about it
    suggested_gesn: str = ""      # Optional GESN code for implicit work
    suggested_quantity: float = 0.0
    suggested_unit: str = ""


# ===========================================================================
# V3: Resource breakdown models
# ===========================================================================


@dataclass
class ResourceLine:
    """A single resource line with price in the VOR breakdown."""

    resource_code: str        # "91.05.01-017" or "07.1.03.02-0001"
    name: str                 # "Кран башенный 8т" or "Блоки ГСБ D500"
    resource_type: str        # "labor", "material", "material_unaccounted", "machinery", "labor_operator"
    measure_unit: str = ""
    norm_quantity: float = 0.0   # Per unit of work (from GESN)
    total_quantity: float = 0.0  # norm × work quantity
    unit_price: float = 0.0     # From resource_prices table
    total_price: float = 0.0    # total_quantity × unit_price
    price_found: bool = True    # False if not in resource_prices
    is_main: bool = False       # True for primary material, False for auxiliary
    note: str = ""


@dataclass
class WorkBreakdown:
    """A single GESN work within a VOR position breakdown."""

    gesn_code: str            # "08-02-001-01"
    gesn_name: str            # "Кладка стен из блоков ячеистого бетона"
    measure_unit: str = ""
    quantity: float = 0.0
    materials: list[ResourceLine] = field(default_factory=list)
    machinery: list[ResourceLine] = field(default_factory=list)
    labor_lines: list[ResourceLine] = field(default_factory=list)
    total_cost: float = 0.0   # Sum of all resource prices
    reasoning: str = ""


@dataclass
class PositionBreakdown:
    """Complete resource breakdown of one VOR position."""

    item_idx: int
    item_name: str
    unit: str = ""
    quantity: float = 0.0
    works: list[WorkBreakdown] = field(default_factory=list)
    total_cost: float = 0.0
    comment: str = ""          # AI reasoning / methodology
    is_supplement: bool = False
    supplement_reason: str = ""
    confidence: float = 0.0
    confidence_level: str = "red"


# ===========================================================================
# V2: Section-level grouping for batched LLM reasoning
# ===========================================================================


@dataclass
class VorSection:
    """A group of VOR items belonging to the same section, processed together
    in a single LLM call for efficiency."""

    section_name: str
    item_indices: list[int] = field(default_factory=list)
    gesn_collection_hint: str = ""  # e.g., "08" if section is about masonry
    model_context: str = ""         # Relevant passport excerpt for this section
    llm_reasoning: str = ""         # Raw LLM output for this section batch


# ===========================================================================
# V4: Multi-agent system models
# ===========================================================================


class ExpertDomain(Enum):
    """Domain assigned to an expert agent for VOR pricing."""
    MASONRY = "masonry"              # ГЭСН сб.08 — кладка, стены, перегородки
    CONCRETE = "concrete"            # ГЭСН сб.06 — бетон, монолит, фундаменты
    ELECTRICAL = "electrical"        # ГЭСН сб.21,33 — силовая электрика
    FACADE = "facade"                # ГЭСН сб.15,26 — фасады, утепление
    ROOFING = "roofing"              # ГЭСН сб.12 — кровля
    HVAC = "hvac"                    # ГЭСН сб.16-20 — ОВиК, сантехника
    EARTHWORKS = "earthworks"        # ГЭСН сб.01 — земляные работы
    FINISHING = "finishing"           # ГЭСН сб.15 — отделочные работы
    LOW_VOLTAGE = "low_voltage"      # слаботочные: видеонаблюдение, СКУД, пожсигнал
    DOORS = "doors"                  # двери, люки, ворота
    LANDSCAPING = "landscaping"      # благоустройство, озеленение
    EXT_NETWORKS = "ext_networks"    # наружные сети
    GENERAL = "general"              # всё остальное


class EntityType(Enum):
    """High-level semantic category of a VOR position."""

    STRUCTURE = "structure"
    SURFACE = "surface"
    SYSTEM = "system"
    EQUIPMENT = "equipment"
    PRODUCT = "product"
    LANDSCAPE = "landscape"
    FURNITURE = "furniture"
    UNKNOWN = "unknown"


class WorkType(Enum):
    """Normalized work intent for routing/admission."""

    CONSTRUCTION = "construction"
    MASONRY = "masonry"
    CONCRETING = "concreting"
    INSTALLATION = "installation"
    FINISHING = "finishing"
    PROTECTION = "protection"
    MARKING = "marking"
    SUPPLY = "supply"
    UNKNOWN = "unknown"


class MeasurementProfile(Enum):
    """Normalized measurement family of the position."""

    VOLUME = "volume"
    AREA = "area"
    LENGTH = "length"
    COUNT = "count"
    MASS = "mass"
    LABOR = "labor"
    UNKNOWN = "unknown"


@dataclass
class PositionIntent:
    """Normalized semantic understanding of one VOR position."""

    item_idx: int
    item_name: str
    section_name: str
    normalized_name: str = ""
    entity_type: EntityType = EntityType.UNKNOWN
    work_type: WorkType = WorkType.UNKNOWN
    material_system: str = ""
    structure_role: str = ""
    measurement_profile: MeasurementProfile = MeasurementProfile.UNKNOWN
    context_signature: list[str] = field(default_factory=list)
    candidate_collections: list[str] = field(default_factory=list)
    rationale: str = ""


@dataclass
class AdmissionDecision:
    """Expert admission decision for one VOR position."""

    item_idx: int
    suggested_domain: ExpertDomain = ExpertDomain.GENERAL
    admitted_domain: ExpertDomain = ExpertDomain.GENERAL
    admit: bool = False
    confidence: str = ""
    evidence: list[str] = field(default_factory=list)
    reject_reasons: list[str] = field(default_factory=list)


@dataclass
class AgentResult:
    """Result from a single expert agent processing its assigned items."""
    domain: ExpertDomain
    matches: list[GesnMatch] = field(default_factory=list)
    reasoning_items: list[ReasoningItem] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    breakdowns: list[PositionBreakdown] = field(default_factory=list)
    supplements: list[dict] = field(default_factory=list)
    item_works: dict[int, list[dict]] = field(default_factory=dict)
    elapsed_seconds: float = 0.0
    error: str | None = None


# ===========================================================================
# V5: Two-cycle pricing models (Redesign v3)
# ===========================================================================


class CompositionType(Enum):
    """Type of element in a work composition breakdown."""
    WORK = "work"              # Основная работа (ГЭСН код)
    MATERIAL = "material"      # Материал
    MACHINERY = "machinery"    # Механизм
    LABOR = "labor"            # Трудозатраты


@dataclass
class CompositionItem:
    """One element in a work composition (Cycle 1 output).

    Represents a single work, material, machinery, or labor item
    that makes up a VOR position.
    """
    type: CompositionType
    code: str               # ГЭСН код или код ресурса
    name: str
    unit: str               # Единица измерения (м2, м3, маш.-ч, чел.-ч)
    quantity: float          # Расход на единицу или абсолютный объём
    quantity_formula: str = ""  # Формула расчёта количества (для Excel комментария)


@dataclass
class PricedItem:
    """A composition element with an assigned price (Cycle 2 output)."""
    composition: CompositionItem
    unit_price: float          # Цена за единицу
    price_source: str          # "энциклопедия", "ФССЦ", "базис+индекс", "ручная"
    price_year: int = 2025
    total_formula: str = ""    # Excel формула: "=F{row}*G{row}" (заполняется assembler)


@dataclass
class PricedPosition:
    """A fully priced VOR position with all its sub-items."""
    original_idx: int          # Индекс строки в оригинальном ВОР
    items: list[PricedItem] = field(default_factory=list)
    total_formula: str = ""    # "=SUM(H{start}:H{end})" (заполняется assembler)
    confidence: float = 0.0
    notes: str = ""
    # --- Iterative validation fields ---
    expert_comment: str = ""           # Reasoning: why this price, what was fixed
    iteration: int = 0                 # Which iteration produced this result (1-4)
    approved: bool = False             # True = validator passed all checks
    validation_errors: list[str] = field(default_factory=list)  # Remaining errors


@dataclass
class VerificationReport:
    """Self-check report from Cycle 3."""
    section_total: float = 0.0
    market_range: tuple[float, float] = (0.0, 0.0)
    red_flags: list[str] = field(default_factory=list)
    coverage_pct: float = 0.0  # % расценённых позиций (0.0-100.0)
    passed: bool = False


@dataclass
class PricedSection:
    """A fully priced section — output of one expert agent (v5)."""
    domain: ExpertDomain
    positions: list[PricedPosition] = field(default_factory=list)
    section_total_formula: str = ""
    verification: VerificationReport = field(default_factory=VerificationReport)
