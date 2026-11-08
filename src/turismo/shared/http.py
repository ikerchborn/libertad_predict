"""Shared resilient, security-focused asynchronous HTTP client."""
from __future__ import annotations

import asyncio
import ipaddress
import secrets
import socket
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
import structlog

if TYPE_CHECKING:
    from turismo.shared.config import Settings

logger = structlog.get_logger(__name__)

__all__ = [
    "DomainNotAllowedError",
    "HttpError",
    "HttpResponse",
    "InsecureSchemeError",
    "PrivateIpError",
    "ResponseTooLargeError",
    "RobotsDisallowedError",
    "SafeHttpClient",
    "SecurityError",
]


class HttpError(Exception):
    """Base exception for HTTP client errors."""


class SecurityError(HttpError):
    """Security violation detected."""


class InsecureSchemeError(SecurityError):
    """Attempted non-HTTPS request."""


class DomainNotAllowedError(SecurityError):
    """Domain is not in the collector's allowlist."""


class PrivateIpError(SecurityError):
    """Host resolved to a forbidden/private/loopback IP address."""


class ResponseTooLargeError(HttpError):
    """Response payload exceeded allowed size threshold."""


class RobotsDisallowedError(HttpError):
    """Robots.txt disallows scraping the requested URL."""


@dataclass(frozen=True)
class HttpResponse:
    status_code: int
    headers: dict[str, str]
    content: bytes
    from_cache: bool = False

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def raise_for_status(self) -> None:
        if 400 <= self.status_code < 600:
            raise HttpError(f"HTTP {self.status_code}: {self.text[:200]}")


@dataclass
class _CacheEntry:
    content: bytes
    headers: dict[str, str]
    etag: str | None
    last_modified: str | None
    cached_at: float
    ttl: float


