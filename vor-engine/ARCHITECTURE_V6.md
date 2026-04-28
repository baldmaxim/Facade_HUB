# VOR V6 — AI-Smetчик Architecture

## System Overview

```
VOR.xlsx ──→ [parser.py] ──→ VorItem[725]
                                   │
                           [parent_filter]
                           Skip rows where P=0
                                   │
                            VorItem[591] (leaves only)
                                   │
                           [classifier.py]
                           classify_sections()
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
               ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
               │ concrete │  │ masonry │  │  ...N   │
               │ expert   │  │ expert  │  │ experts │
               └────┬────┘  └────┬────┘  └────┬────┘
                    │              │              │
                    └──────────────┼──────────────┘
                                   │
                           [validator gate]
                           0 ERRORS required
                                   │
                           [assembler.py]
                           Excel output
```

## Expert Agent Architecture

EVERY expert agent follows the SAME pattern. No exceptions.

### What each expert loads into context:

```
┌─────────────────────────────────────────────────┐
│              EXPERT AGENT CONTEXT                │
│                                                  │
│  1. PRICING_PRINCIPLES.md          (~4K tokens)  │
│     10 mandatory rules                           │
│     Common mistakes to avoid                     │
│     Market price table                           │
│                                                  │
│  2. composition_templates.yaml     (~3K tokens)  │
│     15-20 line templates per work type           │
│     ALL auxiliary materials included             │
│     Moscow 2025 prices                           │
│                                                  │
│  3. Domain encyclopedia            (~20K tokens) │
│     skills/{domain}-expert/ENCYCLOPEDIA*.md      │
│     Price matrices, RED FLAGS, norms             │
│                                                  │
│  4. ГЭСН catalog for domain       (~20K tokens) │
│     Sections + work codes for collections        │
│     FER prices for each code                     │
│                                                  │
│  5. price_ranges.yaml              (~2K tokens)  │
│     Benchmarks per work type                     │
│                                                  │
│  Total context: ~50K tokens per expert           │
│  (within Gemini 3.1 Pro 1M limit)               │
└─────────────────────────────────────────────────┘
```

### What each expert does for EACH position:

```
Position: "Кладка стен из газобетона D500, м3, 6872"
                    │
         ┌──────────▼──────────┐
         │   STEP 1: IDENTIFY   │
         │   What type of work? │
         │   → masonry_block_wall │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   STEP 2: TEMPLATE   │
         │   Load 15-20 line    │
         │   template from YAML │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   STEP 3: ADJUST     │
         │   - Block thickness? │
         │   - Wall height?     │
         │   - Indoor/outdoor?  │
         │   - Winter work?     │
         │   Modify quantities  │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   STEP 4: PRICE      │
         │   For each of 15-20  │
         │   lines:             │
         │   - DB lookup first  │
         │   - Market if no DB  │
         │   - "NOT_FOUND" if   │
         │     nothing works    │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   STEP 5: VERIFY     │
         │   Total vs benchmark │
         │   If OUT → reason:   │
         │   - Wrong template?  │
         │   - Missing items?   │
         │   - Wrong price?     │
         │   → Fix and repeat   │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   STEP 6: OUTPUT     │
         │   {                  │
         │     "position_idx",  │
         │     "gesn_codes",    │
         │     "composition": [ │
         │       15-20 lines    │
         │     ],               │
         │     "total",         │
         │     "reasoning"      │
         │   }                  │
         └─────────────────────┘
```

## 9 Domain Experts

| Domain | Collections | Encyclopedia | Key Work Types |
|--------|-----------|--------------|----------------|
| **concrete** | 06, 07 | ENCYCLOPEDIA_MONOLIT.md | Стены, перекрытия, колонны, фундаменты, лестницы |
| **masonry** | 08 | ENCYCLOPEDIA_FINAL.md | Кладка кирпичная, газобетонная, перегородки |
| **facade** | 15, 26 | ENCYCLOPEDIA_FASAD.md | НВФ, СФТК, витражи, облицовка |
| **roofing** | 12 | ENCYCLOPEDIA_KROVLYA.md | Наплавляемая, мембранная, эксплуатируемая |
| **finishing** | 15 | ENCYCLOPEDIA_FINISHING.md | Штукатурка, плитка, полы, потолки, окраска |
| **hvac** | 16, 17, 18, 20 | ENCYCLOPEDIA_OVIK.md | Отопление, вентиляция, кондиционирование, водоснабжение |
| **electrical** | 21, 33 | ENCYCLOPEDIA_ELECTRO.md | Электроснабжение, освещение, слаботочка |
| **earthworks** | 01, 02 | ENCYCLOPEDIA_EARTHWORKS.md | Срезка, засыпка, котлован, сваи |
| **general** | — | — | Временные работы, благоустройство, прочее |

