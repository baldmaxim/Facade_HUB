"""AI-Smetчик agent — reasoning-based VOR pricing.

Each VOR position is processed by an LLM agent that:
1. Searches for the best ГЭСН code
2. Gets normative composition from DB
3. Prices each resource
4. Checks against benchmarks
5. Iterates if something is wrong

Supports two modes:
- Gemini 3.1 Pro via API (automatic function calling)
- Claude Code batch (manual, generates prompts for human processing)
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from vor.agent.tools import (
    ToolContext,
    calculate_total,
    check_benchmark,
    get_composition,
    get_encyclopedia,
    get_price,
    search_gesn,
    search_resource,
)

logger = logging.getLogger("vor_agent.smetcik")


# ═══════════════════════════════════════════════════════════════════════
# Tool definitions for Gemini function calling
# ═══════════════════════════════════════════════════════════════════════

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_gesn",
            "description": "Поиск ГЭСН кодов по описанию работ. Возвращает топ-10 кандидатов с именами и кодами.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Поисковый запрос (ключевые слова работы)"},
                    "collection": {"type": "string", "description": "Код сборника ГЭСН (01-33), опционально"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_composition",
            "description": "Получить нормативный состав ресурсов для ГЭСН кода из базы. Возвращает материалы, механизмы, труд с нормами расхода на единицу.",
            "parameters": {
                "type": "object",
                "properties": {
                    "gesn_code": {"type": "string", "description": "Код ГЭСН (например 08-02-001-01)"},
                },
                "required": ["gesn_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_price",
            "description": "Получить цену ресурса по коду из базы ФССЦ/ФЕР. Возвращает цену в базисе 2022 и пересчитанную в 2025.",
            "parameters": {
                "type": "object",
                "properties": {
                    "resource_code": {"type": "string", "description": "Код ресурса (например 01.7.03.01-0001)"},
                },
                "required": ["resource_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_resource",
            "description": "Поиск ресурсов по названию (нечёткий поиск). Используй если код ресурса не найден или нужна альтернатива.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Название ресурса для поиска"},
                    "unit": {"type": "string", "description": "Единица измерения (опционально, для фильтра)"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_total",
            "description": "Рассчитать полную стоимость позиции: берёт состав из базы, расценивает каждый ресурс, умножает на объём, применяет индексы.",
            "parameters": {
                "type": "object",
                "properties": {
                    "gesn_code": {"type": "string", "description": "Код ГЭСН"},
                    "quantity": {"type": "number", "description": "Объём работ (из ВОР)"},
                },
                "required": ["gesn_code", "quantity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_benchmark",
            "description": "Проверить цену за единицу по рыночным диапазонам. Показывает OK/LOW/HIGH и рекомендуемый диапазон.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_description": {"type": "string", "description": "Описание работы"},
                    "unit": {"type": "string", "description": "Единица измерения"},
                    "price_per_unit": {"type": "number", "description": "Цена за единицу для проверки"},
                },
                "required": ["work_description", "unit", "price_per_unit"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_resource_by_name",
            "description": "Поиск ресурсов по названию с ценами. Используй для поиска альтернативных ресурсов.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Название для поиска"},
                    "unit": {"type": "string", "description": "Единица измерения (опционально)"},
                },
                "required": ["name"],
            },
        },
    },
]


# ═══════════════════════════════════════════════════════════════════════
# System prompt
# ═══════════════════════════════════════════════════════════════════════


def build_system_prompt(domain: str, encyclopedia_text: str = "") -> str:
    """Build system prompt for the AI-Smetчик agent.

    Includes PRICING_PRINCIPLES.md and composition_templates.yaml automatically.
    """
    # Load mandatory principles
    principles_path = Path(__file__).parent / "PRICING_PRINCIPLES.md"
    principles_text = ""
    if principles_path.exists():
        principles_text = principles_path.read_text(encoding="utf-8")

    # Load composition templates
    templates_path = Path(__file__).parent / "composition_templates.yaml"
    templates_text = ""
    if templates_path.exists():
        templates_text = templates_path.read_text(encoding="utf-8")

    enc_section = ""
    if encyclopedia_text:
        # Trim to ~80K chars to leave room for tools + reasoning
        if len(encyclopedia_text) > 80000:
            encyclopedia_text = encyclopedia_text[:80000] + "\n\n[...обрезано...]"
        enc_section = f"""

