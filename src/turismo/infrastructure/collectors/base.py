"""Base collector with shared run-recording and circuit-breaker logic.

Concrete collectors implement only `_run_impl()`. The base handles:
- Timing and scrape_run recording
- Circuit breaker tripping after N consecutive failures
- Exception -> RunResult mapping
- Sensitive error truncation
"""
from __future__ import annotations

import abc
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from turismo.domain.models import RunResult

if TYPE_CHECKING:
    from turismo.infrastructure.db.repositories import ScrapeRunRepo

logger = structlog.get_logger(__name__)


class BaseCollector(abc.ABC):
    name: str  # must be defined by subclass

    def __init__(
        self,
        scrape_repo: ScrapeRunRepo,
        max_consecutive_failures: int = 3,
    ) -> None:
        self._scrape_repo = scrape_repo
        self._max_consecutive_failures = max_consecutive_failures
        self._consecutive_failures: int = 0

    @property
    def is_circuit_open(self) -> bool:
        return self._consecutive_failures >= self._max_consecutive_failures

    def reset_circuit_breaker(self) -> None:
        self._consecutive_failures = 0

    @abc.abstractmethod
    async def _run_impl(self) -> RunResult:
        """Core collection logic implemented by concrete collectors."""

    async def run(self) -> RunResult:
        started_at = datetime.now(tz=UTC)

        if self.is_circuit_open:
            result = RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=0,
                status="skipped",
                error=(
                    f"Circuit breaker open ({self._consecutive_failures} consecutive failures)"
                ),
            )
            self._scrape_repo.record(result, started_at, started_at)
            logger.warning("collector_skipped_circuit_breaker", collector=self.name)
            return result

        try:
            result = await self._run_impl()
            if result.status == "failed":
                self._consecutive_failures += 1
            else:
                self._consecutive_failures = 0
        except Exception as exc:
            self._consecutive_failures += 1
            error_msg = str(exc)[:500]
            result = RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=0,
                status="failed",
                error=error_msg,
            )
            logger.error("collector_failed", collector=self.name, error=error_msg)

        finished_at = datetime.now(tz=UTC)
        self._scrape_repo.record(result, started_at, finished_at)
        logger.info(
            "collector_done",
            collector=self.name,
            status=result.status,
            upserted=result.rows_upserted,
            rejected=result.rows_rejected,
            consecutive_failures=self._consecutive_failures,
        )
        return result
