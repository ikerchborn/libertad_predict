"""Legacy facade re-exporting SafeHttpClient and HTTP errors from turismo.shared.http."""
from __future__ import annotations

from turismo.shared.http import (
    DomainNotAllowedError,
    HttpError,
    HttpResponse,
    InsecureSchemeError,
    PrivateIpError,
    ResponseTooLargeError,
    RobotsDisallowedError,
    SafeHttpClient,
    SecurityError,
)

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
