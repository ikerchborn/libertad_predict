"""In-memory API response caching with TTL, ETag generation, and invalidation."""
from __future__ import annotations

import hashlib
import time
from collections import OrderedDict

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

_CACHE: OrderedDict[str, tuple[float, bytes, str, str]] = OrderedDict()
_CACHE_BYTES = 0
DEFAULT_TTL_SECONDS = 300.0
MAX_CACHE_ENTRIES = 256
MAX_CACHE_BYTES = 8 * 1024 * 1024
MAX_CACHED_BODY_BYTES = 512 * 1024


def invalidate_api_cache() -> int:
    """Invalidate all cached API read responses. Returns count of invalidated entries."""
    global _CACHE_BYTES
    count = len(_CACHE)
    _CACHE.clear()
    _CACHE_BYTES = 0
    return count


def _remove_cache_entry(cache_key: str) -> None:
    global _CACHE_BYTES
    entry = _CACHE.pop(cache_key, None)
    if entry is not None:
        _CACHE_BYTES -= len(entry[1])


def _prune_expired(now: float) -> None:
    expired_keys = [key for key, entry in _CACHE.items() if entry[0] <= now]
    for key in expired_keys:
        _remove_cache_entry(key)


def _compute_etag(content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()[:16]
    return f'W/"{digest}"'


class ResponseCacheMiddleware(BaseHTTPMiddleware):
    """Caches GET responses in memory with TTL, handles ETag / If-None-Match, sets Cache-Control."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        global _CACHE_BYTES

        if request.method != "GET" or request.url.path == "/health":
            return await call_next(request)
        if request.headers.get("authorization") or request.headers.get("cookie"):
            return await call_next(request)

        cache_key = f"{request.url.path}?{request.url.query}"
        now = time.monotonic()
        _prune_expired(now)

        cached = _CACHE.get(cache_key)
        if cached is not None:
            expires_at, body, etag, media_type = cached
            _CACHE.move_to_end(cache_key)
            if_none_match = request.headers.get("if-none-match")
            if if_none_match and if_none_match == etag:
                ttl_sec = int(max(0.0, expires_at - now))
                return Response(
                    status_code=304,
                    headers={"ETag": etag, "Cache-Control": f"public, max-age={ttl_sec}"},
                )

        response = await call_next(request)

        if response.status_code == 200:
            response_cache_control = response.headers.get("cache-control", "").lower()
            if (
                "private" in response_cache_control
                or "no-store" in response_cache_control
                or response.headers.get("set-cookie")
                or response.headers.get("vary") == "*"
            ):
                return response

            body_chunks: list[bytes] = []
            body_iter = getattr(response, "body_iterator", None)
            if body_iter is not None:
                async for chunk in body_iter:
                    if isinstance(chunk, bytes):
                        body_chunks.append(chunk)
                    elif isinstance(chunk, str):
                        body_chunks.append(chunk.encode("utf-8"))
            elif hasattr(response, "body"):
                body_val = response.body
                if isinstance(body_val, bytes):
                    body_chunks.append(body_val)

            full_body = b"".join(body_chunks)
            etag = _compute_etag(full_body)
            media_type = response.media_type or "application/json"
            cacheable = len(full_body) <= MAX_CACHED_BODY_BYTES
            if cacheable:
                _remove_cache_entry(cache_key)
                _CACHE[cache_key] = (
                    time.monotonic() + DEFAULT_TTL_SECONDS,
                    full_body,
                    etag,
                    media_type,
                )
                _CACHE_BYTES += len(full_body)
                while len(_CACHE) > MAX_CACHE_ENTRIES or _CACHE_BYTES > MAX_CACHE_BYTES:
                    oldest_key = next(iter(_CACHE))
                    _remove_cache_entry(oldest_key)

            headers = dict(response.headers)
            if cacheable:
                headers["ETag"] = etag
                headers["Cache-Control"] = f"public, max-age={int(DEFAULT_TTL_SECONDS)}"
            return Response(
                content=full_body,
                status_code=response.status_code,
                headers=headers,
                media_type=media_type,
            )

        return response
