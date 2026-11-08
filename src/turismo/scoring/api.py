"""FastAPI router for the scoring bounded context."""
from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from turismo.scoring.infrastructure.repository import ScoreRepo
from turismo.shared.deps import get_db, limiter
from turismo.shared.schemas import (
    BestDayOut,
    CalendarDayOut,
    CalendarResponseOut,
    FactorBreakdownOut,
    ScoreOut,
)

router = APIRouter(tags=["Scoring"])


@router.get("/scores/{place_id}", response_model=ScoreOut)
@limiter.limit("60/minute")
def get_place_score(
    request: Request,
    place_id: int,
    query_date: date | None = Query(default=None, description="Fecha de consulta (YYYY-MM-DD)"),
    session: Session = Depends(get_db),
) -> ScoreOut:
    score_repo = ScoreRepo(session)
    if not score_repo.place_exists(place_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lugar con id={place_id} no encontrado",
        )

    target_date = query_date or datetime.now(tz=UTC).date()
    existing = score_repo.get(place_id, target_date)

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No hay score precalculado para el lugar id={place_id} "
                f"en la fecha {target_date}. Ejecute 'python -m turismo score' previamente."
            ),
        )

    return ScoreOut(
        place_id=existing.place_id,
        date=existing.date,
        score=existing.score,
        confidence=existing.confidence,
        breakdown=[
            FactorBreakdownOut(
                name=f.name,
                value=f.value,
                weight=f.weight,
                contribution=f.contribution,
                data_source=f.data_source,
                data_date=f.data_date,
                explanation=f.explanation,
            )
            for f in existing.breakdown
        ],
        computed_at=existing.computed_at,
        weights_version=existing.weights_version,
    )


@router.get("/calendar", response_model=CalendarResponseOut)
@limiter.limit("60/minute")
def get_calendar(
    request: Request,
    place_id: int = Query(..., description="ID del lugar"),
    from_date: date = Query(..., alias="from", description="Fecha de inicio (YYYY-MM-DD)"),
    to_date: date = Query(..., alias="to", description="Fecha de fin (YYYY-MM-DD)"),
    session: Session = Depends(get_db),
) -> CalendarResponseOut:
    score_repo = ScoreRepo(session)
    if not score_repo.place_exists(place_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lugar con id={place_id} no encontrado",
        )

    if to_date < from_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'to' debe ser mayor o igual a 'from'",
        )

    if (to_date - from_date).days > 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rango máximo permitido es de 30 días",
        )

    scores = score_repo.get_range(place_id, from_date, to_date)

    days_out: list[CalendarDayOut] = [
        CalendarDayOut(
            date=s.date,
            score=s.score,
            confidence=s.confidence,
            breakdown=[
                FactorBreakdownOut(
                    name=f.name,
                    value=f.value,
                    weight=f.weight,
                    contribution=f.contribution,
                    data_source=f.data_source,
                    data_date=f.data_date,
                    explanation=f.explanation,
                )
                for f in s.breakdown
            ],
        )
        for s in scores
    ]

    return CalendarResponseOut(
        place_id=place_id,
        date_from=from_date,
        date_to=to_date,
        days=days_out,
    )


@router.get("/best-days/{place_id}", response_model=list[BestDayOut])
@limiter.limit("60/minute")
def get_best_days(
    request: Request,
    place_id: int,
    date_from: date = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    limit: int = Query(default=5, ge=1, le=30, description="Cantidad máxima de días"),
    session: Session = Depends(get_db),
) -> list[BestDayOut]:
    score_repo = ScoreRepo(session)
    if not score_repo.place_exists(place_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lugar con id={place_id} no encontrado",
        )

    if date_to < date_from:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="date_to debe ser mayor o igual a date_from",
        )

    if (date_to - date_from).days > 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rango máximo permitido es de 30 días",
        )

    best = score_repo.get_best_days(place_id, date_from, date_to, limit=limit)
    return [
        BestDayOut(date=b.date, score=b.score, confidence=b.confidence)
        for b in best
    ]
