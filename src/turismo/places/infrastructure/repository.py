"""SQLAlchemy repository for the places bounded context."""
from __future__ import annotations

from datetime import date

from sqlalchemy import column, insert, select, table
from sqlalchemy.orm import Session

from turismo.places.infrastructure.models import OfferORM, PlaceDetailORM, PlaceORM
from turismo.shared.db import upsert_stmt
from turismo.shared.geo import LocationInfo
from turismo.shared.models import (
    CoastType,
    MarineDay,
    Offer,
    Place,
    PlaceCategory,
    PlaceDetail,
    PlaceKind,
    PlaceReview,
    PlaceSafetyReport,
    WeatherDay,
)

_scores_table = table(
    "scores",
    column("place_id"),
    column("date"),
    column("score"),
    column("confidence"),
)

_price_snapshots_table = table(
    "price_snapshots",
    column("price_usd"),
)

_locations_table = table(
    "locations",
    column("id"),
    column("name"),
    column("lat"),
    column("lon"),
    column("is_coastal"),
)

_weather_daily_table = table(
    "weather_daily",
    column("location_id"),
    column("date"),
    column("temp_max_c"),
    column("temp_min_c"),
    column("precipitation_mm"),
    column("rain_probability"),
    column("uv_index"),
    column("wind_speed_kmh"),
    column("source"),
    column("fetched_at"),
)

_marine_daily_table = table(
    "marine_daily",
    column("location_id"),
    column("date"),
    column("wave_height_m"),
    column("wave_period_s"),
    column("source"),
    column("fetched_at"),
)


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
            select(PlaceORM, _scores_table.c.score, _scores_table.c.confidence)
            .outerjoin(
                _scores_table,
                (_scores_table.c.place_id == PlaceORM.id) & (_scores_table.c.date == query_date),
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
        stmt = upsert_stmt(self._session, PlaceDetailORM).values([row])
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
        offer_prices = self._session.scalars(
            select(OfferORM.price)
            .join(PlaceORM, PlaceORM.id == OfferORM.place_id)
            .where(PlaceORM.kind == kind.value)
        ).all()
        if offer_prices:
            prices.extend(float(p) for p in offer_prices)
        elif kind == PlaceKind.LODGING:
            snap_rows = self._session.execute(select(_price_snapshots_table.c.price_usd)).all()
            if snap_rows:
                prices.extend(float(r[0]) for r in snap_rows if r[0] is not None)

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
        stmt = upsert_stmt(self._session, PlaceORM).values(rows)
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

    def get_locations_info(self) -> list[LocationInfo]:
        rows = self._session.execute(
            select(
                _locations_table.c.id,
                _locations_table.c.name,
                _locations_table.c.lat,
                _locations_table.c.lon,
                _locations_table.c.is_coastal,
            )
        ).all()
        return [
            LocationInfo(
                id=int(r.id),
                name=str(r.name),
                lat=float(r.lat),
                lon=float(r.lon),
                is_coastal=bool(r.is_coastal),
            )
            for r in rows
        ]

    def get_weather_for_location(self, location_id: int, target_date: date) -> WeatherDay | None:
        row = self._session.execute(
            select(
                _weather_daily_table.c.location_id,
                _weather_daily_table.c.date,
                _weather_daily_table.c.temp_max_c,
                _weather_daily_table.c.temp_min_c,
                _weather_daily_table.c.precipitation_mm,
                _weather_daily_table.c.rain_probability,
                _weather_daily_table.c.uv_index,
                _weather_daily_table.c.wind_speed_kmh,
                _weather_daily_table.c.source,
                _weather_daily_table.c.fetched_at,
            ).where(
                _weather_daily_table.c.location_id == location_id,
                _weather_daily_table.c.date == target_date,
            )
        ).first()
        if not row:
            return None
        return WeatherDay(
            location_id=int(row.location_id),
            date=row.date,
            temp_max_c=float(row.temp_max_c),
            temp_min_c=float(row.temp_min_c),
            precipitation_mm=float(row.precipitation_mm),
            rain_probability=float(row.rain_probability),
            uv_index=float(row.uv_index),
            wind_speed_kmh=float(row.wind_speed_kmh),
            source=str(row.source),
            fetched_at=row.fetched_at,
        )

    def get_marine_for_location(self, location_id: int, target_date: date) -> MarineDay | None:
        row = self._session.execute(
            select(
                _marine_daily_table.c.location_id,
                _marine_daily_table.c.date,
                _marine_daily_table.c.wave_height_m,
                _marine_daily_table.c.wave_period_s,
                _marine_daily_table.c.source,
                _marine_daily_table.c.fetched_at,
            ).where(
                _marine_daily_table.c.location_id == location_id,
                _marine_daily_table.c.date == target_date,
            )
        ).first()
        if not row:
            return None
        return MarineDay(
            location_id=int(row.location_id),
            date=row.date,
            wave_height_m=float(row.wave_height_m),
            wave_period_s=float(row.wave_period_s),
            source=str(row.source),
            fetched_at=row.fetched_at,
        )

    def get_score_summary(self, place_id: int, target_date: date) -> tuple[float, float] | None:
        row = self._session.execute(
            select(_scores_table.c.score, _scores_table.c.confidence).where(
                _scores_table.c.place_id == place_id,
                _scores_table.c.date == target_date,
            )
        ).first()
        if not row:
            return None
        return float(row.score), float(row.confidence)

