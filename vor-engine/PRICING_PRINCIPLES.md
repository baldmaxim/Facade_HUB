# VOR Pricing Principles — Mandatory for ALL agents

## ARCHITECTURE

```
VOR Excel → Parser → Classifier (9 domains)
  → Expert Agent per domain (loaded with encyclopedia + templates)
    → For EACH leaf position (skip parents where P=0):
      1. Identify work type
      2. Load composition template (15-20 lines)
      3. Adjust template to position specifics
      4. Price each line (DB or market)
      5. Check total vs benchmark
      6. Iterate if out of range
  → Validator gate (0 ERRORS)
  → Excel Assembler
```

## 10 MANDATORY RULES

### Rule 1: One VOR line = COMPLEX of works
A single VOR position like "Срезка верхнего слоя грунта" is NOT one ГЭСН code.
It is a COMPLEX: срезка бульдозером + погрузка экскаватором + вывоз самосвалами.
ALWAYS think: "What sub-works does this position include?"

### Rule 2: Complete composition — as many lines as the work ACTUALLY requires
Every position MUST have a COMPLETE composition — not a fixed number of lines.
Simple work (грунтовка) = 3 lines. Complex work (монолит колонны) = 20+ lines.
The number of lines is determined by REALITY, not by template constraints.
- Main materials (бетон, блоки, трубы)
- Auxiliary materials (вязальная проволока, фиксаторы, анкера, герметик)
- Fasteners (дюбели, кляммеры, хомуты, болты)
- Consumables (~2% of total)
- Work/labor (separate from materials)
- Mechanisms (кран, бетононасос, вибратор)
Think: "What would a FOREMAN order for this work?" — everything he orders goes into composition.

### Rule 3: Skip parent rows
VOR has hierarchical structure. Rows where column P = 0 are PARENTS (summary rows).
Only price LEAF rows (P = None). Parents sum their children — pricing them = double counting.

### Rule 4: Unit conversion is critical
- ГЭСН units are often "100 м2" or "1000 м3" — ALWAYS divide VOR quantity by multiplier
- VOR unit (м2) may differ from ГЭСН unit (м3) — need conversion coefficient
  Example: кладка в ВОР = м2, в ГЭСН = м3. Coefficient = thickness (0.15м for 150mm wall)

### Rule 5: FER method, not resource method
- Use FER direct_cost × FER_INDEX (2.12) for work cost
- Add unaccounted materials at market prices SEPARATELY
- Do NOT calculate ресурсный метод (gives absurd results due to norm units)

### Rule 6: No fallback prices
If price not found — mark "NOT_FOUND", do NOT substitute a typical price.
Fallback prices mask errors and prevent honest coverage measurement.

### Rule 7: Benchmark every position
After pricing, check total/unit against market range.
If outside range — investigate WHY and fix, don't ignore.

### Rule 8: Correct market prices (Moscow 2025)
Key prices to get right (these drive 80% of total):
- Бетон В25: 11,000-13,000 руб/м3
- Арматура А500С: 85,000-95,000 руб/т
- Газобетон D500: 5,500-7,000 руб/м3
- Опалубка (аренда PERI): 350-500 руб/м2/мес
- Стеклопакет (алюм.витраж): 8,000-15,000 руб/м2
- Радиатор биметалл 10 секц: 6,000-10,000 руб/шт
- Кабель ВВГнг 3×2.5: 90-130 руб/м

### Rule 9: Overhead markup
СМР (чистые) × 1.89 = полная стоимость
(НР ~60% от ФОТ + СП ~40% от ФОТ + НДС 20% + ПИР 5% ≈ ×1.89)
Target for ЖК бизнес-класс Москва: 200,000-350,000 руб/м2 жилой площади

### Rule 10: Use composition templates
Load templates from `composition_templates.yaml` as STARTING POINT.
Adjust quantities and prices based on position specifics:
- Building height (>10 floors = crane surcharge)
- Underground vs above-ground (waterproofing needs)
- Season (winter = противоморозная добавка)
- Complexity (curved walls = more formwork)

## DOMAIN-SPECIFIC KNOWLEDGE

Each expert agent loads:
1. Encyclopedia for their domain (skills/*-expert/ENCYCLOPEDIA*.md) — 10-30K tokens
2. ГЭСН catalog for their collection codes — 10-50K tokens
3. Composition templates from composition_templates.yaml
4. Price ranges from price_ranges.yaml
5. This file (PRICING_PRINCIPLES.md)

## COMMON MISTAKES TO AVOID

1. Forgetting auxiliary materials (вязальная проволока, фиксаторы, смазка) — adds 10-15%
2. Not including work/labor as separate line — work = 25-35% of total
3. Using wrong units (м2 vs м3, per 100 vs per 1)
4. Pricing parent rows (double counting)
5. Accepting generic_ks catch-all — every position needs specific rule
6. Ignoring откосы, примыкания, доборные элементы — adds 5-10%
7. Not including mechanisms (кран = 3-5% of concrete cost)
8. Using single ГЭСН code for complex work (need 3-5 codes)