## ЭКСПЕРТНЫЕ ЗНАНИЯ РАЗДЕЛА

{encyclopedia_text}
"""

    return f"""Ты — эксперт-сметчик с 20-летним стажем. Расцениваешь позиции ВОР (Ведомость объёмов работ) для ЖК бизнес-класса в Москве.

## ОБЯЗАТЕЛЬНЫЕ ПРИНЦИПЫ РАСЦЕНКИ

{principles_text}

## ШАБЛОНЫ СОСТАВОВ

{templates_text}

## ДОМЕН: {domain}

## ТВОЯ ЗАДАЧА

Для каждой позиции ВОР:
1. НАЙДИ правильный ГЭСН код через search_gesn()
2. ВОЗЬМИ нормативный состав из базы через get_composition() — НЕ ВЫДУМЫВАЙ состав сам
3. РАССЧИТАЙ стоимость через calculate_total()
4. ПРОВЕРЬ итог через check_benchmark()
5. Если что-то не сходится — РАЗБЕРИСЬ и исправь

## ПРАВИЛА

- Состав работ ВСЕГДА бери из базы ГЭСН (get_composition), НЕ придумывай
- Если ресурс не имеет цены — ищи альтернативу через search_resource()
- Если цена не найдена НИКАКИМ способом — честно пиши "НЕ НАЙДЕНА", не подставляй типовую
- Проверяй единицы измерения: "100 м2" в базе = цена за 100 единиц
- Каждую позицию ОБЯЗАТЕЛЬНО проверь через check_benchmark()

## ИНДЕКСЫ (ФСНБ-2022 → 2025)

- ФЕР (прямые затраты работ): × 2.12 (инфляция 1.18 × НР+СП+НДС 1.8)
- ФССЦ (ресурсные цены): × 1.18 (только инфляция)
- Труд: 873 руб/чел-ч (740 базис × 1.18)
- НИКОГДА не применяй индекс 9.0 — база уже 2022, не 2001
{enc_section}
## ФОРМАТ ОТВЕТА

