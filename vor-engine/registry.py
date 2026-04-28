"""Expert registry -- creates and configures ExpertAgent instances."""
from __future__ import annotations

import logging
from pathlib import Path

from vor.config import ExpertConfig, VorConfig, default_config
from vor.models import ExpertDomain
from vor.providers.base import PriceProvider

logger = logging.getLogger(__name__)

# Default encyclopedia directories (relative to project root)
_DEFAULT_EXPERT_DIRS: dict[str, str] = {
    "masonry": "skills/kladka-expert",
    "concrete": "skills/monolit-expert",
    "electrical": "skills/electro-expert",
    "facade": "skills/fasad-expert",
    "roofing": "skills/krovlya-expert",
    "hvac": "skills/ovik-expert",
    "earthworks": "skills/zemlya-expert",
    "finishing": "skills/otdelka-expert",
    "low_voltage": "skills/slabotek-expert",
    "doors": "skills/dveri-expert",
    "landscaping": "skills/blagoustroistvo-expert",
    "ext_networks": "skills/naruzhnye-seti-expert",
}


class ExpertRegistry:
    """Creates ExpertAgent instances with loaded encyclopedias."""

    _MAX_CACHE_SIZE = 20

    def __init__(
        self,
        provider: PriceProvider,
        llm_callback,  # async (system, user) -> str
        config: VorConfig | None = None,
        project_root: str | Path | None = None,
    ):
        self._provider = provider
        self._llm = llm_callback
        self._config = config or default_config()
        self._project_root = (
            Path(project_root) if project_root else self._find_project_root()
        )
        self._encyclopedia_cache: dict[str, str] = {}

    def _find_project_root(self) -> Path:
        """Find project root by searching upward for skills/ or CLAUDE.md."""
        # Start from this file's location and walk up
        current = Path(__file__).resolve().parent
        for _ in range(10):  # max 10 levels up
            if (current / "skills").is_dir() or (current / "CLAUDE.md").is_file():
                return current
            parent = current.parent
            if parent == current:
                break
            current = parent
        # Fallback: try cwd
        if (Path.cwd() / "skills").is_dir():
            return Path.cwd()
        return Path.cwd()

    def create_expert(self, domain: ExpertDomain) -> "ExpertAgent":
        """Create an ExpertAgent for the given domain."""
        from vor.agents.expert import ExpertAgent

        domain_key = domain.value
        expert_cfg = self._config.experts.get(
            domain_key, ExpertConfig(domain=domain_key)
        )

        encyclopedia = self._load_encyclopedia(domain_key, expert_cfg)

        return ExpertAgent(
            domain=domain,
            provider=self._provider,
            llm_callback=self._llm,
            encyclopedia_text=encyclopedia,
            collections=expert_cfg.collections,
            waste_defaults=expert_cfg.waste_defaults,
        )

    def _load_encyclopedia(self, domain_key: str, cfg: ExpertConfig) -> str:
        """Load and cache encyclopedia text for a domain.

        Reads the main encyclopedia file + supplements.
        Truncates to config.encyclopedia_max_chars.
        """
        if domain_key in self._encyclopedia_cache:
            return self._encyclopedia_cache[domain_key]

        max_chars = self._config.encyclopedia_max_chars
        parts: list[str] = []

        # Load main encyclopedia
        enc_path = cfg.encyclopedia
        if enc_path:
            full_path = self._project_root / enc_path
            if full_path.is_file():
                text = full_path.read_text(encoding="utf-8", errors="ignore")
                parts.append(text)
            else:
                logger.warning("Encyclopedia not found: %s", full_path)
        else:
            # Try default directory
            default_dir = _DEFAULT_EXPERT_DIRS.get(domain_key, "")
            if default_dir:
                dir_path = self._project_root / default_dir
                if dir_path.is_dir():
                    # Look for ENCYCLOPEDIA*.md files, prefer _FINAL
                    enc_files = sorted(dir_path.glob("ENCYCLOPEDIA*.md"))
                    for enc_file in enc_files:
                        text = enc_file.read_text(encoding="utf-8", errors="ignore")
                        parts.append(text)
                        break  # Take first match

        # Load supplements
        for sup_path in cfg.supplements:
            full_path = self._project_root / sup_path
            if full_path.is_file():
                text = full_path.read_text(encoding="utf-8", errors="ignore")
                parts.append(f"\n\n## Дополнение\n\n{text}")

        if not parts and domain_key not in ("general",):
            logger.warning(
                "No encyclopedia found for domain '%s'. LLM quality will be degraded.",
                domain_key,
            )

        combined = "\n\n".join(parts)

        # Truncate if needed
        if len(combined) > max_chars:
            combined = self._truncate_encyclopedia(combined, max_chars)

        # Safety: evict oldest entry if cache is full
        if len(self._encyclopedia_cache) >= self._MAX_CACHE_SIZE:
            oldest_key = next(iter(self._encyclopedia_cache))
            del self._encyclopedia_cache[oldest_key]
            logger.warning("Encyclopedia cache evicted '%s' (max size %d)", oldest_key, self._MAX_CACHE_SIZE)

        self._encyclopedia_cache[domain_key] = combined
        return combined

    def _truncate_encyclopedia(self, text: str, max_chars: int) -> str:
        """Truncate encyclopedia keeping most valuable content at the top."""
        if len(text) <= max_chars:
            return text
        truncated = text[:max_chars]
        # Try to break at a paragraph boundary
        last_para = truncated.rfind("\n\n")
        if last_para > max_chars * 0.8:
            truncated = truncated[:last_para]
        return truncated + "\n\n[...энциклопедия обрезана...]"
