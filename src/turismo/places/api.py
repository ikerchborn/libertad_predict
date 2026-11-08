"""FastAPI router for the places bounded context."""
from __future__ import annotations

from datetime import UTC, date, datetime
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from turismo.places.domain.models import CoastType, PlaceCategory, PlaceKind
from turismo.places.infrastructure.repository import PlaceRepo
from turismo.shared.deps import get_db, limiter
from turismo.shared.geo import find_nearest_location
from turismo.shared.recommendation import compute_recommendation_score
from turismo.shared.schemas import (
    NearbyPlaceOut,
    OfferOut,
    PlaceDetailOut,
    PlaceOut,
    PlaceReviewOut,
    PlaceSafetyReportOut,
    RecommendationFactorOut,
)

router = APIRouter(tags=["Places"])


@router.get("/places", response_model=list[PlaceOut])
@limiter.limit("60/minute")
def list_places(
    request: Request,
    kind: PlaceKind | None = Query(
        default=None, description="Filtrar por tipo (attraction, lodging, food, activity)"
    ),
    category: PlaceCategory | None = Query(
        default=None, description="Filtrar por categoría legacy"
    ),
    zone: str | None = Query(
        default=None, description="Filtrar por zona (costa, valle, sierra)"
    ),
    q: str | None = Query(default=None, description="Búsqueda por texto"),
    query_date: date | None = Query(
        default=None, description="Fecha para incluir score (YYYY-MM-DD)"
    ),
    limit: int = Query(default=20, ge=1, le=500, description="Paginación: límite máximo"),
    offset: int = Query(default=0, ge=0, description="Paginación: desplazamiento"),
    session: Session = Depends(get_db),
) -> list[PlaceOut]:
    place_repo = PlaceRepo(session)
    locations = place_repo.get_locations_info()
    target_date = query_date or datetime.now(tz=UTC).date()
    rows = place_repo.list_places_with_score(
        query_date=target_date,
        category=category,
        kind=kind,
        limit=500 if (zone or q) else limit,
        offset=0 if (zone or q) else offset,
    )

    results: list[PlaceOut] = []
    for p, score, confidence in rows:
        if zone:
            z_lower = zone.lower()
            if z_lower == "costa" and p.coast_type != CoastType.COASTAL:
                continue
            if z_lower == "sierra" and p.lon <= -78.50:
                continue
            if z_lower == "valle" and (p.coast_type == CoastType.COASTAL or p.lon > -78.50):
                continue

        if q:
            q_lower = q.lower()
            name_match = q_lower in p.name.lower()
            addr_match = bool(p.address and q_lower in p.address.lower())
            if not (name_match or addr_match):
                continue

        detail = place_repo.get_place_detail(p.id) if p.id else None
        nearest_loc = find_nearest_location(p.lat, p.lon, locations)
        w_day = (
            place_repo.get_weather_for_location(nearest_loc.id, target_date)
            if nearest_loc is not None
            else None
        )
        m_day = (
            place_repo.get_marine_for_location(nearest_loc.id, target_date)
            if (nearest_loc is not None and p.coast_type == CoastType.COASTAL)
            else None
        )
        maps_url = (
            detail.maps_url
            if detail
            else f"https://www.google.com/maps/search/?api=1&query={quote_plus(p.name)}+{p.lat:.6f},{p.lon:.6f}"
        )

        convenience_val: float | None = None
        recommendation_val: float | None = None
        summary_val: str | None = None
        conf_val: float | None = confidence

        if p.kind == PlaceKind.ATTRACTION:
            convenience_val = score
            general_score = score
            summary_val = "Índice de conveniencia según clima y condiciones turísticas"
        else:
            rec = compute_recommendation_score(
                place_id=p.id if p.id else 0,
                kind=p.kind,
                place_lat=p.lat,
                place_lon=p.lon,
                place_detail=detail,
            )
            recommendation_val = rec.score
            general_score = rec.score
            conf_val = rec.confidence
            summary_val = rec.summary

        results.append(
            PlaceOut(
                id=p.id if p.id is not None else 0,
                osm_id=p.osm_id,
                name=p.name,
                category=p.category,
                kind=p.kind,
                coast_type=p.coast_type,
                lat=p.lat,
                lon=p.lon,
                address=p.address,
                convenience_score=convenience_val,
                recommendation_score=recommendation_val,
                score=general_score,
                confidence=conf_val,
                recommendation_summary=summary_val,
                maps_url=maps_url,
                website=detail.website if detail else None,
                phone=detail.phone if detail else None,
                cuisine=detail.cuisine if detail else None,
                stars=detail.stars if detail else None,
                external_rating=detail.stars if detail else None,
                user_rating_count=detail.user_rating_count if detail else None,
                google_place_id=detail.google_place_id if detail else None,
                price_level=detail.price_level if detail else None,
                price_min=detail.price_min if detail else None,
                price_max=detail.price_max if detail else None,
                image_url=detail.image_url if detail else None,
                local_image_path=detail.local_image_path if detail else None,
                safety_score=detail.safety_score if detail else None,
                temp_max_c=w_day.temp_max_c if w_day else None,
                temp_min_c=w_day.temp_min_c if w_day else None,
                precipitation_mm=w_day.precipitation_mm if w_day else None,
                rain_probability=w_day.rain_probability if w_day else None,
                uv_index=w_day.uv_index if w_day else None,
                wave_height_m=m_day.wave_height_m if m_day else None,
                wave_period_s=m_day.wave_period_s if m_day else None,
            )
        )

    if zone or q:
        return results[offset : offset + limit]
    return results


