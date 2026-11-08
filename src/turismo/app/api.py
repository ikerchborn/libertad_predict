"""Composition root FastAPI application assembling all bounded context routers."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, cast

import structlog
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from turismo.places.api import router as places_router
from turismo.scoring.api import router as scoring_router
from turismo.shared.cache import ResponseCacheMiddleware
from turismo.shared.config import Settings
from turismo.shared.deps import get_cached_settings, get_db, limiter
from turismo.shared.schemas import HealthOut

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Turismo API starting up")
    yield
    logger.info("Turismo API shutting down")


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_cached_settings()
    app = FastAPI(
        title="Turismo La Libertad API",
        description="Sistema local de scoring de conveniencia turística determinista y explicable.",
        version="1.0.0",
        docs_url="/docs" if cfg.docs_enabled else None,
        redoc_url="/redoc" if cfg.docs_enabled else None,
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, cast(Any, _rate_limit_exceeded_handler))

    app.add_middleware(ResponseCacheMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthOut, tags=["System"])
    def health_check(session: Session = Depends(get_db)) -> HealthOut:
        try:
            session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception as exc:
            logger.error("Database health check failed", error=str(exc))
            db_status = "degraded"
        return HealthOut(status="ok", database=db_status, version="1.0.0")

    app.include_router(places_router)
    app.include_router(scoring_router)

    return app


app = create_app()
