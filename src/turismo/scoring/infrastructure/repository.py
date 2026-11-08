"""SQLAlchemy repositories for scoring and seasonality."""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import column, func, select, table
from sqlalchemy.orm import Session

from turismo.scoring.infrastructure.models import ScoreORM, VisitorsMonthlyORM
from turismo.shared.db import upsert_stmt
from turismo.shared.models import FactorResult, ScoreResult, VisitorsMonth

_places_table = table("places", column("id"))


def _orm_to_score(row: ScoreORM) -> ScoreResult:
    from datetime import date as date_type

    def _parse_factor(f: dict[str, Any]) -> FactorResult:
        if isinstance(f.get("data_date"), str):
            f = {**f, "data_date": date_type.fromisoformat(f["data_date"])}
        return FactorResult(**f)

    return ScoreResult(
        place_id=row.place_id,
        date=row.date,
        score=float(row.score),
        confidence=float(row.confidence),
        breakdown=[_parse_factor(f) for f in row.breakdown_json],
        computed_at=row.computed_at,
        weights_version=row.weights_version,
    )


class VisitorsRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_many(self, records: list[VisitorsMonth]) -> int:
        if not records:
            return 0
        rows = [
            {
                "place_id": r.place_id,
                "year": r.year,
                "month": r.month,
                "visitors": r.visitors,
                "source": r.source,
                "fetched_at": r.fetched_at,
            }
            for r in records
        ]
        stmt = upsert_stmt(self._session, VisitorsMonthlyORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["place_id", "year", "month"],
            set_={k: stmt.excluded[k] for k in rows[0] if k not in ("place_id", "year", "month")},
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_annual_avg(self, place_id: int, year: int) -> float | None:
        result = self._session.scalar(
            select(func.avg(VisitorsMonthlyORM.visitors)).where(
                VisitorsMonthlyORM.place_id == place_id,
                VisitorsMonthlyORM.year == year,
            )
        )
        return float(result) if result is not None else None

    def get_for_month(self, place_id: int, year: int, month: int) -> VisitorsMonth | None:
        row = self._session.scalar(
            select(VisitorsMonthlyORM).where(
                VisitorsMonthlyORM.place_id == place_id,
                VisitorsMonthlyORM.year == year,
                VisitorsMonthlyORM.month == month,
            )
        )
        if not row:
            return None
        return VisitorsMonth(
            place_id=row.place_id,
            year=row.year,
            month=row.month,
            visitors=row.visitors,
            source=row.source,
            fetched_at=row.fetched_at,
        )


class ScoreRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert(self, result: ScoreResult, weights_version: str) -> None:
        row = {
            "place_id": result.place_id,
            "date": result.date,
            "score": result.score,
            "confidence": result.confidence,
            "breakdown_json": [f.model_dump(mode="json") for f in result.breakdown],
            "computed_at": result.computed_at,
            "weights_version": weights_version,
        }
        stmt = upsert_stmt(self._session, ScoreORM).values([row])
        stmt = stmt.on_conflict_do_update(
            index_elements=["place_id", "date"],
            set_={k: stmt.excluded[k] for k in row if k not in ("place_id", "date")},
        )
        self._session.execute(stmt)
        self._session.commit()

    def get(self, place_id: int, date: date) -> ScoreResult | None:
        row = self._session.scalar(
            select(ScoreORM).where(
                ScoreORM.place_id == place_id,
                ScoreORM.date == date,
            )
        )
        return _orm_to_score(row) if row else None

    def get_range(self, place_id: int, date_from: date, date_to: date) -> list[ScoreResult]:
        rows = self._session.scalars(
            select(ScoreORM)
            .where(
                ScoreORM.place_id == place_id,
                ScoreORM.date >= date_from,
                ScoreORM.date <= date_to,
            )
            .order_by(ScoreORM.date)
        ).all()
        return [_orm_to_score(r) for r in rows]

    def place_exists(self, place_id: int) -> bool:
        row = self._session.execute(
            select(_places_table.c.id).where(_places_table.c.id == place_id)
        ).first()
        return row is not None

    def get_best_days(
        self, place_id: int, date_from: date, date_to: date, limit: int = 5
    ) -> list[ScoreResult]:
        scores = self.get_range(place_id, date_from, date_to)
        return sorted(scores, key=lambda s: (s.score, s.confidence), reverse=True)[:limit]

