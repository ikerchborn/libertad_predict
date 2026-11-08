"""SQLAlchemy repository for calendar events."""
from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from turismo.events.infrastructure.models import EventORM
from turismo.shared.db import upsert_stmt
from turismo.shared.models import Event


class EventRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def replace_all(self, events: list[Event]) -> int:
        now = datetime.now(tz=UTC)
        self._session.execute(delete(EventORM))
        rows = [
            {
                "name": e.name,
                "date_start": e.date_start,
                "date_end": e.date_end,
                "crowd_level": e.crowd_level,
                "source": "events.yaml",
                "fetched_at": now,
            }
            for e in events
        ]
        if rows:
            self._session.execute(upsert_stmt(self._session, EventORM).values(rows))
        self._session.commit()
        return len(rows)

    def get_active_on(self, query_date: date) -> list[Event]:
        rows = self._session.scalars(
            select(EventORM).where(
                EventORM.date_start <= query_date,
                EventORM.date_end >= query_date,
            )
        ).all()
        return [
            Event(
                name=r.name,
                date_start=r.date_start,
                date_end=r.date_end,
                crowd_level=r.crowd_level,
            )
            for r in rows
        ]
