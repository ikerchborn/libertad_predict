"""Database engine and session factory.

SQLite PRAGMAs are applied on every new connection via an event listener,
but only when the dialect is sqlite — so switching DATABASE_URL to
postgresql://... needs zero code changes here.
"""
from __future__ import annotations

import stat
from pathlib import Path
from typing import Protocol

from sqlalchemy import Engine, event
from sqlalchemy import create_engine as sa_create_engine
from sqlalchemy.orm import Session, sessionmaker


class _DbApiCursor(Protocol):
    def execute(self, operation: str, /) -> object: ...
    def close(self) -> None: ...


class _DbApiConnection(Protocol):
    """Minimal structural type for a DBAPI connection object."""

    def cursor(self) -> _DbApiCursor: ...


def _apply_sqlite_pragmas(
    dbapi_connection: _DbApiConnection, _connection_record: object
) -> None:
    """Set connection pragmas for correctness and performance.

    WAL mode allows concurrent reads during a write.
    foreign_keys=ON enforces FK constraints at the DB level (SQLite ignores
    them by default).
    busy_timeout prevents immediate SQLITE_BUSY errors under write contention.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def create_engine(database_url: str) -> Engine:
    """Create a SQLAlchemy engine with correct settings for the URL scheme.

    Only attaches the SQLite pragma listener when the URL starts with
    'sqlite', so no SQLite-specific code runs against Postgres/Supabase.
    On Unix, also restricts the .db file to owner-only (0600) after creation.
    """
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = sa_create_engine(database_url, echo=False, connect_args=connect_args)
    if database_url.startswith("sqlite"):
        event.listen(engine, "connect", _apply_sqlite_pragmas)
        _restrict_sqlite_file_permissions(database_url)
    return engine


def _restrict_sqlite_file_permissions(database_url: str) -> None:
    """Set owner-only permissions (0600) on the SQLite file on Unix systems.

    No-op on Windows (os.chmod exists but has limited effect there).
    Skips in-memory DBs (':memory:' or '///:memory:').
    """
    if ":memory:" in database_url:
        return
    # Extract file path from URLs like sqlite:///./data/turismo.db
    path_part = database_url.split("sqlite:///", 1)[-1]
    db_path = Path(path_part)
    if db_path.exists() and hasattr(stat, "S_IRUSR"):
        db_path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