Для каждой позиции верни JSON:
```json
{{
  "position_idx": 0,
  "gesn_code": "08-02-001-01",
  "gesn_name": "Название из базы",
  "reasoning": "Выбрал этот код потому что...",
  "composition": [
    {{"type": "material", "code": "...", "name": "...", "unit": "м3",
      "norm_qty": 0.24, "total_qty": 120.0, "unit_price_2025": 2800,
      "price_source": "ФССЦ", "line_total": 336000}},
    ...
  ],
  "position_total": 1850000,
  "per_unit": 3700,
  "benchmark": {{"status": "OK", "range": "3000-5000"}},
  "warnings": [],
  "not_found_items": [],
  "confidence": "HIGH"
}}
```
"""


# ═══════════════════════════════════════════════════════════════════════
# Tool executor — dispatches function calls to implementations
# ═══════════════════════════════════════════════════════════════════════


def execute_tool(ctx: ToolContext, name: str, args: dict) -> Any:
    """Execute a tool by name with given arguments."""
    if name == "search_gesn":
        return search_gesn(ctx, args["query"], args.get("collection"), args.get("limit", 10))
    elif name == "get_composition":
        return get_composition(ctx, args["gesn_code"])
    elif name == "get_price":
        return get_price(ctx, args["resource_code"])
    elif name == "search_resource" or name == "search_resource_by_name":
        return search_resource(ctx, args["name"], args.get("unit"))
    elif name == "calculate_total":
        return calculate_total(ctx, args["gesn_code"], args["quantity"])
    elif name == "check_benchmark":
        return check_benchmark(args["work_description"], args["unit"], args["price_per_unit"])
    else:
        return {"error": f"Unknown tool: {name}"}


# ═══════════════════════════════════════════════════════════════════════
# Agent result
# ═══════════════════════════════════════════════════════════════════════


@dataclass
class PositionResult:
    """Result of pricing one VOR position."""
    position_idx: int
    gesn_code: str = ""
    gesn_name: str = ""
    reasoning: str = ""
    composition: list[dict] = field(default_factory=list)
    position_total: float = 0.0
    per_unit: float = 0.0
    benchmark_status: str = ""
    warnings: list[str] = field(default_factory=list)
    not_found_items: list[str] = field(default_factory=list)
    confidence: str = "LOW"
    tool_calls: int = 0
    raw_response: str = ""


@dataclass
class DomainResult:
    """Result of pricing all positions in a domain."""
    domain: str
    positions: list[PositionResult] = field(default_factory=list)
    total_cost: float = 0.0
    coverage_pct: float = 0.0
    elapsed_seconds: float = 0.0


# ═══════════════════════════════════════════════════════════════════════
# Gemini Agent Runner
# ═══════════════════════════════════════════════════════════════════════


async def run_gemini_agent(
    positions: list[dict],
    domain: str,
    ctx: ToolContext,
    encyclopedia_text: str = "",
    model: str = "gemini-3.1-pro-preview",
    max_turns: int = 15,
) -> DomainResult:
    """Run AI-Smetчик agent on positions using Gemini function calling.

    Args:
        positions: List of {idx, name, unit, quantity, section}
        domain: Expert domain name
        ctx: Tool context with DB connection
        encyclopedia_text: Full encyclopedia for this domain
        model: Gemini model name
        max_turns: Max agent turns per position (safety limit)

    Returns:
        DomainResult with priced positions
    """
    from vor.llm_runtime import GeminiPool

    t0 = time.time()
    system_prompt = build_system_prompt(domain, encyclopedia_text)
    result = DomainResult(domain=domain)

    pool = GeminiPool()
    await pool.initialize()

    for pos in positions:
        pos_result = await _process_single_position(
            pool, ctx, system_prompt, pos, model, max_turns
        )
        result.positions.append(pos_result)
        logger.info(
            "Position %d: %s total=%.0f per_unit=%.0f tools=%d conf=%s",
            pos["idx"], pos_result.gesn_code, pos_result.position_total,
            pos_result.per_unit, pos_result.tool_calls, pos_result.confidence,
        )

    result.total_cost = sum(p.position_total for p in result.positions)
    priced = sum(1 for p in result.positions if p.position_total > 0)
    result.coverage_pct = priced / len(result.positions) * 100 if result.positions else 0
    result.elapsed_seconds = time.time() - t0

    return result


async def _process_single_position(
    pool,
    ctx: ToolContext,
    system_prompt: str,
    position: dict,
    model: str,
    max_turns: int,
) -> PositionResult:
    """Process a single VOR position through the agent loop."""
    from vor.llm_runtime import _convert_tools_to_gemini

    pos_result = PositionResult(position_idx=position["idx"])

    user_message = (
        f"Расцени позицию ВОР:\n"
        f"Название: {position['name']}\n"
        f"Единица: {position['unit']}\n"
        f"Объём: {position['quantity']}\n"
        f"Раздел: {position.get('section', '')}\n\n"
        f"Найди ГЭСН код, возьми состав из базы, расцени, проверь по бенчмарку."
    )

    messages = [
        {"role": "user", "content": user_message},
    ]

    gemini_tools = _convert_tools_to_gemini(TOOL_DEFINITIONS)

    for turn in range(max_turns):
        try:
            response = await pool.generate(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                tools=gemini_tools,
                temperature=0.1,
                max_tokens=4096,
            )
        except Exception as e:
            logger.error("Gemini error on pos %d turn %d: %s", position["idx"], turn, e)
            pos_result.warnings.append(f"LLM error: {e}")
            break

        # Check for function calls
        func_calls = _extract_function_calls(response)

        if func_calls:
            # Execute tools and feed results back
            tool_results = []
            for fc in func_calls:
                tool_result = execute_tool(ctx, fc["name"], fc["args"])
                tool_results.append({
                    "name": fc["name"],
                    "result": tool_result,
                })
                pos_result.tool_calls += 1

            # Add assistant + tool results to messages
            messages.append({"role": "assistant", "content": response})
            for tr in tool_results:
                messages.append({
                    "role": "function",
                    "name": tr["name"],
                    "content": json.dumps(tr["result"], ensure_ascii=False, default=str),
                })
        else:
            # Final text response — parse JSON result
            text = _extract_text(response)
            pos_result.raw_response = text
            _parse_agent_response(text, pos_result)
            break

    return pos_result


# ═══════════════════════════════════════════════════════════════════════
# Claude Code Batch Mode
# ═══════════════════════════════════════════════════════════════════════


def generate_batch_prompts(
    positions: list[dict],
    domain: str,
    encyclopedia_text: str = "",
    batch_size: int = 5,
) -> list[dict]:
    """Generate batch prompt files for Claude Code manual processing.

    Smaller batches (5 instead of 25) so Claude can reason deeply per position.
    """
    system_prompt = build_system_prompt(domain, encyclopedia_text)
    batches = []

    for i in range(0, len(positions), batch_size):
        batch = positions[i:i + batch_size]
        user_prompt = "Расцени следующие позиции ВОР. Для КАЖДОЙ позиции:\n"
        user_prompt += "1. Найди ГЭСН код (search_gesn)\n"
        user_prompt += "2. Возьми состав из базы (get_composition)\n"
        user_prompt += "3. Рассчитай стоимость (calculate_total)\n"
        user_prompt += "4. Проверь бенчмарк (check_benchmark)\n\n"

        for pos in batch:
            user_prompt += f"### Позиция {pos['idx']}\n"
            user_prompt += f"Название: {pos['name']}\n"
            user_prompt += f"Единица: {pos['unit']}\n"
            user_prompt += f"Объём: {pos['quantity']}\n"
            user_prompt += f"Раздел: {pos.get('section', '')}\n\n"

        batches.append({
            "batch_id": f"{domain}_{i:04d}",
            "domain": domain,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "positions": batch,
            "tool_descriptions": TOOL_DEFINITIONS,
        })

    return batches


# ═══════════════════════════════════════════════════════════════════════
# Response parsing helpers
# ═══════════════════════════════════════════════════════════════════════


def _extract_function_calls(response) -> list[dict]:
    """Extract function calls from Gemini response."""
    calls = []
    if isinstance(response, dict):
        # Handle Gemini API response format
        candidates = response.get("candidates", [])
        for candidate in candidates:
            content = candidate.get("content", {})
            parts = content.get("parts", [])
            for part in parts:
                fc = part.get("functionCall")
                if fc:
                    calls.append({
                        "name": fc.get("name", ""),
                        "args": fc.get("args", {}),
                    })
    elif isinstance(response, str):
        # Try to extract tool calls from text (Claude Code mode)
        pass
    return calls


def _extract_text(response) -> str:
    """Extract text content from Gemini response."""
    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        candidates = response.get("candidates", [])
        for candidate in candidates:
            content = candidate.get("content", {})
            parts = content.get("parts", [])
            for part in parts:
                if "text" in part:
                    return part["text"]
    return ""


def _parse_agent_response(text: str, result: PositionResult):
    """Parse agent's final JSON response into PositionResult."""
    import re

    # Try to extract JSON from response
    json_match = re.search(r"\{[\s\S]*\}", text)
    if not json_match:
        result.warnings.append("No JSON in agent response")
        return

    try:
        data = json.loads(json_match.group())
    except json.JSONDecodeError:
        result.warnings.append("Invalid JSON in agent response")
        return

    result.gesn_code = data.get("gesn_code", "")
    result.gesn_name = data.get("gesn_name", "")
    result.reasoning = data.get("reasoning", "")
    result.composition = data.get("composition", [])
    result.position_total = data.get("position_total", 0)
    result.per_unit = data.get("per_unit", 0)
    result.confidence = data.get("confidence", "LOW")

    bench = data.get("benchmark", {})
    result.benchmark_status = bench.get("status", "")

    result.warnings.extend(data.get("warnings", []))
    result.not_found_items.extend(data.get("not_found_items", []))
