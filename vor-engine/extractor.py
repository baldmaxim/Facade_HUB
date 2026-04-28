"""Revit quantity extractor — generates C# code templates for the bridge.

For MVP, this module does NOT call Revit directly.  Instead it produces C#
code snippets designed to be executed via ``bridge_callback`` at runtime.
It also provides a parser that converts raw Revit execution results back
into per-item quantities.
"""

from __future__ import annotations

from vor.models import QuantityPlan

# ---------------------------------------------------------------------------
# Revit BuiltInParameter names for each extraction parameter
# ---------------------------------------------------------------------------

_PARAM_MAP: dict[str, dict[str, str]] = {
    "Volume": {
        "builtin_param": "HOST_VOLUME_COMPUTED",
        "aggregate": "total_volume",
        "conversion_comment": "cubic feet -> m³",
    },
    "Area": {
        "builtin_param": "HOST_AREA_COMPUTED",
        "aggregate": "total_area",
        "conversion_comment": "square feet -> m²",
    },
    "Length": {
        "builtin_param": "CURVE_ELEM_LENGTH",
        "aggregate": "total_length",
        "conversion_comment": "feet -> m",
    },
    "Weight": {
        "builtin_param": "STRUCTURAL_WEIGHT",
        "aggregate": "total_weight",
        "conversion_comment": "kg (no conversion needed)",
    },
}

# Conversion factors from Revit internal units to metric
_CONVERSION_FACTORS: dict[str, float] = {
    "Volume": 0.0283168,   # cubic feet → m³
    "Area": 0.092903,      # square feet → m²
    "Length": 0.3048,       # feet → m
    "Weight": 1.0,         # already kg
}

# ---------------------------------------------------------------------------
# C# code template
# ---------------------------------------------------------------------------

_CS_TEMPLATE = """\
// Auto-generated extraction code for category: {category}
// Parameter: {parameter} ({conversion_comment})
var collector = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.{category})
    .WhereElementIsNotElementType();

var results = collector
    .Cast<Element>()
    .GroupBy(e => e.Name)
    .Select(g => new {{
        type_name = g.Key,
        count = g.Count(),
        {aggregate} = g.Sum(e => e.get_Parameter(BuiltInParameter.{builtin_param})?.AsDouble() ?? 0) * {conversion_factor}
    }})
    .ToList();

return results;
"""

_CS_TEMPLATE_FILTERED = """\
// Auto-generated extraction code for category: {category}
// Parameter: {parameter} ({conversion_comment})
// Filter: type name contains "{filter_value}"
var collector = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.{category})
    .WhereElementIsNotElementType();

var results = collector
    .Cast<Element>()
    .Where(e => e.Name.ToLower().Contains("{filter_value_lower}"))
    .GroupBy(e => e.Name)
    .Select(g => new {{
        type_name = g.Key,
        count = g.Count(),
        {aggregate} = g.Sum(e => e.get_Parameter(BuiltInParameter.{builtin_param})?.AsDouble() ?? 0) * {conversion_factor}
    }})
    .ToList();

return results;
"""


# ---------------------------------------------------------------------------
# Rebar extraction template (OST_Rebar)
# ---------------------------------------------------------------------------

_CS_TEMPLATE_REBAR = """\
// Auto-generated rebar extraction code for OST_Rebar
// Groups by diameter, sums lengths, computes weight (steel density 7850 kg/m³)
var rebars = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.OST_Rebar)
    .WhereElementIsNotElementType()
    .Cast<Autodesk.Revit.DB.Structure.Rebar>();

var results = rebars
    .GroupBy(r => {{
        var barType = doc.GetElement(r.GetTypeId()) as Autodesk.Revit.DB.Structure.RebarBarType;
        return barType?.BarNominalDiameter ?? 0;
    }})
    .Select(g => {{
        double diameterFt = g.Key;
        double diameterM = diameterFt * 0.3048;
        double totalLengthM = g.Sum(r => r.TotalLength * 0.3048);
        double crossSectionArea = Math.PI * diameterM * diameterM / 4.0;
        double volumeM3 = crossSectionArea * totalLengthM;
        double weightKg = volumeM3 * 7850.0;  // steel density 7850 kg/m³
        return new {{
            diameter_mm = Math.Round(diameterM * 1000, 1),
            count = g.Count(),
            total_length_m = Math.Round(totalLengthM, 2),
            total_weight_kg = Math.Round(weightKg, 2)
        }};
    }})
    .OrderBy(r => r.diameter_mm)
    .ToList();

return results;
"""