## Composition Template Structure

Each template in `composition_templates.yaml`:

```yaml
concrete_slab:
  name: "Монолитная ж/б плита перекрытия"
  unit: м3
  bench: [28000, 45000]
  items:
    # 1. MAIN MATERIALS (3-4 lines)
    - {name: "Бетон В25", unit: м3, qty: 1.02, price: 12000}
    - {name: "Арматура А500С", unit: т, qty: 0.14, price: 88000}
    # 2. AUXILIARY MATERIALS (4-5 lines)
    - {name: "Проволока вязальная", unit: т, qty: 0.005, price: 60000}
    - {name: "Фиксаторы арматуры", unit: шт, qty: 3, price: 15}
    - {name: "Закладные детали", unit: кг, qty: 2, price: 120}
    - {name: "Смазка опалубочная", unit: кг, qty: 0.3, price: 100}
    # 3. FORMWORK/EQUIPMENT (3-4 lines)
    - {name: "Аренда опалубки", unit: м2, qty: 5, price: 400}
    - {name: "Монтаж опалубки", unit: м2, qty: 5, price: 350}
    - {name: "Демонтаж опалубки", unit: м2, qty: 5, price: 200}
    # 4. WORK/LABOR (3-4 lines)
    - {name: "Подача бетона", unit: м3, qty: 1.0, price: 1000}
    - {name: "Укладка и вибрирование", unit: м3, qty: 1.0, price: 1500}
    - {name: "Заглаживание", unit: м2, qty: 1.0, price: 150}
    # 5. MECHANISMS (2-3 lines)
    - {name: "Кран башенный", unit: маш-ч, qty: 0.15, price: 3000}
    - {name: "Вибратор", unit: маш-ч, qty: 0.3, price: 300}
    # 6. CONSUMABLES (~2%)
    - {name: "Расходные материалы", unit: компл, qty: 1, price: 690}
```

## Execution Modes

### Mode A: Gemini 3.1 Pro (automatic)
```
Python orchestrator
  → Load expert context (50K tokens)
  → For each position: Gemini function calling
    → search_gesn() → get_composition() → get_price() → check_benchmark()
  → Gemini returns JSON with 15-20 line composition
  → Validate → Assemble Excel
```

### Mode B: Claude Code (manual batch)
```
vor_v6_runner.py batch
  → Generate prompt files with context + positions
  → Human runs Claude Code on each batch
  → Claude reasons through each position
  → Save responses → Assemble
```

### Mode C: Rule engine (scripted, no LLM)
```
rule_pricer.py
  → Match position name to expert_rules.py
  → Apply template-based pricing
  → Fast but less accurate (no reasoning)
  → Useful for quick estimates and testing
```

## Quality Gates

### Before assembly:
1. Every position has 10+ composition lines
2. Every position total within benchmark range
3. No "NOT_FOUND" prices (or explicitly marked for review)
4. No parent rows priced (P=0 skipped)
5. Cost structure check: concrete 25-40%, engineering 15-30%, finishing 10-20%

### After assembly:
1. Total/м2 within 200-350K range (with overhead)
2. Each domain contributes reasonable % of total
3. No single position > 5% of total (outlier check)

## File Structure

```
vor/agent/
├── __init__.py
├── ARCHITECTURE_V6.md          ← this file
├── PRICING_PRINCIPLES.md       ← 10 mandatory rules for ALL agents
├── composition_templates.yaml  ← 15-20 line templates per work type
├── tools.py                    ← 7 DB tools (search_gesn, get_price, etc.)
├── fer_pricer.py               ← FER-based pricing engine
├── smetcik.py                  ← Agent loop (Gemini + Claude modes)
├── context.py                  ← Domain context loader
├── rule_pricer.py              ← Rule-based pricing (Mode C)
├── expert_rules.py             ← 90+ pricing rules
```
