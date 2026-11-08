"""Open-Meteo weather and marine forecast collector."""
from __future__ import annotations

import json
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from turismo.shared.collector import BaseCollector
from turismo.shared.models import MarineDay, RunResult, WeatherDay

if TYPE_CHECKING:
    from turismo.shared.config import LocationConfig, Settings
    from turismo.shared.db import ScrapeRunRepo
    from turismo.shared.http import SafeHttpClient
    from turismo.weather.infrastructure.repository import LocationRepo, MarineRepo, WeatherRepo


class RawDailyWeather(BaseModel):
    """Validation schema for physical weather observation ranges."""

    model_config = ConfigDict(strict=True)

    time: date
    temp_max_c: float = Field(ge=-10.0, le=50.0)
    temp_min_c: float = Field(ge=-10.0, le=50.0)
    precipitation_mm: float = Field(ge=0.0, le=300.0)
    rain_probability_pct: float = Field(ge=0.0, le=100.0)
    uv_index: float = Field(ge=0.0, le=25.0)
    wind_speed_kmh: float = Field(ge=0.0, le=250.0)


class RawDailyMarine(BaseModel):
    """Validation schema for physical marine conditions."""

    model_config = ConfigDict(strict=True)

    time: date
    wave_height_m: float = Field(ge=0.0, le=20.0)
    wave_period_s: float = Field(ge=0.0, le=30.0)


class OpenMeteoCollector(BaseCollector):
    name = "open_meteo"

    def __init__(
        self,
        http_client: SafeHttpClient,
        location_repo: LocationRepo,
        weather_repo: WeatherRepo,
        marine_repo: MarineRepo,
        scrape_repo: ScrapeRunRepo,
        settings: Settings,
    ) -> None:
        super().__init__(scrape_repo)
        self._http = http_client
        self._location_repo = location_repo
        self._weather_repo = weather_repo
        self._marine_repo = marine_repo
        self._settings = settings

    async def _run_impl(self) -> RunResult:
        locations = self._settings.locations
        loc_rows = [
            {"name": loc.name, "lat": loc.lat, "lon": loc.lon, "is_coastal": loc.is_coastal}
            for loc in locations
        ]
        loc_ids = self._location_repo.ensure_locations(loc_rows)

        now_utc = datetime.now(tz=UTC)
        total_upserted = 0
        total_rejected = 0

        weather_records, rejected_w = await self._fetch_weather_forecast(
            locations, loc_ids, now_utc
        )
        total_rejected += rejected_w
        if weather_records:
            total_upserted += self._weather_repo.upsert_many(weather_records)

        coastal_locs = [loc for loc in locations if loc.is_coastal]
        if coastal_locs:
            marine_records, rejected_m = await self._fetch_marine_forecast(
                coastal_locs, loc_ids, now_utc
            )
            total_rejected += rejected_m
            if marine_records:
                total_upserted += self._marine_repo.upsert_many(marine_records)

        return RunResult(
            collector=self.name,
            rows_upserted=total_upserted,
            rows_rejected=total_rejected,
            status="ok",
        )

    async def _fetch_weather_forecast(
        self,
        locations: list[LocationConfig],
        loc_ids: dict[str, int],
        now_utc: datetime,
    ) -> tuple[list[WeatherDay], int]:
        lats = ",".join(f"{loc.lat:.4f}" for loc in locations)
        lons = ",".join(f"{loc.lon:.4f}" for loc in locations)
        params = (
            f"latitude={lats}&longitude={lons}&daily="
            "temperature_2m_max,temperature_2m_min,precipitation_sum,"
            "precipitation_probability_max,uv_index_max,wind_speed_10m_max"
            "&forecast_days=16&timezone=UTC"
        )
        url = f"https://api.open-meteo.com/v1/forecast?{params}"

        resp = await self._http.get(
            url, collector=self.name, cache_ttl=1800.0, check_robots=False
        )
        data = json.loads(resp.text)

        items: list[dict[str, Any]] = data if isinstance(data, list) else [data]
        records: list[WeatherDay] = []
        rejected = 0

        for loc, loc_data in zip(locations, items, strict=False):
            loc_id = loc_ids.get(loc.name)
            if loc_id is None:
                continue

            daily = loc_data.get("daily", {})
            times = daily.get("time", [])
            t_max = daily.get("temperature_2m_max", [])
            t_min = daily.get("temperature_2m_min", [])
            precip = daily.get("precipitation_sum", [])
            rain_prob = daily.get("precipitation_probability_max", [])
            uv = daily.get("uv_index_max", [])
            wind = daily.get("wind_speed_10m_max", [])

            for i in range(len(times)):
                try:
                    validated = RawDailyWeather(
                        time=date.fromisoformat(times[i]),
                        temp_max_c=float(t_max[i]),
                        temp_min_c=float(t_min[i]),
                        precipitation_mm=float(precip[i] or 0.0),
                        rain_probability_pct=float(rain_prob[i] or 0.0),
                        uv_index=float(uv[i] or 0.0),
                        wind_speed_kmh=float(wind[i] or 0.0),
                    )
                    records.append(
                        WeatherDay(
                            location_id=loc_id,
                            date=validated.time,
                            temp_max_c=validated.temp_max_c,
                            temp_min_c=validated.temp_min_c,
                            precipitation_mm=validated.precipitation_mm,
                            rain_probability=validated.rain_probability_pct / 100.0,
                            uv_index=validated.uv_index,
                            wind_speed_kmh=validated.wind_speed_kmh,
                            source="open-meteo",
                            fetched_at=now_utc,
                        )
                    )
                except (ValidationError, TypeError, ValueError, IndexError):
                    rejected += 1

        return records, rejected

    async def _fetch_marine_forecast(
        self,
        coastal_locs: list[LocationConfig],
        loc_ids: dict[str, int],
        now_utc: datetime,
    ) -> tuple[list[MarineDay], int]:
        lats = ",".join(f"{loc.lat:.4f}" for loc in coastal_locs)
        lons = ",".join(f"{loc.lon:.4f}" for loc in coastal_locs)
        params = (
            f"latitude={lats}&longitude={lons}&daily="
            "wave_height_max,wave_period_max&forecast_days=16&timezone=UTC"
        )
        url = f"https://marine-api.open-meteo.com/v1/marine?{params}"

        resp = await self._http.get(
            url, collector=self.name, cache_ttl=1800.0, check_robots=False
        )
        data = json.loads(resp.text)

        items: list[dict[str, Any]] = data if isinstance(data, list) else [data]
        records: list[MarineDay] = []
        rejected = 0

        for loc, loc_data in zip(coastal_locs, items, strict=False):
            loc_id = loc_ids.get(loc.name)
            if loc_id is None:
                continue

            daily = loc_data.get("daily", {})
            times = daily.get("time", [])
            waves = daily.get("wave_height_max", [])
            periods = daily.get("wave_period_max", [])

            for i in range(len(times)):
                try:
                    validated = RawDailyMarine(
                        time=date.fromisoformat(times[i]),
                        wave_height_m=float(waves[i] if waves[i] is not None else 0.0),
                        wave_period_s=float(periods[i] if periods[i] is not None else 0.0),
                    )
                    records.append(
                        MarineDay(
                            location_id=loc_id,
                            date=validated.time,
                            wave_height_m=validated.wave_height_m,
                            wave_period_s=validated.wave_period_s,
                            source="open-meteo",
                            fetched_at=now_utc,
                        )
                    )
                except (ValidationError, TypeError, ValueError, IndexError):
                    rejected += 1

        return records, rejected
