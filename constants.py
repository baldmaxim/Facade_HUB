"""Shared price index constants for VOR pricing engine.

Our gesn.db contains ФСНБ-2022 edition (price_level = '01.01.2022').
FER direct_cost = прямые затраты (без накладных расходов и сметной прибыли).
ФССЦ resource_prices = цены в уровне ФСНБ-2022.

Для получения полной сметной стоимости:
  full_cost = direct_cost × INFLATION_INDEX × OVERHEAD_FACTOR

Values are loaded from vor_config.yaml if available, with hardcoded defaults
as fallback. This ensures the pipeline works even without the config file.
"""

from pathlib import Path

import yaml

# ── Load from config (if available) ──────────────────────────────────

_CONFIG_PATH = Path(__file__).parent / "vor_config.yaml"
_indices: dict = {}

if _CONFIG_PATH.exists():
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            _cfg = yaml.safe_load(f) or {}
        _indices = _cfg.get("indices", {})
    except Exception:
        pass  # Fall through to defaults

# ── Defaults (used when config is missing or incomplete) ─────────────

# Инфляция 2022 → 2025 (~5-6% годовых × 3 года)
INFLATION_INDEX_2025: float = _indices.get("inflation", 1.18)

# Коэффициент накладных расходов + сметной прибыли
# НР (накладные расходы): ~80-120% от ФОТ ≈ +30-50% от прямых затрат
# СП (сметная прибыль): ~40-65% от ФОТ ≈ +15-25% от прямых затрат
# Итого НР+СП ≈ +50-70% → множитель 1.5-1.7
# Плюс НДС 20% → × 1.2
# Итого: direct_cost × 1.6 × 1.2 ≈ × 1.9-2.0
OVERHEAD_PROFIT_FACTOR: float = _indices.get("overhead_profit", 1.8)  # НР + СП + НДС (среднее)

# Комбинированный индекс для FER: инфляция × НР+СП
FER_INDEX_2025: float = round(INFLATION_INDEX_2025 * OVERHEAD_PROFIT_FACTOR, 2)  # ~2.12

# ФССЦ (ресурсные цены) — уже включают отпускную цену, нужна только инфляция
FSSC_INDEX_2025: float = INFLATION_INDEX_2025  # 1.18

# Labor index: ставка рабочего 2022 → 2025
LABOR_INDEX_2025: float = INFLATION_INDEX_2025  # 1.18

# Standard labor rate: ~740 руб/чел-ч (ФСНБ-2022) × inflation
_LABOR_BASE: float = _indices.get("labor_base_rate", 740)
STANDARD_LABOR_RATE: float = _LABOR_BASE * INFLATION_INDEX_2025  # ~873 руб/чел-ч