# ---------------------------------------------------------------------------
# Formwork estimation template (calculation, not a Revit query)
# ---------------------------------------------------------------------------

_CS_TEMPLATE_FORMWORK = """\
// Auto-generated formwork area estimation from concrete elements
// Formwork area ≈ element surface area minus top face
// Walls: 2 * height * length (both sides)
// Columns: perimeter * height
// Beams: (2 * height + width) * length
// Slabs: area * 1 (bottom only)
var walls = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.OST_Walls)
    .WhereElementIsNotElementType()
    .Cast<Element>()
    .Where(e => {{
        var typeId = e.GetTypeId();
        var wallType = doc.GetElement(typeId) as WallType;
        return wallType?.Kind == WallKind.Basic;
    }});

double wallFormwork = walls.Sum(w => {{
    double height = w.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.AsDouble() ?? 0;
    double length = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0;
    return 2.0 * height * length * 0.092903;  // sq ft to m²
}});

var columns = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.OST_StructuralColumns)
    .WhereElementIsNotElementType()
    .Cast<Element>();

double columnFormwork = columns.Sum(c => {{
    double height = c.get_Parameter(BuiltInParameter.INSTANCE_LENGTH_PARAM)?.AsDouble() ?? 0;
    // Approximate perimeter: assume square cross-section from bounding box
    var bb = c.get_BoundingBox(null);
    double perimeterFt = bb != null ? 2.0 * ((bb.Max.X - bb.Min.X) + (bb.Max.Y - bb.Min.Y)) : 0;
    return perimeterFt * height * 0.092903;
}});

var beams = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.OST_StructuralFraming)
    .WhereElementIsNotElementType()
    .Cast<Element>();

double beamFormwork = beams.Sum(b => {{
    double length = b.get_Parameter(BuiltInParameter.INSTANCE_LENGTH_PARAM)?.AsDouble() ?? 0;
    var bb = b.get_BoundingBox(null);
    double hFt = bb != null ? (bb.Max.Z - bb.Min.Z) : 0;
    double wFt = bb != null ? (bb.Max.X - bb.Min.X) : 0;
    return (2.0 * hFt + wFt) * length * 0.092903;
}});

var slabs = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.OST_Floors)
    .WhereElementIsNotElementType()
    .Cast<Element>();

double slabFormwork = slabs.Sum(s => {{
    double area = s.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0;
    return area * 0.092903;  // bottom face only
}});

return new {{
    wall_formwork_m2 = Math.Round(wallFormwork, 2),
    column_formwork_m2 = Math.Round(columnFormwork, 2),
    beam_formwork_m2 = Math.Round(beamFormwork, 2),
    slab_formwork_m2 = Math.Round(slabFormwork, 2),
    total_formwork_m2 = Math.Round(wallFormwork + columnFormwork + beamFormwork + slabFormwork, 2)
}};
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_rebar_extraction_code() -> str:
    """Generate C# code for extracting rebar data (OST_Rebar).

    Returns a C# snippet that groups rebars by diameter, sums lengths,
    and computes weight using steel density 7850 kg/m3.
    """
    return _CS_TEMPLATE_REBAR


def generate_formwork_estimation_code() -> str:
    """Generate C# code for estimating formwork area from concrete elements.

    Calculates formwork area for walls, columns, beams, and slabs:
    - Walls: 2 * height * length (both sides)
    - Columns: perimeter * height
    - Beams: (2 * height + width) * length
    - Slabs: area * 1 (bottom only, formwork on bottom)
    """
    return _CS_TEMPLATE_FORMWORK


def generate_extraction_code(plans: list[QuantityPlan]) -> dict[str, str]:
    """Generate C# code for extracting quantities from Revit.

    Groups plans by Revit category.  Returns ``dict[category, C# code]``.
    Plans with ``source="manual"`` or empty category are skipped.

    Each C# snippet uses ``FilteredElementCollector``, optionally filters
    by type name, and extracts the specified parameter.

    Special handling:
    - ``OST_Rebar`` categories use the rebar extraction template
      (groups by diameter, computes weight at steel density 7850 kg/m3).
    - ``parameter="Formwork"`` uses the formwork estimation template
      (surface area calculation for concrete elements).
    """
    code_map: dict[str, str] = {}

    for plan in plans:
        if plan.source == "manual" or not plan.category:
            continue

        categories = [c.strip() for c in plan.category.split(",")]

        # --- Special case: Rebar ---
        if any(cat == "OST_Rebar" for cat in categories):
            if "OST_Rebar" not in code_map:
                code_map["OST_Rebar"] = _CS_TEMPLATE_REBAR
            continue

        # --- Special case: Formwork estimation ---
        if plan.parameter == "Formwork":
            if "Formwork" not in code_map:
                code_map["Formwork"] = _CS_TEMPLATE_FORMWORK
            continue

        param_info = _PARAM_MAP.get(plan.parameter)

        if param_info is None:
            continue

        conversion_factor = _CONVERSION_FACTORS.get(plan.parameter, 1.0)
        filter_value = plan.filter_criteria.get("type_name_contains", "")

        for cat in categories:
            if not cat:
                continue

            if filter_value:
                code = _CS_TEMPLATE_FILTERED.format(
                    category=cat,
                    parameter=plan.parameter,
                    conversion_comment=param_info["conversion_comment"],
                    aggregate=param_info["aggregate"],
                    builtin_param=param_info["builtin_param"],
                    conversion_factor=conversion_factor,
                    filter_value=filter_value,
                    filter_value_lower=filter_value.lower(),
                )
            else:
                code = _CS_TEMPLATE.format(
                    category=cat,
                    parameter=plan.parameter,
                    conversion_comment=param_info["conversion_comment"],
                    aggregate=param_info["aggregate"],
                    builtin_param=param_info["builtin_param"],
                    conversion_factor=conversion_factor,
                )

            # If a category already has code, append the new snippet
            if cat in code_map:
                code_map[cat] += "\n" + code
            else:
                code_map[cat] = code

    return code_map


def extract_quantities_from_results(
    plans: list[QuantityPlan],
    revit_results: dict[str, list[dict]],
) -> dict[int, float]:
    """Parse Revit execution results into ``item_idx -> quantity`` mapping.

    Parameters
    ----------
    plans:
        The quantity plans that were used to generate the extraction code.
    revit_results:
        ``category -> list[{type_name, count, total_volume/total_area/...}]``
        as returned by executing the C# snippets in Revit.

    Returns
    -------
    dict[int, float]
        Mapping of item index to extracted quantity (in the VOR item's unit).
    """
    quantities: dict[int, float] = {}

    for plan in plans:
        if plan.source == "manual" or not plan.category:
            continue

        param_info = _PARAM_MAP.get(plan.parameter)
        if param_info is None:
            continue

        aggregate_key = param_info["aggregate"]
        categories = [c.strip() for c in plan.category.split(",")]
        filter_value = plan.filter_criteria.get("type_name_contains", "")
        total = 0.0

        for cat in categories:
            results_for_cat = revit_results.get(cat, [])
            for entry in results_for_cat:
                type_name = entry.get("type_name", "")

                # Apply filter if specified
                if filter_value and filter_value.lower() not in type_name.lower():
                    continue

                value = entry.get(aggregate_key, 0.0)
                total += value

        # The C# code already applies the Revit→metric conversion,
        # so here we only apply the VOR unit multiplier (e.g. "100 м²" → 0.01).
        # The unit_conversion in the plan includes both factors, and the
        # base metric conversion is already applied in C#, so we derive
        # only the unit multiplier.
        base_conversion = _CONVERSION_FACTORS.get(plan.parameter, 1.0)
        if base_conversion != 0:
            unit_multiplier = plan.unit_conversion / base_conversion
        else:
            unit_multiplier = 1.0

        quantities[plan.item_idx] = round(total * unit_multiplier, 6)

    return quantities
