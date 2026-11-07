"""In-memory response caching with TTL, ETag generation, and invalidation."""
from __future__ import annotations

import hashlib
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# Global in-memory cache storage: key -> (expires_at, body, etag, media_type)
_CACHE: dict[str, tuple[float, bytes, str, str]] = {}
DEFAULT_TTL_SECONDS = 300.0  # 5 minutes


def invalidate_api_cache() -> int:
    """Invalidate all cached API read responses. Returns count of invalidated entries."""
    count = len(_CACHE)
    _CACHE.clear()
    return count


def _compute_etag(content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()[:16]
    return f'W/"{digest}"'


class ResponseCacheMiddleware(BaseHTTPMiddleware):
    """Caches GET responses in memory with TTL, handles ETag / If-None-Match, sets Cache-Control."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only cache safe GET requests (except /health)
        if request.method != "GET" or request.url.path == "/health":
            return await call_next(request)

        cache_key = f"{request.url.path}?{request.url.query}"
        now = time.monotonic()

        cached = _CACHE.get(cache_key)
        if cached is not None:
            expires_at, body, etag, media_type = cached
            if now < expires_at:
                # Check If-None-Match client header
                if_none_match = request.headers.get("if-none-match")
                if if_none_match and if_none_match == etag:
                    ttl_sec = int(DEFAULT_TTL_SECONDS)
                    return Response(
                        status_code=304,
                        headers={"ETag": etag, "Cache-Control": f"public, max-age={ttl_sec}"},
                    )

                remaining_ttl = int(max(0.0, expires_at - now))
                return Response(
                    content=body,
                    status_code=200,
                    media_type=media_type,
                    headers={"ETag": etag, "Cache-Control": f"public, max-age={remaining_ttl}"},
                )

        # Call downstream route handler
        response = await call_next(request)

        if response.status_code == 200:
            # Consume response body to compute ETag and store in cache
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

            _CACHE[cache_key] = (now + DEFAULT_TTL_SECONDS, full_body, etag, media_type)

            # Return response with headers
            headers = dict(response.headers)
            headers["ETag"] = etag
            headers["Cache-Control"] = f"public, max-age={int(DEFAULT_TTL_SECONDS)}"
            return Response(
                content=full_body,
                status_code=response.status_code,
                headers=headers,
                media_type=media_type,
            )

        return response