class SafeHttpClient:
    """Async HTTP client wrapper implementing strict security and reliability rules."""

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        check_dns: bool = True,
    ) -> None:
        self._settings = settings
        self._check_dns = check_dns
        self._client = httpx.AsyncClient(
            transport=transport,
            timeout=httpx.Timeout(
                connect=settings.http_connect_timeout,
                read=settings.http_read_timeout,
                write=settings.http_read_timeout,
                pool=settings.http_connect_timeout,
            ),
            follow_redirects=False,
        )
        self._host_locks: dict[str, asyncio.Lock] = {}
        self._last_request_time: dict[str, float] = {}
        self._robots_cache: dict[str, tuple[float, RobotFileParser | None]] = {}
        self._http_cache: dict[str, _CacheEntry] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> SafeHttpClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()

    def _get_host_lock(self, host: str) -> asyncio.Lock:
        if host not in self._host_locks:
            self._host_locks[host] = asyncio.Lock()
        return self._host_locks[host]

    def _validate_url_security(self, url: str, collector: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme.lower() != "https":
            raise InsecureSchemeError(f"Only HTTPS is allowed. Got: {parsed.scheme}")

        host = parsed.hostname
        if not host:
            raise SecurityError(f"URL missing hostname: {url}")

        allowed = self._settings.collector_allowlists.get(collector, [])
        if host.lower() not in [d.lower() for d in allowed]:
            raise DomainNotAllowedError(
                f"Domain '{host}' is not in allowlist for collector '{collector}'"
            )

        if self._check_dns:
            self._verify_not_private_ip(host)

        return host.lower()

    @staticmethod
    def _verify_not_private_ip(host: str) -> None:
        try:
            ip_obj = ipaddress.ip_address(host)
            ips = [ip_obj]
        except ValueError:
            try:
                addr_info = socket.getaddrinfo(host, None)
                ips = [ipaddress.ip_address(item[4][0]) for item in addr_info]
            except socket.gaierror as exc:
                logger.warning("dns_resolution_failed", host=host, error=str(exc))
                return

        for ip in ips:
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
            ):
                raise PrivateIpError(f"Host '{host}' resolves to forbidden IP: {ip}")

    async def _apply_rate_limit(self, host: str) -> None:
        lock = self._get_host_lock(host)
        async with lock:
            now = time.monotonic()
            last_time = self._last_request_time.get(host, 0.0)
            elapsed = now - last_time
            min_delay = self._settings.http_rate_limit_seconds
            if elapsed < min_delay:
                await asyncio.sleep(min_delay - elapsed)
            self._last_request_time[host] = time.monotonic()

    async def _check_robots(self, host: str, url: str, collector: str) -> None:
        now = time.time()
        cached = self._robots_cache.get(host)
        parser: RobotFileParser | None = None

        if cached is not None and (now - cached[0]) < 86400:
            parser = cached[1]
        else:
            robots_url = f"https://{host}/robots.txt"
            try:
                resp = await self._execute_raw_request(
                    method="GET",
                    url=robots_url,
                    collector=collector,
                    check_robots=False,
                )
                if resp.status_code == 200:
                    parser = RobotFileParser()
                    parser.parse(resp.text.splitlines())
            except Exception as exc:
                logger.debug("robots_txt_fetch_failed", host=host, error=str(exc))
            self._robots_cache[host] = (now, parser)

        if parser is not None and not parser.can_fetch(self._settings.http_user_agent, url):
            raise RobotsDisallowedError(f"Scraping disallowed by robots.txt: {url}")

    async def _execute_raw_request(
        self,
        method: str,
        url: str,
        collector: str,
        headers: dict[str, str] | None = None,
        data: dict[str, Any] | None = None,
        max_bytes: int | None = None,
        check_robots: bool = True,
    ) -> HttpResponse:
        host = self._validate_url_security(url, collector)

        if check_robots and not url.endswith("/robots.txt"):
            await self._check_robots(host, url, collector)

        await self._apply_rate_limit(host)

        req_headers = {"User-Agent": self._settings.http_user_agent}
        if headers:
            req_headers.update(headers)

        limit_bytes = max_bytes or self._settings.http_max_response_bytes

        async with self._client.stream(method, url, headers=req_headers, data=data) as response:
            content_chunks: list[bytes] = []
            total_size = 0
            async for chunk in response.aiter_bytes():
                total_size += len(chunk)
                if total_size > limit_bytes:
                    raise ResponseTooLargeError(
                        f"Response from {url} exceeded limit of {limit_bytes} bytes"
                    )
                content_chunks.append(chunk)

            raw_content = b"".join(content_chunks)
            resp_headers = {k.lower(): v for k, v in response.headers.items()}
            return HttpResponse(
                status_code=response.status_code,
                headers=resp_headers,
                content=raw_content,
            )

    async def post(
        self,
        url: str,
        data: dict[str, Any],
        collector: str,
        headers: dict[str, str] | None = None,
        max_bytes: int | None = None,
        max_retries: int = 3,
        check_robots: bool = False,
    ) -> HttpResponse:
        attempt = 0
        while True:
            try:
                resp = await self._execute_raw_request(
                    method="POST",
                    url=url,
                    collector=collector,
                    headers=headers,
                    data=data,
                    max_bytes=max_bytes,
                    check_robots=check_robots,
                )
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_retries:
                    attempt += 1
                    delay = (1.5**attempt) + secrets.SystemRandom().uniform(0.1, 0.4)
                    logger.warning(
                        "http_retryable_status",
                        url=url,
                        status=resp.status_code,
                        attempt=attempt,
                        delay=delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                return resp
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt < max_retries:
                    attempt += 1
                    delay = (1.5**attempt) + secrets.SystemRandom().uniform(0.1, 0.4)
                    logger.warning(
                        "http_retryable_exception",
                        url=url,
                        error=str(exc),
                        attempt=attempt,
                        delay=delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise

    async def get(
        self,
        url: str,
        collector: str,
        headers: dict[str, str] | None = None,
        max_bytes: int | None = None,
        cache_ttl: float = 0.0,
        max_retries: int = 3,
        check_robots: bool = True,
    ) -> HttpResponse:
        now = time.monotonic()
        cached = self._http_cache.get(url)

        if cached is not None and cache_ttl > 0 and (now - cached.cached_at) < cached.ttl:
            return HttpResponse(
                status_code=200,
                headers=cached.headers,
                content=cached.content,
                from_cache=True,
            )

        req_headers = dict(headers or {})
        if cached is not None:
            if cached.etag:
                req_headers["If-None-Match"] = cached.etag
            if cached.last_modified:
                req_headers["If-Modified-Since"] = cached.last_modified

        current_url = url
        for _redirect_hop in range(5):
            response = await self._get_with_retry(
                current_url,
                collector=collector,
                headers=req_headers,
                max_bytes=max_bytes,
                max_retries=max_retries,
                check_robots=check_robots,
            )

            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("location")
                if not location:
                    return response
                next_url = urljoin(current_url, location)
                self._validate_url_security(next_url, collector)
                current_url = next_url
                continue

            if response.status_code == 304 and cached is not None:
                cached.cached_at = now
                return HttpResponse(
                    status_code=200,
                    headers=cached.headers,
                    content=cached.content,
                    from_cache=True,
                )

            if response.status_code == 200 and cache_ttl > 0:
                self._http_cache[url] = _CacheEntry(
                    content=response.content,
                    headers=response.headers,
                    etag=response.headers.get("etag"),
                    last_modified=response.headers.get("last-modified"),
                    cached_at=now,
                    ttl=cache_ttl,
                )

            return response

        raise SecurityError(f"Too many redirects for URL: {url}")

    async def _get_with_retry(
        self,
        url: str,
        collector: str,
        headers: dict[str, str],
        max_bytes: int | None,
        max_retries: int,
        check_robots: bool = True,
    ) -> HttpResponse:
        attempt = 0
        while True:
            try:
                resp = await self._execute_raw_request(
                    method="GET",
                    url=url,
                    collector=collector,
                    headers=headers,
                    max_bytes=max_bytes,
                    check_robots=check_robots,
                )
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_retries:
                    attempt += 1
                    delay = (1.5**attempt) + secrets.SystemRandom().uniform(0.1, 0.4)
                    logger.warning(
                        "http_retryable_status",
                        url=url,
                        status=resp.status_code,
                        attempt=attempt,
                        delay=delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                return resp
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt < max_retries:
                    attempt += 1
                    delay = (1.5**attempt) + secrets.SystemRandom().uniform(0.1, 0.4)
                    logger.warning(
                        "http_retryable_exception",
                        url=url,
                        error=str(exc),
                        attempt=attempt,
                        delay=delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise
