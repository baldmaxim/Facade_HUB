# VOR Multi-Agent Pricing System - Architecture

## 1. Общая схема системы

```
                            VOR.xlsx (вход)
                                 |
                            [cli.py]
                            argparse + LLM setup
                                 |
                         ========|========
                         |  VorPipeline  |
                         |  pipeline.py  |
                         =================
                           /     |     \
                      MVP    Smart   Multi-Agent
                      run()  run_smart() run_multiagent()
                          \    |    /
                           \   |   /
                            \  |  /
                    +--------+-+--+---------+
                    |                        |
               [parser.py]           [analyzer.py]
               parse_vor_excel()     analyze_model_passport()
                    |                detect_multi_layer_walls()
                    |                detect_implicit_work()
                    v                        |
               VorItem[]                ModelSummary
                    |                   Findings
                    |                        |
                    +--------+---------------+
                             |
                    +--------+--------+
                    |                 |
              [MVP path]    [Multi-Agent path]
                    |                 |
             [matcher.py]    [orchestrator.py]
             match_gesn()    MultiAgentOrchestrator
                    |                 |
                    |         +-------+-------+
                    |         |               |
                    |    [Stage A]      [Classifier]
                    |    LLM: "Understand"  classify_sections()
                    |         |               |
                    |         |     {domain: [indices]}
                    |         |               |
                    |         +-------+-------+
                    |                 |
                    |    ============ | =============
                    |    | asyncio.gather (parallel) |
                    |    |                           |
                    |    | [Expert]  [Expert] [Expert]|
                    |    | masonry   concrete  facade |
                    |    | +encycl.  +encycl. +encycl.|
                    |    | +provider +provider+provider|
                    |    | +LLM     +LLM     +LLM    |
                    |    |    |         |        |    |
                    |    | AgentResult  AR      AR   |
                    |    ============================
                    |                 |
                    |           [Merge Results]
                    |           sort by item_idx
                    |                 |
                    |           [Stage D]
                    |           LLM: cross-check
                    |                 |
                    +--------+--------+
                             |
                      ReasoningResult / GesnMatch[]
                             |
                        [pricer.py]
                        calculate_prices()
                        FER lookup + resources
                             |
                        PriceResult[]
                             |
                        [generator.py]
                        generate_vor_excel_v3()
                             |
                      Priced VOR.xlsx (выход)
```

---

## 2. UML Class Diagram - Providers (pluggable data sources)

```plantuml
@startuml providers

skinparam classAttributeIconSize 0
skinparam monochrome true

abstract class PriceProvider {
  {abstract} +search_norms(query, collection?, unit?, limit?) : list[NormCandidate]
  {abstract} +get_price(norm_code) : PriceRecord | None
  {abstract} +get_resources(norm_code, work_quantity?) : list[ResourceRecord]
  {abstract} +metadata() : ProviderMetadata
}

class GesnSqliteProvider {
  -_db_path : str
  -_provider_name : str
  --
  +__init__(db_path, provider_name?)
  +search_norms(query, collection?, unit?, limit?) : list[NormCandidate]
  +get_price(norm_code) : PriceRecord | None
  +get_resources(norm_code, work_quantity?) : list[ResourceRecord]
  +metadata() : ProviderMetadata
  -_connect() : Connection
  -_bulk_lookup_prices(codes, cursor) : dict
}

class CsvPriceProvider {
  -_records : list[dict]
  -_by_code : dict
  -_csv_path : str
  --
  +__init__(csv_path)
  +search_norms(query, collection?, unit?, limit?) : list[NormCandidate]
  +get_price(norm_code) : PriceRecord | None
  +get_resources(norm_code, work_quantity?) : list[ResourceRecord]
  +metadata() : ProviderMetadata
  -_load() : None
  -_collection_of(code) : str
}

class CompositeProvider {
  -_providers : list[PriceProvider]
  --
  +__init__(providers)
  +search_norms(query, ...) : list[NormCandidate]
  +get_price(norm_code) : PriceRecord | None
  +get_resources(norm_code, work_quantity?) : list[ResourceRecord]
  +metadata() : ProviderMetadata
}

PriceProvider <|-- GesnSqliteProvider
PriceProvider <|-- CsvPriceProvider
PriceProvider <|-- CompositeProvider
CompositeProvider o-- "1..*" PriceProvider : aggregates

note right of CompositeProvider
  Priority = insertion order.
  search_norms: merge all, dedup by code.
  get_price: first non-None wins.
  get_resources: first non-empty wins.
end note

note right of GesnSqliteProvider
  Wraps gesn.db (SQLite):
  - 52,978 works (GESN norms)
  - 542,050 resources
  - 34,673 FER prices (base 2000)
  - 46,549 resource prices
end note

@enduml
```