@router.get("/places/{place_id}", response_model=PlaceDetailOut)
@limiter.limit("60/minute")
def get_place(
    request: Request,
    place_id: int,
    query_date: date | None = Query(default=None, description="Fecha de consulta (YYYY-MM-DD)"),
    session: Session = Depends(get_db),
) -> PlaceDetailOut:
    place_repo = PlaceRepo(session)
    p = place_repo.get_by_id(place_id)
    if p is None or p.kind == PlaceKind.UNCLASSIFIED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lugar con id={place_id} no encontrado",
        )
    detail = place_repo.get_place_detail(place_id)
    offers = place_repo.list_offers(place_id)
    target_date = query_date or datetime.now(tz=UTC).date()

    convenience_score = None
    recommendation_score = None
    recommendation_summary = None
    rec_breakdown_out = []
    confidence_val = None

    if p.kind == PlaceKind.ATTRACTION:
        s_summary = place_repo.get_score_summary(place_id, target_date)
        if s_summary is not None:
            convenience_score, confidence_val = s_summary
    else:
        rec = compute_recommendation_score(
            place_id=p.id if p.id else 0,
            kind=p.kind,
            place_lat=p.lat,
            place_lon=p.lon,
            place_detail=detail,
        )
        recommendation_score = rec.score
        confidence_val = rec.confidence
        recommendation_summary = rec.summary
        rec_breakdown_out = [
            RecommendationFactorOut(
                name=rf.name,
                score=rf.score,
                weight=rf.weight,
                contribution=rf.contribution,
                explanation=rf.explanation,
            )
            for rf in rec.breakdown
        ]

    maps_url = (
        detail.maps_url
        if detail
        else f"https://www.google.com/maps/search/?api=1&query={quote_plus(p.name)}+{p.lat:.6f},{p.lon:.6f}"
    )

    return PlaceDetailOut(
        id=p.id if p.id else 0,
        osm_id=p.osm_id,
        name=p.name,
        category=p.category,
        kind=p.kind,
        coast_type=p.coast_type,
        lat=p.lat,
        lon=p.lon,
        address=p.address,
        website=detail.website if detail else None,
        phone=detail.phone if detail else None,
        opening_hours=detail.opening_hours if detail else None,
        cuisine=detail.cuisine if detail else None,
        stars=detail.stars if detail else None,
        external_rating=detail.stars if detail else None,
        user_rating_count=detail.user_rating_count if detail else None,
        google_place_id=detail.google_place_id if detail else None,
        price_level=detail.price_level if detail else None,
        price_min=detail.price_min if detail else None,
        price_max=detail.price_max if detail else None,
        currency=detail.currency if detail else "PEN",
        menu_url=detail.menu_url if detail else None,
        maps_url=maps_url,
        image_url=detail.image_url if detail else None,
        local_image_path=detail.local_image_path if detail else None,
        reviews=[
            PlaceReviewOut(
                author_name=rv.author_name,
                rating=rv.rating,
                text=rv.text,
                relative_time=rv.relative_time,
            )
            for rv in (detail.reviews if detail else [])
        ],
        safety_score=detail.safety_score if detail else None,
        safety_report=(
            PlaceSafetyReportOut.model_validate(detail.safety_report)
            if detail and detail.safety_report
            else None
        ),
        source=detail.source if detail else p.source,
        fetched_at=detail.fetched_at if detail else None,
        offers=[
            OfferOut(
                kind=o.kind,
                name=o.name,
                price=o.price,
                currency=o.currency,
                captured_at=o.captured_at,
            )
            for o in offers
        ],
        convenience_score=convenience_score,
        recommendation_score=recommendation_score,
        score=convenience_score if convenience_score is not None else recommendation_score,
        confidence=confidence_val,
        recommendation_summary=recommendation_summary,
        recommendation_breakdown=rec_breakdown_out,
    )


