from __future__ import annotations

import pytest
from pydantic import ValidationError

from turismo.shared.config import Settings


def test_cors_origins_require_explicit_secure_origins() -> None:
    settings = Settings(cors_origins=["https://example.com/"])
    assert settings.cors_origins == ["https://example.com"]

    with pytest.raises(ValidationError):
        Settings(cors_origins=["*"])
    with pytest.raises(ValidationError):
        Settings(cors_origins=["http://example.com"])