---

## 3. UML Class Diagram - Multi-Agent System

```plantuml
@startuml agents

skinparam classAttributeIconSize 0
skinparam monochrome true

enum ExpertDomain {
  MASONRY
  CONCRETE
  ELECTRICAL
  FACADE
  ROOFING
  HVAC
  EARTHWORKS
  FINISHING
  GENERAL
}

class ExpertAgent {
  +domain : ExpertDomain
  -_provider : PriceProvider
  -_llm : LlmCallback
  -_encyclopedia : str
  -_collections : list[str]
  -_waste_defaults : dict
  --
  +process(item_indices, items, model_summary?, decompositions?) : AgentResult
  -_find_all_candidates(item_indices, items) : list[dict]
  -_build_system_prompt() : str
  -_build_user_prompt(items_with_candidates, items, ...) : str
  -_parse_response(raw) : dict
}

class ExpertRegistry {
  -_provider : PriceProvider
  -_llm : LlmCallback
  -_config : VorConfig
  -_project_root : Path
  -_encyclopedia_cache : dict
  --
  +create_expert(domain) : ExpertAgent
  -_load_encyclopedia(domain_key, cfg) : str
  -_truncate_encyclopedia(text, max_chars) : str
  -_find_project_root() : Path
}

class MultiAgentOrchestrator {
  -_provider : PriceProvider
  -_llm : LlmCallback
  -_config : VorConfig
  -_registry : ExpertRegistry
  --
  +run(items, model_passport?, on_progress?) : ReasoningResult
  -_stage_a(items, model_summary) : str
  -_dispatch_parallel(assignments, items, ...) : list[AgentResult]
  -_stage_d_enhanced(items, matches, findings, ...) : str
  -_format_model_summary(ms) : str
}

class "classify_section()" as classifier <<function>> {
  section_name : str -> ExpertDomain
}

class "classify_sections()" as classifier2 <<function>> {
  items : list[VorItem] -> dict[ExpertDomain, list[int]]
}

MultiAgentOrchestrator --> ExpertRegistry : creates experts via
ExpertRegistry --> ExpertAgent : creates
ExpertAgent --> PriceProvider : searches norms, gets prices
MultiAgentOrchestrator --> classifier2 : classifies sections
ExpertAgent --> ExpertDomain : belongs to
MultiAgentOrchestrator --> AgentResult : gathers from experts

note bottom of ExpertAgent
  Each expert:
  1. Loads domain encyclopedia
  2. Searches GESN candidates (filtered by collection)
  3. Builds prompt: base Stage C + encyclopedia
  4. Calls LLM for GESN matching
  5. Parses JSON response
  6. Builds resource breakdowns via provider
end note

@enduml
```

---

## 4. Sequence Diagram - Multi-Agent Pipeline

