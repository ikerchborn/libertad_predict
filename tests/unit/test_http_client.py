"""Unit tests for SafeHttpClient (security, rate-limiting, retries, caching, robots.txt).

All tests run strictly in-memory without network calls using httpx.MockTransport.
"""
from __future__ import annotations

import httpx
import pytest

from turismo.config import Settings
from turismo.infrastructure.http.client import (
    DomainNotAllowedError,
    InsecureSchemeError,
    PrivateIpError,
    ResponseTooLargeError,
    RobotsDisallowedError,
    SafeHttpClient,
)


@pytest.fixture
def mock_settings() -> Settings:
    return Settings(
        http_rate_limit_seconds=0.01,  # fast rate-limit for tests
        http_max_response_bytes=1000,
        collector_allowlists={
            "osm": ["overpass-api.de"],
            "open_meteo": ["api.open-meteo.com"],
        },
    )


async def test_rejects_insecure_http_scheme(mock_settings: Settings) -> None:
    client = SafeHttpClient(settings=mock_settings, check_dns=False)
    with pytest.raises(InsecureSchemeError):
        await client.get("http://overpass-api.de/api", collector="osm")


async def test_rejects_disallowed_domain(mock_settings: Settings) -> None:
    client = SafeHttpClient(settings=mock_settings, check_dns=False)
    with pytest.raises(DomainNotAllowedError):
        await client.get("https://evil-site.com/api", collector="osm")


async def test_rejects_private_and_loopback_ips(mock_settings: Settings) -> None:
    settings = Settings(collector_allowlists={"test": ["127.0.0.1", "10.0.0.1"]})
    client = SafeHttpClient(settings=settings, check_dns=True)

    with pytest.raises(PrivateIpError):
        await client.get("https://127.0.0.1/secret", collector="test")

    with pytest.raises(PrivateIpError):
        await client.get("https://10.0.0.1/secret", collector="test")


async def test_response_size_limit_stream_cut(mock_settings: Settings) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # Return 5000 bytes when max is 1000
        return httpx.Response(200, content=b"A" * 5000)

    transport = httpx.MockTransport(handler)
    client = SafeHttpClient(settings=mock_settings, transport=transport, check_dns=False)

    with pytest.raises(ResponseTooLargeError):
        await client.get(
            "https://overpass-api.de/data",
            collector="osm",
            max_bytes=1000,
        )


async def test_redirect_to_disallowed_domain_is_rejected(mock_settings: Settings) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://overpass-api.de/start":
            return httpx.Response(302, headers={"Location": "https://attacker.com/steal"})
        return httpx.Response(200, content=b"ok")

    transport = httpx.MockTransport(handler)
    client = SafeHttpClient(settings=mock_settings, transport=transport, check_dns=False)

    with pytest.raises(DomainNotAllowedError):
        await client.get("https://overpass-api.de/start", collector="osm")


async def test_robots_txt_disallows_path(mock_settings: Settings) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            robots_content = "User-agent: *\nDisallow: /admin\n"
            return httpx.Response(200, content=robots_content.encode("utf-8"))
        return httpx.Response(200, content=b"admin secret")

    transport = httpx.MockTransport(handler)
    client = SafeHttpClient(settings=mock_settings, transport=transport, check_dns=False)

    with pytest.raises(RobotsDisallowedError):
        await client.get("https://overpass-api.de/admin", collector="osm")


async def test_etag_and_304_cache_hit(mock_settings: Settings) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if request.headers.get("if-none-match") == '"v1"':
            return httpx.Response(304)
        return httpx.Response(200, content=b"Initial Payload", headers={"ETag": '"v1"'})

    transport = httpx.MockTransport(handler)
    client = SafeHttpClient(settings=mock_settings, transport=transport, check_dns=False)

    # First request: 200 OK, populated in cache
    res1 = await client.get(
        "https://overpass-api.de/data",
        collector="osm",
        cache_ttl=0.001,
        check_robots=False,
    )
    assert res1.status_code == 200
    assert res1.content == b"Initial Payload"
    assert res1.from_cache is False

    # Force local cache expiration so client must revalidate with server using If-None-Match
    client._http_cache["https://overpass-api.de/data"].cached_at = 0.0

    # Second request after TTL sends If-None-Match: server responds 304, returns cached
    res2 = await client.get(
        "https://overpass-api.de/data",
        collector="osm",
        cache_ttl=10.0,
        check_robots=False,
    )
    assert res2.status_code == 200
    assert res2.content == b"Initial Payload"
    assert res2.from_cache is True
    assert call_count == 2


async def test_retry_on_500_eventually_succeeds(mock_settings: Settings) -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(500)
        return httpx.Response(200, content=b"recovered")

    transport = httpx.MockTransport(handler)
    client = SafeHttpClient(settings=mock_settings, transport=transport, check_dns=False)

    res = await client.get(
        "https://overpass-api.de/retry",
        collector="osm",
        max_retries=3,
    )
    assert res.status_code == 200
    assert res.content == b"recovered"
    assert attempts == 3
