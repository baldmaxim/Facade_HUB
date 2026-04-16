"""Runtime helpers for VOR-specific LLM calls.

VOR composition prompts can generate large JSON responses, but free / preview
models often behave better with a tighter max_tokens cap than the generic
backend default. Keep this adapter VOR-local so we don't perturb the rest of
the product.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import litellm

logger = logging.getLogger(__name__)


async def run_vor_simple_completion(
    llm_client: Any,
    *,
    system_prompt: str,
    user_prompt: str,
    model_override: str | None = None,
    max_tokens_cap: int = 16_384,
    temperature: float = 0.2,
    request_timeout: float = 180.0,
) -> str:
    """Run a non-streaming completion using the backend LLM client internals.

    VOR uses this instead of the generic `_simple_completion()` path so we can
    cap output tokens more conservatively for large structured JSON responses.
    """
    kwargs: dict[str, Any] = {
        "model": model_override or getattr(llm_client, "_model", ""),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": min(
            int(getattr(llm_client, "_max_tokens", max_tokens_cap) or max_tokens_cap),
            max_tokens_cap,
        ),
        "stream": False,
    }

    api_key = getattr(llm_client, "_api_key", "")
    api_base = getattr(llm_client, "_api_base", None)
    if api_key:
        kwargs["api_key"] = api_key
    if api_base:
        kwargs["api_base"] = api_base

    timeout = max(
        float(getattr(llm_client, "_timeout", request_timeout) or request_timeout),
        request_timeout,
    )

    try:
        response = await asyncio.wait_for(
            litellm.acompletion(**kwargs),
            timeout=timeout,
        )
        return response.choices[0].message.content or ""
    except Exception as primary_error:
        fallback_model = getattr(llm_client, "_fallback_model", "")
        fallback_api_key = getattr(llm_client, "_fallback_api_key", "")
        fallback_timeout = float(
            getattr(llm_client, "_fallback_timeout", request_timeout)
            or request_timeout
        )
        if not fallback_model or not fallback_api_key:
            raise

        logger.warning(
            "VOR primary LLM failed (%s: %s), trying fallback model %s",
            type(primary_error).__name__,
            primary_error,
            fallback_model,
        )

        fallback_kwargs = dict(kwargs)
        fallback_kwargs["model"] = fallback_model
        fallback_kwargs["api_key"] = fallback_api_key
        fallback_kwargs.pop("api_base", None)

        response = await asyncio.wait_for(
            litellm.acompletion(**fallback_kwargs),
            timeout=max(fallback_timeout, request_timeout),
        )
        return response.choices[0].message.content or ""