```plantuml
@startuml multiagent_sequence

skinparam monochrome true

actor "User" as user
participant "CLI" as cli
participant "VorPipeline" as pipe
participant "Parser" as parser
participant "Analyzer" as analyzer
participant "Orchestrator" as orch
participant "Classifier" as cls
participant "Registry" as reg
participant "Expert\n(masonry)" as exp1
participant "Expert\n(concrete)" as exp2
participant "Expert\n(facade)" as exp3
participant "LLM" as llm
participant "Provider\n(gesn.db)" as prov
participant "Pricer" as pricer
participant "Generator" as gen

user -> cli: python -m vor.cli vor.xlsx
activate cli

cli -> pipe: run_multiagent(file_bytes, provider, llm_callback, config)
activate pipe

== 1. Parsing ==

pipe -> parser: parse_vor_excel(file_bytes)
parser --> pipe: items[20]

== 2. Pre-Analysis (deterministic) ==

pipe -> orch: run(items, model_passport, on_progress)
activate orch

orch -> analyzer: analyze_model_passport()
analyzer --> orch: ModelSummary

orch -> analyzer: detect_multi_layer_walls()
analyzer --> orch: decompositions[]

orch -> analyzer: detect_implicit_work()
analyzer --> orch: implicit_findings[]

== 3. Stage A: Understand VOR (1 LLM call) ==

orch -> llm: STAGE_A_SYSTEM + VOR summary
llm --> orch: vor_plan (Markdown)

== 4. Classification (deterministic) ==

orch -> cls: classify_sections(items)
cls --> orch: {masonry: [6,7,8,9], concrete: [3,4,5,10,11,12], facade: [15,16], ...}

== 5. Parallel Expert Dispatch ==

orch -> reg: create_expert(MASONRY)
reg --> orch: expert1

orch -> reg: create_expert(CONCRETE)
reg --> orch: expert2

orch -> reg: create_expert(FACADE)
reg --> orch: expert3

par asyncio.gather
  orch -> exp1: process([6,7,8,9], items)
  activate exp1
  exp1 -> prov: search_norms("кладка стен", collection="08")
  prov --> exp1: NormCandidate[]
  exp1 -> llm: Stage_C + ENCYCLOPEDIA_MASONRY + candidates
  llm --> exp1: JSON {items, supplements}
  exp1 -> prov: get_resources("08-02-001-01", qty=245)
  prov --> exp1: ResourceRecord[]
  exp1 --> orch: AgentResult(masonry)
  deactivate exp1
and
  orch -> exp2: process([3,4,5,10,11,12], items)
  activate exp2
  exp2 -> prov: search_norms("монолит фундамент", collection="06")
  prov --> exp2: NormCandidate[]
  exp2 -> llm: Stage_C + ENCYCLOPEDIA_MONOLIT + candidates
  llm --> exp2: JSON {items, supplements}
  exp2 --> orch: AgentResult(concrete)
  deactivate exp2
and
  orch -> exp3: process([15,16], items)
  activate exp3
  exp3 -> prov: search_norms("утепление фасад", collection="26")
  prov --> exp3: NormCandidate[]
  exp3 -> llm: Stage_C + ENCYCLOPEDIA_FASAD + candidates
  llm --> exp3: JSON {items, supplements}
  exp3 --> orch: AgentResult(facade)
  deactivate exp3
end

== 6. Merge & Cross-check ==

orch -> orch: _merge_results(sort by item_idx)
orch -> analyzer: detect_unit_mismatches(items, matches)

orch -> llm: STAGE_D_SYSTEM + summary + expert provenance
llm --> orch: cross_check (Markdown)

orch --> pipe: ReasoningResult
deactivate orch

== 7. Pricing ==

pipe -> pricer: calculate_prices(matches, quantities)
pricer --> pipe: PriceResult[]

== 8. Excel Generation ==

pipe -> gen: generate_vor_excel_v3(result)
gen --> pipe: excel_bytes

pipe --> cli: VorResult
deactivate pipe

cli -> user: Priced_VOR.xlsx
cli -> user: Stats: 20 items, 7 green, 10 yellow, 3 red
deactivate cli

@enduml
```

---

## 5. Component Diagram - System Layers

```plantuml
@startuml components

skinparam monochrome true

package "CLI Layer" {
  [cli.py] as cli
  [__main__.py] as main
}

package "Pipeline Layer" {
  [VorPipeline] as pipe
}

package "Processing Layer" {
  [parser.py] as parser
  [matcher.py] as matcher
  [pricer.py] as pricer
  [generator.py] as gen
  [analyzer.py] as analyzer
  [planner.py] as planner
  [extractor.py] as extractor
}

package "Reasoning Layer" {
  [ReasoningEngine] as engine
  note right: Single-agent mode\n(Stages A-B-C-D-E)
}

package "Multi-Agent Layer" {
  [Orchestrator] as orch
  [Classifier] as cls
  [ExpertRegistry] as reg
  [ExpertAgent] as expert

  orch --> cls : classifies sections
  orch --> reg : gets experts
  reg --> expert : creates
}

package "Data Layer (pluggable)" {
  [PriceProvider] as pp
  [GesnSqliteProvider] as gesn
  [CsvPriceProvider] as csv
  [CompositeProvider] as comp

  pp <|.. gesn
  pp <|.. csv
  pp <|.. comp
}

package "Knowledge Layer" {
  [ENCYCLOPEDIA_MASONRY] as enc1
  [ENCYCLOPEDIA_MONOLIT] as enc2
  [ENCYCLOPEDIA_ELECTRO] as enc3
  [ENCYCLOPEDIA_FASAD] as enc4
  [ENCYCLOPEDIA_KROVLYA] as enc5
  [ENCYCLOPEDIA_OVIK] as enc6
}

package "Configuration" {
  [vor_config.yaml] as yaml
  [config.py] as cfg
}

package "Database" {
  database "gesn.db" as db {
    [works (52K)]
    [resources (542K)]
    [fer_prices (34K)]
    [resource_prices (46K)]
  }
}

main --> cli
cli --> pipe
pipe --> parser
pipe --> matcher
pipe --> pricer
pipe --> gen
pipe --> engine
pipe --> orch
orch --> expert
expert --> pp
expert --> enc1
expert --> enc2
expert --> enc3
gesn --> db
cfg --> yaml
cli --> cfg

@enduml
```

