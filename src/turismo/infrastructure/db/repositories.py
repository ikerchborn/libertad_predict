"""SQLAlchemy implementations of the repository ports.

All writes use upsert (INSERT … ON CONFLICT DO UPDATE) so re-running
a collector never duplicates rows.

Dialect portability: _upsert_stmt() chooses the correct INSERT dialect
at runtime so that changing DATABASE_URL to postgres:// is the only
migration step — no code changes needed here.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from turismo.application.ports import LocationInfo
from turismo.domain.models import (
    CoastType,
    Event,
    FactorResult,
    MarineDay,
    Offer,
    Place,
    PlaceCategory,
    PlaceDetail,
    PlaceKind,
    PlaceReview,
    PlaceSafetyReport,
    PriceSnapshot,
    RunResult,
    ScoreResult,
    VisitorsMonth,
    WeatherDay,
)
from turismo.infrastructure.db.models import (
    Base,
    EventORM,
    LocationORM,
    MarineDailyORM,
    OfferORM,
    PlaceDetailORM,
    PlaceORM,
    PriceSnapshotORM,
    ScoreORM,
    ScrapeRunORM,
    VisitorsMonthlyORM,
    WeatherDailyORM,
)


def _upsert_stmt(session: Session, table: type[Base]) -> Any:
    """Return the correct dialect-specific INSERT statement.

    SQLite ships its own insert with on_conflict_do_update; PostgreSQL
    uses the psycopg2/asyncpg variant from sqlalchemy.dialects.postgresql.
    Choosing at runtime means repositories are dialect-agnostic.
    """
    engine = session.get_bind()
    dialect = engine.dialect.name if engine is not None else "sqlite"
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        return pg_insert(table)
    # Default: sqlite (also works for in-memory test DBs)
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    return sqlite_insert(table)


def _place_to_row(p: Place) -> dict[str, object]:
    return {
        "osm_id": p.osm_id,
        "name": p.name,
        "category": p.category.value,
        "kind": p.kind.value,
        "coast_type": p.coast_type.value,
        "lat": p.lat,
        "lon": p.lon,
        "address": p.address,
        "source": p.source,
    }


def _orm_to_place(row: PlaceORM) -> Place:
    kind_val = PlaceKind(row.kind) if getattr(row, "kind", None) else PlaceKind.UNCLASSIFIED
    return Place(
        id=row.id,
        osm_id=row.osm_id,
        name=row.name,
        category=PlaceCategory(row.category),
        kind=kind_val,
        coast_type=CoastType(row.coast_type),
        lat=float(row.lat),
        lon=float(row.lon),
        address=row.address,
        source=row.source,
    )


def _orm_to_score(row: ScoreORM) -> ScoreResult:
    from datetime import date as date_type

    def _parse_factor(f: dict[str, Any]) -> FactorResult:
        # SQLite stores dates as ISO strings inside JSON; parse them back.
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


class PlaceRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, place_id: int) -> Place | None:
        row = self._session.get(PlaceORM, place_id)
        return _orm_to_place(row) if row else None

    def list_all(
        self,
        category: PlaceCategory | None = None,
        kind: PlaceKind | None = None,
        include_unclassified: bool = False,
    ) -> list[Place]:
        q = select(PlaceORM)
        if not include_unclassified:
            q = q.where(PlaceORM.kind != PlaceKind.UNCLASSIFIED.value)
        if kind:
            q = q.where(PlaceORM.kind == kind.value)
        elif category:
            q = q.where(PlaceORM.category == category.value)
        return [_orm_to_place(r) for r in self._session.scalars(q).all()]

    def list_places_with_score(
        self,
        query_date: date,
        category: PlaceCategory | None = None,
        kind: PlaceKind | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[tuple[Place, float | None, float | None]]:
        stmt = (
            select(PlaceORM, ScoreORM.score, ScoreORM.confidence)
            .outerjoin(
                ScoreORM,
                (ScoreORM.place_id == PlaceORM.id) & (ScoreORM.date == query_date),
            )
            .where(PlaceORM.kind != PlaceKind.UNCLASSIFIED.value)
        )
        if kind:
            stmt = stmt.where(PlaceORM.kind == kind.value)
        elif category:
            stmt = stmt.where(PlaceORM.category == category.value)
        stmt = stmt.order_by(PlaceORM.id).limit(limit).offset(offset)

        rows = self._session.execute(stmt).all()
        return [
            (
                _orm_to_place(row[0]),
                float(row[1]) if row[1] is not None else None,
                float(row[2]) if row[2] is not None else None,
            )
            for row in rows
        ]

    def get_place_detail(self, place_id: int) -> PlaceDetail | None:
        row = self._session.scalar(
            select(PlaceDetailORM).where(PlaceDetailORM.place_id == place_id)
        )
        if not row:
            return None
        raw_reviews = row.reviews_json or []
        reviews = [
            PlaceReview(
                author_name=str(rv.get("author_name", "Usuario")),
                rating=float(rv.get("rating", 5.0)),
                text=str(rv.get("text", "")),
                relative_time=rv.get("relative_time"),
            )
            for rv in raw_reviews
            if isinstance(rv, dict) and rv.get("text")
        ]
        safety_report: PlaceSafetyReport | None = None
        if row.safety_report_json and isinstance(row.safety_report_json, dict):
            try:
                safety_report = PlaceSafetyReport.model_validate(row.safety_report_json)
            except Exception:
                safety_report = None

        return PlaceDetail(
            place_id=row.place_id,
            website=row.website,
            phone=row.phone,
            address=row.address,
            opening_hours=row.opening_hours,
            cuisine=row.cuisine,
            stars=float(row.stars) if row.stars is not None else None,
            user_rating_count=row.user_rating_count,
            price_level=row.price_level,
            price_min=float(row.price_min) if row.price_min is not None else None,
            price_max=float(row.price_max) if row.price_max is not None else None,
            currency=row.currency,
            menu_url=row.menu_url,
            maps_url=row.maps_url,
            image_url=row.image_url,
            local_image_path=row.local_image_path,
            google_place_id=row.google_place_id,
            reviews=reviews,
            safety_score=float(row.safety_score) if row.safety_score is not None else None,
            safety_report=safety_report,
            source=row.source,
            fetched_at=row.fetched_at,
        )

    def upsert_place_detail(self, d: PlaceDetail) -> None:
        row = {
            "place_id": d.place_id,
            "website": d.website,
            "phone": d.phone,
            "address": d.address,
            "opening_hours": d.opening_hours,
            "cuisine": d.cuisine,
            "stars": d.stars,
            "user_rating_count": d.user_rating_count,
            "price_level": d.price_level,
            "price_min": d.price_min,
            "price_max": d.price_max,
            "currency": d.currency,
            "menu_url": d.menu_url,
            "maps_url": d.maps_url,
            "image_url": d.image_url,
            "local_image_path": d.local_image_path,
            "google_place_id": d.google_place_id,
            "reviews_json": [rv.model_dump() for rv in d.reviews] if d.reviews else None,
            "safety_score": d.safety_score,
            "safety_report_json": (
                d.safety_report.model_dump(mode="json") if d.safety_report else None
            ),
            "source": d.source,
            "fetched_at": d.fetched_at,
        }
        stmt = _upsert_stmt(self._session, PlaceDetailORM).values([row])
        stmt = stmt.on_conflict_do_update(
            index_elements=["place_id"],
            set_={k: stmt.excluded[k] for k in row if k != "place_id"},
        )
        self._session.execute(stmt)
        self._session.commit()

    def list_offers(self, place_id: int) -> list[Offer]:
        q = (
            select(OfferORM)
            .where(OfferORM.place_id == place_id)
            .order_by(OfferORM.captured_at.desc())
        )
        rows = self._session.scalars(q).all()
        return [
            Offer(
                place_id=r.place_id,
                kind=r.kind,
                name=r.name,
                price=float(r.price),
                currency=r.currency,
                captured_at=r.captured_at,
            )
            for r in rows
        ]

    def add_offers(self, offers: list[Offer]) -> None:
        if not offers:
            return
        rows = [
            {
                "place_id": o.place_id,
                "kind": o.kind,
                "name": o.name,
                "price": o.price,
                "currency": o.currency,
                "captured_at": o.captured_at,
            }
            for o in offers
        ]
        self._session.execute(insert(OfferORM), rows)
        self._session.commit()

    def get_kind_median_price(self, kind: PlaceKind) -> float | None:
        """Calculate median price for this kind from offers or price_snapshots."""
        prices: list[float] = []
        # Check offers first
        offer_prices = self._session.scalars(
            select(OfferORM.price)
            .join(PlaceORM, PlaceORM.id == OfferORM.place_id)
            .where(PlaceORM.kind == kind.value)
        ).all()
        if offer_prices:
            prices.extend(float(p) for p in offer_prices)
        elif kind == PlaceKind.LODGING:
            snap_prices = self._session.scalars(select(PriceSnapshotORM.price_usd)).all()
            if snap_prices:
                prices.extend(float(p) for p in snap_prices)

        if not prices:
            return None
        prices.sort()
        mid = len(prices) // 2
        return (
            (prices[mid - 1] + prices[mid]) / 2.0
            if len(prices) % 2 == 0
            else prices[mid]
        )

    def upsert_many(self, places: list[Place]) -> int:
        if not places:
            return 0
        rows = [_place_to_row(p) for p in places]
        stmt = _upsert_stmt(self._session, PlaceORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["osm_id"],
            set_={k: stmt.excluded[k] for k in rows[0] if k != "osm_id"},
            where=(PlaceORM.source != "manual"),
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_osm_to_id_map(self) -> dict[int, int]:
        rows = self._session.execute(select(PlaceORM.osm_id, PlaceORM.id)).all()
        return {int(row[0]): int(row[1]) for row in rows}

    def get_name_to_id_map(self) -> dict[str, int]:
        rows = self._session.execute(select(PlaceORM.name, PlaceORM.id)).all()
        return {str(row[0]): int(row[1]) for row in rows}

    def get_existing_ids(self) -> set[int]:
        return set(self._session.scalars(select(PlaceORM.id)).all())


class WeatherRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_many(self, records: list[WeatherDay]) -> int:
        if not records:
            return 0
        rows = [
            {
                "location_id": r.location_id,
                "date": r.date,
                "temp_max_c": r.temp_max_c,
                "temp_min_c": r.temp_min_c,
                "precipitation_mm": r.precipitation_mm,
                "rain_probability": r.rain_probability,
                "uv_index": r.uv_index,
                "wind_speed_kmh": r.wind_speed_kmh,
                "source": r.source,
                "fetched_at": r.fetched_at,
            }
            for r in records
        ]
        stmt = _upsert_stmt(self._session, WeatherDailyORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["location_id", "date"],
            set_={k: stmt.excluded[k] for k in rows[0] if k not in ("location_id", "date")},
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_for_location(self, location_id: int, date: date) -> WeatherDay | None:
        row = self._session.scalar(
            select(WeatherDailyORM).where(
                WeatherDailyORM.location_id == location_id,
                WeatherDailyORM.date == date,
            )
        )
        if not row:
            return None
        return WeatherDay(
            location_id=row.location_id,
            date=row.date,
            temp_max_c=float(row.temp_max_c),
            temp_min_c=float(row.temp_min_c),
            precipitation_mm=float(row.precipitation_mm),
            rain_probability=float(row.rain_probability),
            uv_index=float(row.uv_index),
            wind_speed_kmh=float(row.wind_speed_kmh),
            source=row.source,
            fetched_at=row.fetched_at,
        )


class MarineRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_many(self, records: list[MarineDay]) -> int:
        if not records:
            return 0
        rows = [
            {
                "location_id": r.location_id,
                "date": r.date,
                "wave_height_m": r.wave_height_m,
                "wave_period_s": r.wave_period_s,
                "source": r.source,
                "fetched_at": r.fetched_at,
            }
            for r in records
        ]
        stmt = _upsert_stmt(self._session, MarineDailyORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["location_id", "date"],
            set_={k: stmt.excluded[k] for k in rows[0] if k not in ("location_id", "date")},
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_for_location(self, location_id: int, date: date) -> MarineDay | None:
        row = self._session.scalar(
            select(MarineDailyORM).where(
                MarineDailyORM.location_id == location_id,
                MarineDailyORM.date == date,
            )
        )
        if not row:
            return None
        return MarineDay(
            location_id=row.location_id,
            date=row.date,
            wave_height_m=float(row.wave_height_m),
            wave_period_s=float(row.wave_period_s),
            source=row.source,
            fetched_at=row.fetched_at,
        )


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
            self._session.execute(_upsert_stmt(self._session, EventORM).values(rows))
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
        stmt = _upsert_stmt(self._session, VisitorsMonthlyORM).values(rows)
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
        stmt = _upsert_stmt(self._session, PriceSnapshotORM).values(rows)
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


class ScoreRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert(self, result: ScoreResult, weights_version: str) -> None:
        row = {
            "place_id": result.place_id,
            "date": result.date,
            "score": result.score,
            "confidence": result.confidence,
            # mode="json" serializes date objects as ISO strings for SQLite JSON storage
            "breakdown_json": [f.model_dump(mode="json") for f in result.breakdown],
            "computed_at": result.computed_at,
            "weights_version": weights_version,
        }
        stmt = _upsert_stmt(self._session, ScoreORM).values([row])
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
            # SQLite stores datetimes without tzinfo; normalize to UTC-aware.
            if latest is not None and latest.tzinfo is None:
                latest = latest.replace(tzinfo=UTC)
            if latest is not None:
                result[collector_name] = latest
        return result


class LocationRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def ensure_locations(self, locations: list[dict[str, Any]]) -> dict[str, int]:
        """Upsert location points and return a mapping of name -> location_id."""
        if not locations:
            return {}

        stmt = _upsert_stmt(self._session, LocationORM).values(locations)
        stmt = stmt.on_conflict_do_update(
            index_elements=["name"],
            set_={
                "lat": stmt.excluded.lat,
                "lon": stmt.excluded.lon,
                "is_coastal": stmt.excluded.is_coastal,
            },
        )
        self._session.execute(stmt)
        self._session.commit()

        rows = self._session.scalars(select(LocationORM)).all()
        return {r.name: r.id for r in rows}

    def list_all(self) -> list[LocationInfo]:
        rows = self._session.scalars(select(LocationORM)).all()
        return [
            LocationInfo(
                id=r.id,
                name=r.name,
                lat=float(r.lat),
                lon=float(r.lon),
                is_coastal=bool(r.is_coastal),
            )
            for r in rows
        ]
