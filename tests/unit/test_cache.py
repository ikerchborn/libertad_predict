from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from turismo.shared import cache


def _cache_test_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(cache.ResponseCacheMiddleware)

    @app.get("/items/{item_id}")
    def get_item(item_id: int) -> dict[str, int]:
        return {"id": item_id}

    @app.get("/large")
    def get_large() -> dict[str, str]:
        return {"payload": "x" * cache.MAX_CACHED_BODY_BYTES}

    return app


def test_response_cache_evicts_old_entries_within_configured_bound() -> None:
    cache.invalidate_api_cache()
    client = TestClient(_cache_test_app())
    try:
        for item_id in range(cache.MAX_CACHE_ENTRIES + 4):
            assert client.get(f"/items/{item_id}").status_code == 200

        assert len(cache._CACHE) == cache.MAX_CACHE_ENTRIES
        assert all(key.startswith("/items/") for key in cache._CACHE)
        assert cache._CACHE_BYTES <= cache.MAX_CACHE_BYTES
        cached_response = client.get("/items/259")
        etag = cached_response.headers.get("etag")
        assert etag is not None
        assert client.get(
            "/items/259", headers={"If-None-Match": etag}
        ).status_code == 304
    finally:
        cache.invalidate_api_cache()


def test_response_cache_skips_oversized_and_private_requests() -> None:
    cache.invalidate_api_cache()
    client = TestClient(_cache_test_app())
    try:
        large_response = client.get("/large")
        assert large_response.status_code == 200
        assert "etag" not in large_response.headers
        assert not cache._CACHE

        authorized_response = client.get("/items/1", headers={"Authorization": "Bearer test"})
        assert authorized_response.status_code == 200
        assert not cache._CACHE
    finally:
        cache.invalidate_api_cache()
