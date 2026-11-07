"""Events collector: loads recurring and calendar events from config/events.yaml.

Supports:
- Annual recurring events by fixed month/day.
- Movable events computed relative to Easter Sunday (via dateutil.easter).
- Events crossing year boundaries (e.g. late December to early January).
- Fixed-date one-off events.
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Literal

import yaml
from dateutil.easter import easter
from pydantic import BaseModel, ConfigDict, Field, model_validator

from turismo.domain.models import Event, RunResult
from turismo.infrastructure.collectors.base import BaseCollector

if TYPE_CHECKING:
    from turismo.config import Settings
    from turismo.infrastructure.db.repositories import EventRepo, ScrapeRunRepo


class EventRule(BaseModel):
    """Configuration entry for a calendar event rule."""

    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=200)
    recurrence: Literal["annual", "easter", "fixed"] = "annual"
    crowd_level: int = Field(ge=1, le=5)

    # Annual rules
    month: int | None = Field(default=None, ge=1, le=12)
    day_start: int | None = Field(default=None, ge=1, le=31)
    month_end: int | None = Field(default=None, ge=1, le=12)
    day_end: int | None = Field(default=None, ge=1, le=31)

    # Easter-relative rules
    offset_start_days: int = Field(default=-3)
    offset_end_days: int = Field(default=0)

    # Fixed one-off rules
    date_start: date | None = None
    date_end: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _validate_rule(self) -> EventRule:
        if self.recurrence == "annual":
            if self.month is None or self.day_start is None or self.day_end is None:
                raise ValueError("Annual events require month, day_start, and day_end")
        elif self.recurrence == "fixed" and (self.date_start is None or self.date_end is None):
            raise ValueError("Fixed events require date_start and date_end")
        return self

    def generate_instances_for_year(self, year: int) -> list[Event]:
        """Generate concrete Event domain models for a specific calendar year."""
        if self.recurrence == "easter":
            easter_sunday = easter(year)
            d_start = easter_sunday + timedelta(days=self.offset_start_days)
            d_end = easter_sunday + timedelta(days=self.offset_end_days)
            return [
                Event(
                    name=self.name,
                    date_start=d_start,
                    date_end=d_end,
                    crowd_level=self.crowd_level,
                )
            ]

        if self.recurrence == "fixed":
            assert self.date_start is not None and self.date_end is not None
            if self.date_start.year == year or self.date_end.year == year:
                return [
                    Event(
                        name=self.name,
                        date_start=self.date_start,
                        date_end=self.date_end,
                        crowd_level=self.crowd_level,
                    )
                ]
            return []

        # Annual recurrence
        assert self.month is not None and self.day_start is not None and self.day_end is not None
        m_start = self.month
        m_end = self.month_end if self.month_end is not None else self.month

        d_start = date(year, m_start, self.day_start)
        # Event crosses year boundary (e.g. Dec to Jan)
        year_end = year + 1 if m_end < m_start else year
        d_end = date(year_end, m_end, self.day_end)

        return [
            Event(
                name=self.name,
                date_start=d_start,
                date_end=d_end,
                crowd_level=self.crowd_level,
            )
        ]


class EventsConfig(BaseModel):
    events: list[EventRule]


def load_events_from_yaml(
    yaml_path: Path,
    years: list[int] | None = None,
) -> list[Event]:
    """Parse YAML file and generate Event domain models for target years."""
    if not yaml_path.exists():
        raise FileNotFoundError(f"Events config file not found: {yaml_path}")

    with yaml_path.open("r", encoding="utf-8") as f:
        raw_data = yaml.safe_load(f)

    config = EventsConfig.model_validate(raw_data)
    if years is None:
        current_year = date.today().year
        years = [current_year, current_year + 1, current_year + 2]

    generated: list[Event] = []
    for rule in config.events:
        for year in years:
            generated.extend(rule.generate_instances_for_year(year))

    return generated


class EventsCollector(BaseCollector):
    name = "events"

    def __init__(
        self,
        event_repo: EventRepo,
        scrape_repo: ScrapeRunRepo,
        config_path: Path | Settings = Path("config/events.yaml"),
        target_years: list[int] | None = None,
    ) -> None:
        super().__init__(scrape_repo)
        self._event_repo = event_repo
        if isinstance(config_path, Path):
            self._config_path = config_path
        elif hasattr(config_path, "events_file"):
            self._config_path = Path(config_path.events_file)
        else:
            self._config_path = Path("config/events.yaml")
        self._target_years = target_years

    async def _run_impl(self) -> RunResult:
        events = load_events_from_yaml(self._config_path, self._target_years)
        upserted_count = self._event_repo.replace_all(events)
        return RunResult(
            collector=self.name,
            rows_upserted=upserted_count,
            rows_rejected=0,
            status="ok",
        )
