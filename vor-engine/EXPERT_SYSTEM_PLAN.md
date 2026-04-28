# VOR Expert System Plan

## Mission

Build an expert-grade automatic pricing system for arbitrary VOR inputs.
The system must not be optimized for one workbook. It must generalize across:

- different structure styles
- different section naming conventions
- mixed units
- incomplete or noisy descriptions
- varying domain mixes inside the same VOR

Monolith and masonry are the first production-grade domains. They are not the
end goal; they are the template for the full system.

## North Star

For every priced position, the system should be able to answer:

1. What type of construction work is this?
2. Why was this domain chosen?
3. Which archetype/template was selected?
4. Which normative or market-backed components form the composition?
5. Why are the quantities of those components correct?
6. Why are the prices of those components correct?
7. Why is the final per-unit total plausible for Moscow 2025?
8. If confidence is low, what exactly is missing or ambiguous?

If the system cannot answer those questions honestly, it must fail explicitly
instead of producing a fake "complete" estimate.

## Core Design Principles

### 1. Deterministic core, LLM at the edges

The LLM should not invent the economic model from scratch.
The LLM is strongest at:

- noisy text understanding
- section/domain classification
- archetype selection
- ambiguity resolution
- supplement suggestions
- final review commentary

The deterministic core must own:

- unit conversion
- quantity formulas
- mandatory composition rules
- benchmark gating
- duplicate prevention
- price source priority
- failure handling

### 2. Honest failure beats fake confidence

If a work code, resource price, or composition element is not found, the system
must report the gap. Hidden fallbacks and "typical prices" should never mask
quality problems in production mode.

### 3. One position = one explicit pricing story

Each priced position must have:

- inferred domain
- inferred archetype
- normalized measurement model
- structured composition
- structured pricing trace
- validation result

### 4. Validator is a gate, not an observer

Validation must stop bad output from graduating into the final workbook.
Warnings are review inputs. Errors are blockers.

### 5. Self-evaluation is part of runtime maturity

Every iteration needs an evaluator that can inspect generated Excel files and
surface:

- bad or missing composition
- zero-priced rows
- weak benchmark fit
- suspicious fallback notes
- domain mismatch
- positions that are too thin to be estimator-grade

## Target Architecture

### Layer 1. Parse and normalize

Goal:

- recognize parent vs leaf rows
- normalize units
- preserve original row identity
- capture section context

Output:

- normalized VOR positions

### Layer 2. Structural understanding

Goal:

- infer section meaning
- identify mixed-domain sections
- identify ambiguity signals
- route positions individually when section-level routing is too coarse

Output:

- domain candidates per position
- ambiguity flags

### Layer 3. Domain router

Goal:

- assign each position to a domain expert
- support hybrid positions and escalation when needed

Output:

- `PositionIntent(domain, subtype, confidence, rationale)`

### Layer 4. Archetype resolver

Goal:

- map free-text positions to reusable construction archetypes

Examples:

- `concrete_slab`
- `concrete_wall`
- `concrete_foundation`
- `masonry_block_partition`
- `masonry_block_wall`
- `masonry_brick_partition`

Output:

- `PositionArchetype`

### Layer 5. Composition builder

Goal:

- assemble a full structured composition from:
  - normative database
  - deterministic archetype defaults
  - domain supplements
  - project-specific modifiers

Rules:

- avoid duplicate accounting
- separate work / material / machinery / labor explicitly
- make quantity formulas inspectable

Output:

- structured composition lines

### Layer 6. Pricing engine

Goal:

- price each composition line from declared sources

Priority:

1. normative DB source when reliable
2. verified market matrix / encyclopedia source
3. approved domain-specific supplemental rule
4. explicit NOT_FOUND

Output:

- priced composition lines with price provenance

### Layer 7. Validation gate

Checks:

- mandatory components present
- units consistent
- no zero-priced critical items
- no suspicious duplicate resources
- benchmark fit per unit
- cross-position consistency

Output:

- pass / warning / error

### Layer 8. Output and audit

The output workbook should contain enough trace to audit pricing quality.
The post-run evaluator should be able to read the workbook and explain where
the system is weak.

## Domain Strategy

### Phase 1: Monolith and Masonry

These two domains become the reference implementation for the whole platform.

They must define:

- archetype catalog
- mandatory composition rules
- deterministic quantity formulas
- benchmark envelopes
- explicit rejection rules
- Excel evaluator heuristics

### Phase 2: Generalize the framework

After monolith and masonry are stable, the same mechanism extends to:

- earthworks
- facade
- roofing
- finishing
- engineering systems

The extension point is not "new prompt text". It is:

- new archetypes
- new domain rules
- new benchmarks
- new supplements

## Iteration Loop

Each improvement cycle must run in this order:

1. Analyze current failures
2. Choose the narrowest high-leverage implementation slice
3. Implement
4. Run pipeline on real VOR output
5. Run evaluator on produced workbook
6. Manually inspect representative positions
7. Record what improved, what regressed, what stayed ambiguous
8. Plan the next slice

The loop should optimize for system capability, not for a single workbook.

## Immediate Roadmap

### Slice A. Build the self-evaluation tool

Needed so every later iteration has a stable measuring stick.

### Slice B. Replace freeform monolith and masonry composition with
deterministic-core archetype resolution

Initial target:

- monolith: slab, wall, foundation, column
- masonry: gas-block partition, gas-block wall, brick partition

### Slice C. Turn validation into a real gate

Bad positions should not silently pass into final output.

### Slice D. Expand domain completeness

Add richer support for:

- modifiers
- mixed positions
- demolition/rework variants
- honest partial outputs

## Definition of Success

The system is on the right path when:

- it can explain every good estimate
- it refuses to pretend when evidence is weak
- it improves via measurable iteration
- monolith and masonry outputs look like an estimator assembled them
- the same architecture can absorb new domains without redesign
