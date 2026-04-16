"""CLI entry point for VOR auto-pricing.

Usage:
    python -m vor.cli input.xlsx
    python -m vor.cli input.xlsx output.xlsx
    python -m vor.cli input.xlsx --mode=mvp
    python -m vor.cli input.xlsx --mode=multiagent
    python -m vor.cli input.xlsx --config=my_config.yaml
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from pathlib import Path

logger = logging.getLogger("vor")


def _find_gesn_db() -> str:
    """Find gesn.db in standard locations."""
    candidates = [
        Path("data/gesn.db"),
        Path("backend/data/gesn.db"),
        Path(__file__).parent.parent.parent / "data" / "gesn.db",  # relative to package root
    ]
    for p in candidates:
        if p.is_file():
            return str(p.resolve())
    return "data/gesn.db"  # default, may fail


def _create_llm_callback(model: str = ""):
    """Create LLM callback from environment variables.

    Checks for API keys in order:
    1. GEMINI_API_KEY -> litellm("gemini/...")
    2. ANTHROPIC_API_KEY -> litellm("anthropic/...")
    3. OPENROUTER_API_KEY -> litellm("openrouter/...")
    4. OPENAI_API_KEY -> litellm("openai/...")
    5. VOR_LLM_API_KEY -> litellm(VOR_LLM_MODEL / provided model)

    Falls back to None if no key found (MVP mode only).
    """
    # Try to load .env
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    api_key = None
    resolved_model = model
    api_base = None

    if os.environ.get("GEMINI_API_KEY"):
        api_key = os.environ["GEMINI_API_KEY"]
        resolved_model = resolved_model or "gemini/gemini-2.0-flash"
    elif os.environ.get("ANTHROPIC_API_KEY"):
        api_key = os.environ["ANTHROPIC_API_KEY"]
        resolved_model = resolved_model or "anthropic/claude-sonnet-4-6"
    elif os.environ.get("OPENROUTER_API_KEY"):
        api_key = os.environ["OPENROUTER_API_KEY"]
        resolved_model = resolved_model or "openrouter/qwen/qwen3.6-plus:free"
    elif os.environ.get("OPENAI_API_KEY"):
        api_key = os.environ["OPENAI_API_KEY"]
        resolved_model = resolved_model or "openai/gpt-4o-mini"
    elif os.environ.get("VOR_LLM_API_KEY"):
        api_key = os.environ["VOR_LLM_API_KEY"]
        api_base = os.environ.get("VOR_LLM_API_BASE")
        resolved_model = (
            resolved_model
            or os.environ.get("VOR_LLM_MODEL", "")
            or "openrouter/qwen/qwen3.6-plus:free"
        )

    if not api_key:
        return None

    try:
        import litellm
    except ImportError:
        print("ERROR: litellm not installed. Run: pip install litellm", file=sys.stderr)
        return None

    async def callback(system_prompt: str, user_prompt: str) -> str:
        kwargs = {
            "model": resolved_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 16384,
            "api_key": api_key,
        }
        if api_base:
            kwargs["api_base"] = api_base
        response = await litellm.acompletion(**kwargs)
        return response.choices[0].message.content or ""

    return callback


async def run_cli(args: argparse.Namespace) -> int:
    """Main CLI execution."""
    from vor.pipeline import VorPipeline
    from vor.config import load_config, default_config
    from vor.generator import generate_vor_excel, generate_vor_excel_v3

    input_path = Path(args.input)
    if not input_path.is_file():
        print(f"ERROR: File not found: {input_path}", file=sys.stderr)
        return 1

    # Determine output path
    output_path = Path(args.output) if args.output else input_path.with_name(
        input_path.stem + "_priced" + input_path.suffix
    )

    # Load config
    config = load_config(args.config) if args.config else default_config()

    # Read input file
    file_bytes = input_path.read_bytes()
    mode = args.mode

    print(f"Input file: {input_path}")
    print(f"Mode: {mode}")

    # Create progress callback
    def on_progress(stage: str, pct: float, msg: str) -> None:
        bar_len = 30
        filled = int(bar_len * pct)
        bar = "#" * filled + "-" * (bar_len - filled)
        print(f"\r  [{bar}] {pct*100:5.1f}% {msg}", end="", flush=True)
        if pct >= 1.0:
            print()

    # Find gesn.db
    gesn_db = _find_gesn_db()
    pipeline = VorPipeline(gesn_db_path=gesn_db)

    start_time = time.monotonic()

    if mode == "mvp":
        # MVP: no LLM, deterministic
        print("Running MVP pipeline (no LLM)...")
        result = await pipeline.run(file_bytes=file_bytes, on_progress=on_progress)
        excel_bytes = generate_vor_excel(result)

    elif mode == "multiagent":
        # Multi-agent: requires LLM
        llm_callback = _create_llm_callback(config.llm.get("model", ""))
        if not llm_callback:
            print("WARNING: No API key found. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY")
            print("WARNING: Falling back to MVP mode...")
            mode = "mvp"
            result = await pipeline.run(file_bytes=file_bytes, on_progress=on_progress)
            excel_bytes = generate_vor_excel(result)
        else:
            print("Running multi-agent pipeline...")
            # Try to use run_multiagent if available, otherwise run_smart
            try:
                from vor.providers.gesn_sqlite import GesnSqliteProvider
                provider = GesnSqliteProvider(gesn_db)
                result = await pipeline.run_multiagent(
                    file_bytes=file_bytes,
                    provider=provider,
                    llm_callback=llm_callback,
                    config=config,
                    on_progress=on_progress,
                    project_root=str(Path(gesn_db).parent.parent),
                )
            except AttributeError:
                # run_multiagent not yet available, use run_smart
                print("WARNING: run_multiagent not available, using run_smart...")
                result = await pipeline.run_smart(
                    file_bytes=file_bytes,
                    llm_callback=llm_callback,
                    on_progress=on_progress,
                )
            excel_bytes = generate_vor_excel_v3(result) if result.breakdowns else generate_vor_excel(result)

    elif mode == "smart":
        # Smart: single-agent LLM
        llm_callback = _create_llm_callback(config.llm.get("model", ""))
        if not llm_callback:
            print("WARNING: No API key found. Falling back to MVP...")
            result = await pipeline.run(file_bytes=file_bytes, on_progress=on_progress)
            excel_bytes = generate_vor_excel(result)
        else:
            print("Running Smart pipeline (single-agent)...")
            result = await pipeline.run_smart(
                file_bytes=file_bytes,
                llm_callback=llm_callback,
                on_progress=on_progress,
            )
            excel_bytes = generate_vor_excel_v3(result) if result.breakdowns else generate_vor_excel(result)
    else:
        print(f"ERROR: Unknown mode: {mode}", file=sys.stderr)
        return 1

    elapsed = time.monotonic() - start_time

    # Save output
    output_path.write_bytes(excel_bytes)

    # Print stats
    stats = result.stats
    total = stats.get("total_items", len(result.items))
    green = stats.get("green", 0)
    yellow = stats.get("yellow", 0)
    red = stats.get("red", 0)
    total_cost = stats.get("total_cost_fer_2025", sum(p.total_base for p in result.prices))

    print(f"\n{'='*50}")
    print(f"Pricing complete in {elapsed:.1f} sec")
    print(f"Positions: {total}")
    print(f"Green: {green}  Yellow: {yellow}  Red: {red}")
    if total_cost > 0:
        print(f"Total cost (base 2000): {total_cost:,.2f} rub.")
    print(f"Output: {output_path}")
    if result.errors:
        print(f"Errors: {len(result.errors)}")
    print(f"{'='*50}")

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="VOR Auto-Pricing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m vor.cli vor.xlsx                    # multiagent (default)
  python -m vor.cli vor.xlsx result.xlsx        # with output path
  python -m vor.cli vor.xlsx --mode=mvp         # no LLM
  python -m vor.cli vor.xlsx --config=cfg.yaml  # custom config
        """,
    )
    parser.add_argument("input", help="Input VOR Excel file (.xlsx)")
    parser.add_argument("output", nargs="?", default=None, help="Output file (default: input_priced.xlsx)")
    parser.add_argument("--mode", choices=["mvp", "smart", "multiagent"], default="multiagent",
                       help="Execution mode (default: multiagent)")
    parser.add_argument("--config", default=None, help="Path to vor_config.yaml")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG, format="%(name)s %(levelname)s: %(message)s")
    else:
        logging.basicConfig(level=logging.WARNING)

    sys.exit(asyncio.run(run_cli(args)))


if __name__ == "__main__":
    main()