@router.get("/places/{place_id}/safety", response_model=PlaceSafetyReportOut)
@limiter.limit("60/minute")
def get_place_safety(
    request: Request,
    place_id: int,
    session: Session = Depends(get_db),
) -> PlaceSafetyReportOut:
    place_repo = PlaceRepo(session)
    p = place_repo.get_by_id(place_id)
    if p is None or p.kind == PlaceKind.UNCLASSIFIED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lugar con id={place_id} no encontrado",
        )
    detail = place_repo.get_place_detail(place_id)
    if not detail or not detail.safety_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reporte de seguridad no disponible para este lugar",
        )
    return PlaceSafetyReportOut.model_validate(detail.safety_report)


@router.get("/places/{place_id}/nearby", response_model=list[NearbyPlaceOut])
@limiter.limit("60/minute")
def get_nearby_places(
    request: Request,
    place_id: int,
    kind: PlaceKind = Query(
        default=PlaceKind.FOOD, description="Tipo comercial (lodging, food, activity)"
    ),
    limit: int = Query(default=5, ge=1, le=20, description="Cantidad máxima a retornar"),
    session: Session = Depends(get_db),
) -> list[NearbyPlaceOut]:
    place_repo = PlaceRepo(session)
    attraction = place_repo.get_by_id(place_id)
    if attraction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Atracción con id={place_id} no encontrada",
        )

    candidates = place_repo.list_all(kind=kind)
    scored: list[NearbyPlaceOut] = []

    for c in candidates:
        if c.id is None or c.id == place_id:
            continue
        detail = place_repo.get_place_detail(c.id)
        rec = compute_recommendation_score(
            place_id=c.id,
            kind=c.kind,
            place_lat=c.lat,
            place_lon=c.lon,
            place_detail=detail,
            ref_lat=attraction.lat,
            ref_lon=attraction.lon,
            ref_name=attraction.name,
        )
        maps_url = (
            detail.maps_url
            if detail
            else f"https://www.google.com/maps/search/?api=1&query={quote_plus(c.name)}+{c.lat:.6f},{c.lon:.6f}"
        )
        place_out = PlaceOut(
            id=c.id,
            osm_id=c.osm_id,
            name=c.name,
            category=c.category,
            kind=c.kind,
            coast_type=c.coast_type,
            lat=c.lat,
            lon=c.lon,
            address=c.address,
            recommendation_score=rec.score,
            score=rec.score,
            confidence=rec.confidence,
            recommendation_summary=rec.summary,
            maps_url=maps_url,
            website=detail.website if detail else None,
            phone=detail.phone if detail else None,
            cuisine=detail.cuisine if detail else None,
            stars=detail.stars if detail else None,
            user_rating_count=detail.user_rating_count if detail else None,
            price_level=detail.price_level if detail else None,
            price_min=detail.price_min if detail else None,
            price_max=detail.price_max if detail else None,
            image_url=detail.image_url if detail else None,
            safety_score=detail.safety_score if detail else None,
        )
        scored.append(
            NearbyPlaceOut(
                place=place_out,
                distance_km=rec.distance_km if rec.distance_km is not None else 0.0,
                recommendation_score=rec.score,
                summary=rec.summary,
                breakdown=[
                    RecommendationFactorOut(
                        name=rf.name,
                        score=rf.score,
                        weight=rf.weight,
                        contribution=rf.contribution,
                        explanation=rf.explanation,
                    )
                    for rf in rec.breakdown
                ],
            )
        )

    scored.sort(key=lambda x: x.recommendation_score, reverse=True)
    return scored[:limit]