---

## 6. Data Model Diagram

```plantuml
@startuml data_model

skinparam monochrome true

class VorItem {
  row_num : int
  name : str
  unit : str
  quantity : float?
  section : str
  raw_data : dict
}

class GesnMatch {
  item_idx : int
  gesn_code : str
  gesn_name : str
  gesn_unit : str
  confidence : float [0-1]
  confidence_level : "green"|"yellow"|"red"
  alternatives : list[dict]
  reasoning : str
}

class PriceResult {
  item_idx : int
  quantity : float
  gesn_code : str
  fer_direct_cost : float
  fer_labor : float
  fer_machinery : float
  fer_materials : float
  total_base : float
  resources : list[ResourceDetail]
}

class PositionBreakdown {
  item_idx : int
  item_name : str
  unit : str
  quantity : float
  works : list[WorkBreakdown]
  total_cost : float
  confidence : float
}

class WorkBreakdown {
  gesn_code : str
  gesn_name : str
  quantity : float
  materials : list[ResourceLine]
  machinery : list[ResourceLine]
  labor_lines : list[ResourceLine]
  total_cost : float
}

class ResourceLine {
  resource_code : str
  name : str
  resource_type : str
  norm_quantity : float
  total_quantity : float
  unit_price : float
  total_price : float
  is_main : bool
}

class VorResult {
  items : list[VorItem]
  matches : list[GesnMatch]
  prices : list[PriceResult]
  breakdowns : list[PositionBreakdown]
  findings : list[Finding]
  stats : dict
  vor_plan : str
  cross_check : str
}

class AgentResult {
  domain : ExpertDomain
  matches : list[GesnMatch]
  reasoning_items : list[ReasoningItem]
  breakdowns : list[PositionBreakdown]
  elapsed_seconds : float
  error : str?
}

VorItem "1" --> "0..1" GesnMatch : matched to
VorItem "1" --> "0..1" PriceResult : priced as
VorItem "1" --> "0..1" PositionBreakdown : decomposed into
PositionBreakdown "1" --> "1..*" WorkBreakdown : contains
WorkBreakdown "1" --> "0..*" ResourceLine : includes
VorResult "1" --> "0..*" VorItem
VorResult "1" --> "0..*" GesnMatch
VorResult "1" --> "0..*" PriceResult
VorResult "1" --> "0..*" PositionBreakdown

@enduml
```

---

## 7. Expert Agent Internal Flow

```plantuml
@startuml expert_flow

skinparam monochrome true

start

:Receive item_indices + items;

:Load encyclopedia from cache;
note right: Registry loads & truncates\nENCYCLOPEDIA_*.md files\n(max 12,000 chars)

:For each item:\nsearch_norms(name, collection=domain_collection);
note right: PriceProvider searches\nGESN database\nReturns top 5 candidates

:Build system prompt:\nStage_C_SYSTEM\n+ "DOMAIN EXPERTISE"\n+ encyclopedia text;
note right: Each expert gets\nits own specialized prompt

:Build user prompt:\nItems + GESN candidates\n+ volumes + units;

:Call LLM(system, user);

if (LLM succeeds?) then (yes)
  :Parse JSON response:\n{items: [...], supplements: [...]};

  :For each matched item:
  - Extract gesn_code, confidence
  - Create GesnMatch
  - Create ReasoningItem;

  :For each GESN code:\nprovider.get_resources(code, qty);
  note right: Build WorkBreakdown\nwith ResourceLines

  :Create PositionBreakdown\nfor each item;

else (no)
  :Create red-confidence\nfallback matches\nfor all items;
  note right: Error logged,\npipeline continues
endif

:Return AgentResult(domain,\nmatches, reasoning_items,\nbreakdowns, elapsed);

stop

@enduml
```

---

## 8. Configuration Flow

