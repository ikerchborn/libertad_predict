"""Shared database session factory, declarative Base, and upsert helpers."""
from __future__ import annotations

import stat
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Engine,
    Index,
    Integer,
    String,
    event,
    func,
    select,
)
from sqlalchemy import create_engine as sa_create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from turismo.shared.models import RunResult


class Base(DeclarativeBase):
    pass


class ScrapeRunORM(Base):
    __tablename__ = "scrape_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    collector: Mapped[str] = mapped_column(String(100), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    rows_upserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('ok','partial','failed','skipped')", name="ck_scrape_status"
        ),
        Index("ix_scrape_collector_started", "collector", "started_at"),
    )


class ScrapeRunRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def record(self, result: RunResult, started_at: datetime, finished_at: datetime) -> None:
        row = ScrapeRunORM(
            collector=result.collector,
            started_at=started_at,
            finished_at=finished_at,
            status=result.status,
            rows_upserted=result.rows_upserted,
            rows_rejected=result.rows_rejected,
            error=result.error,
        )
        self._session.add(row)
        self._session.commit()

    def get_latest_by_collector(self) -> dict[str, datetime]:
        stmt = select(
            ScrapeRunORM.collector,
            func.max(ScrapeRunORM.started_at),
        ).group_by(ScrapeRunORM.collector)
        rows = self._session.execute(stmt).all()
        result: dict[str, datetime] = {}
        for collector_name, latest in rows:
            if latest is not None and latest.tzinfo is None:
                latest = latest.replace(tzinfo=UTC)
            if latest is not None:
                result[collector_name] = latest
        return result


def upsert_stmt(session: Session, table: type[Base]) -> Any:
    """Return the correct dialect-specific INSERT statement."""
    engine = session.get_bind()
    dialect = engine.dialect.name if engine is not None else "sqlite"
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        return pg_insert(table)
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    return sqlite_insert(table)


class _DbApiCursor(Protocol):
    def execute(self, operation: str, /) -> object: ...
    def close(self) -> None: ...


class _DbApiConnection(Protocol):
    def cursor(self) -> _DbApiCursor: ...


def _apply_sqlite_pragmas(
    dbapi_connection: _DbApiConnection, _connection_record: object
) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def _restrict_sqlite_file_permissions(database_url: str) -> None:
    if ":memory:" in database_url:
        return
    path_part = database_url.split("sqlite:///", 1)[-1]
    db_path = Path(path_part)
    if db_path.exists() and hasattr(stat, "S_IRUSR"):
        db_path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def normalize_database_url(database_url: str) -> str:
    """Normalize postgres:// or postgresql:// URLs to use the psycopg v3 driver."""
    url = database_url.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def create_engine(database_url: str) -> Engine:
    normalized_url = normalize_database_url(database_url)
    connect_args: dict[str, Any] = {}
    if normalized_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = sa_create_engine(
        normalized_url,
        echo=False,
        pool_pre_ping=not normalized_url.startswith("sqlite"),
        connect_args=connect_args,
    )
    if normalized_url.startswith("sqlite"):
        event.listen(engine, "connect", _apply_sqlite_pragmas)
        _restrict_sqlite_file_permissions(normalized_url)
    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
