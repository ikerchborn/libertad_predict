"""SQLAlchemy repository for hotel price snapshots."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from turismo.pricing.infrastructure.models import PriceSnapshotORM
from turismo.shared.db import upsert_stmt
from turismo.shared.models import PriceSnapshot


class PriceRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_many(self, records: list[PriceSnapshot]) -> int:
        if not records:
            return 0
        rows = [
            {
                "place_id": r.place_id,
                "date_stay": r.date_stay,
                "date_scraped": r.date_scraped,
                "price_usd": r.price_usd,
                "source": r.source,
                "fetched_at": r.fetched_at,
            }
            for r in records
        ]
        stmt = upsert_stmt(self._session, PriceSnapshotORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["place_id", "date_stay", "date_scraped", "source"],
            set_={"price_usd": stmt.excluded.price_usd, "fetched_at": stmt.excluded.fetched_at},
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_median(self, place_id: int, date_stay: date) -> tuple[float, int] | None:
        rows = self._session.scalars(
            select(PriceSnapshotORM.price_usd)
            .where(
                PriceSnapshotORM.place_id == place_id,
                PriceSnapshotORM.date_stay == date_stay,
            )
            .order_by(PriceSnapshotORM.price_usd)
        ).all()
        if not rows:
            return None
        n = len(rows)
        mid = n // 2
        median = (
            float(rows[mid])
            if n % 2 == 1
            else (float(rows[mid - 1]) + float(rows[mid])) / 2.0
        )
        return median, n