```plantuml
@startuml config_flow

skinparam monochrome true

start

:CLI reads --config argument;

if (config path specified?) then (yes)
  :load_config(path);
else (no)
  :Search: ./vor_config.yaml\nthen vor/vor_config.yaml;
  if (found?) then (yes)
    :load_config(found_path);
  else (no)
    :default_config();
    note right: Built-in defaults:\n- gesn_sqlite provider\n- 6 experts (masonry,\n  concrete, electrical,\n  facade, roofing, hvac)\n- tender_markup: 1.15\n- confidence: 0.70/0.40
  endif
endif

:VorConfig;

:create providers from config.providers[];
note right: Factory pattern:\n"gesn_sqlite" -> GesnSqliteProvider\n"csv" -> CsvPriceProvider

if (multiple providers?) then (yes)
  :CompositeProvider(providers);
else (no)
  :single provider;
endif

:create ExpertRegistry(provider, llm, config);

:For each section in VOR:
classify_section() -> ExpertDomain;

:For each active domain:
registry.create_expert(domain);
note right: Loads encyclopedia from\nconfig.experts[domain].encyclopedia\npath relative to project_root

stop

@enduml
```

---

## 9. Scalability Points

```
+---------------------------------------------+
|          HOW TO EXTEND THE SYSTEM            |
+---------------------------------------------+
|                                              |
|  NEW PRICE SOURCE:                           |
|  1. Implement PriceProvider ABC              |
|  2. Add to vor_config.yaml:                  |
|     providers:                               |
|       - type: my_source                      |
|         path: data/prices.db                 |
|  3. Register in config.py factory            |
|  4. Done. Zero engine changes.               |
|                                              |
+---------------------------------------------+
|                                              |
|  NEW EXPERT DOMAIN:                          |
|  1. Write ENCYCLOPEDIA_MY.md                 |
|  2. Add to vor_config.yaml:                  |
|     experts:                                 |
|       my_domain:                             |
|         collections: ["XX"]                  |
|         keywords: ["keyword1"]               |
|         encyclopedia: skills/my/ENC.md       |
|  3. Done. Zero code changes.                 |
|                                              |
+---------------------------------------------+
|                                              |
|  UPDATE PRICES:                              |
|  1. Replace CSV/DB file                      |
|  2. Or add as new provider                   |
|     (CompositeProvider handles priority)      |
|  3. Restart CLI                              |
|                                              |
+---------------------------------------------+
```

---

## 10. File Map

```
vor/
|
|-- models.py              Data models (VorItem, GesnMatch, ExpertDomain, AgentResult, ...)
|-- pipeline.py            VorPipeline (run, run_smart, run_multiagent)
|-- parser.py              Excel VOR parser
|-- matcher.py             Deterministic GESN matching
|-- analyzer.py            Model intelligence (multi-layer, implicit work, waste)
|-- pricer.py              FER price lookup + resource breakdown
|-- generator.py           Excel output (v2: 4 sheets, v3: nested)
|-- reasoning.py           ReasoningEngine (4-stage LLM) + public helpers
|-- reporter.py            Markdown report generation
|-- planner.py             Revit extraction planning
|-- extractor.py           C# code generation for Revit
|-- config.py              VorConfig + load_config + factory
|-- vor_config.yaml        Default configuration
|-- cli.py                 CLI entry point
|-- __main__.py            python -m vor
|
|-- providers/
|   |-- base.py            PriceProvider ABC + data classes
|   |-- gesn_sqlite.py     GESN/FER SQLite provider
|   |-- csv_provider.py    CSV price provider
|   |-- composite.py       Multi-source combinator
|
|-- agents/
|   |-- classifier.py      Section -> ExpertDomain mapping
|   |-- expert.py          ExpertAgent (LLM + encyclopedia)
|   |-- registry.py        Expert factory + encyclopedia loader
|   |-- orchestrator.py    Multi-agent coordinator (parallel dispatch)
|
tests/test_vor/
|-- test_analyzer.py       41 tests
|-- test_classifier.py     20 tests
|-- test_cli.py            5 tests
|-- test_config.py         16 tests
|-- test_csv_provider.py   17 tests
|-- test_expert.py         13 tests
|-- test_extractor.py      14 tests
|-- test_generator.py      20 tests
|-- test_integration.py    18 tests
|-- test_matcher.py        20 tests
|-- test_orchestrator.py   14 tests
|-- test_parser.py         8 tests
|-- test_pipeline.py       28 tests
|-- test_planner.py        19 tests
|-- test_pricer.py         19 tests
|-- test_providers.py      22 tests
|-- test_reasoning.py      23 tests
|-- test_reporter.py       23 tests
|                          ----
|                          372 total tests
|-- fixtures/
    |-- test_vor_multi_section.xlsx
```
