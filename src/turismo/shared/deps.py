"""Shared FastAPI dependencies (database session, settings, rate limiter)."""
from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from turismo.shared.config import Settings, get_settings
from turismo.shared.db import create_engine, make_session_factory

limiter = Limiter(key_func=get_remote_address)


@lru_cache
def get_cached_settings() -> Settings:
    return get_settings()


@lru_cache
def get_db_engine() -> Engine:
    settings = get_cached_settings()
    return create_engine(settings.database_url)


def get_db() -> Generator[Session, None, None]:
    engine = get_db_engine()
    factory = make_session_factory(engine)
    with factory() as session:
        yield session
