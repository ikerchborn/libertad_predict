"""Application configuration in the shared kernel.

Loaded from environment variables / .env file.
"""
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class LocationConfig(BaseModel):
    """Configuration for a climate monitoring location."""

    model_config = ConfigDict(strict=True, frozen=True)

    name: str = Field(min_length=1, max_length=100)
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    is_coastal: bool = False


DEFAULT_LOCATIONS = [
    LocationConfig(name="Trujillo", lat=-8.111786, lon=-79.028667, is_coastal=False),
    LocationConfig(name="Huanchaco", lat=-8.078560, lon=-79.121384, is_coastal=True),
    LocationConfig(name="Chan Chan", lat=-8.109858, lon=-79.074533, is_coastal=False),
    LocationConfig(name="Huacas de Moche", lat=-8.133583, lon=-78.990853, is_coastal=False),
    LocationConfig(name="Chicama", lat=-7.694431, lon=-79.438941, is_coastal=True),
    LocationConfig(name="Huamachuco", lat=-7.787071, lon=-78.076645, is_coastal=False),
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/turismo.db"
    api_host: str = "127.0.0.1"
    api_port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"
    enable_hotel_prices: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]
    docs_enabled: bool = True
    weights_file: Path = Path("config/weights.yaml")
    events_file: Path = Path("config/events.yaml")
    locations: list[LocationConfig] = Field(default_factory=lambda: list(DEFAULT_LOCATIONS))

    bbox_lat_min: float = -8.5
    bbox_lat_max: float = -7.5
    bbox_lon_min: float = -79.6
    bbox_lon_max: float = -77.8

    # HTTP client settings
    http_connect_timeout: float = 10.0
    http_read_timeout: float = 30.0
    http_max_response_bytes: int = 10 * 1024 * 1024  # 10 MB default
    http_rate_limit_seconds: float = 2.0
    http_user_agent: str = "TurismoLaLibertad/1.0 (+https://github.com/turismo-la-libertad)"
    circuit_breaker_max_failures: int = 3

    # MINCETUR settings
    mincetur_url: str | None = None
    mincetur_data_dir: Path = Path("data/mincetur")
    mincetur_max_file_bytes: int = 50 * 1024 * 1024  # 50 MB for XLSX files

    # Hotel prices settings
    hotel_prices_data_dir: Path = Path("data/prices")

    # Google Places API (New) key for verified ratings, reviews and photo URLs
    google_places_api_key: str | None = None

    # Collector domain allowlists (only HTTPS allowed)
    collector_allowlists: dict[str, list[str]] = {
        "osm": [
            "overpass-api.de",
            "lz4.overpass-api.de",
            "z.overpass-api.de",
            "overpass.kumi.systems",
        ],
        "open_meteo": [
            "api.open-meteo.com",
            "marine-api.open-meteo.com",
            "www.senamhi.gob.pe",
        ],
        "commercial_enricher": [
            "places.googleapis.com",
            "overpass-api.de",
        ],
        "mininter": [
            "aplicaciones.mininter.gob.pe",
            "services6.arcgis.com",
        ],
        "mincetur": [
            "consultasenlinea.mincetur.gob.pe",
            "www.datosabiertos.gob.pe",
            "datosabiertos.gob.pe",
            "www.mincetur.gob.pe",
        ],
        "events": [],
        "hotel_prices": [],
    }

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, v: str) -> str:
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid:
            raise ValueError(f"log_level must be one of {valid}")
        return upper


def get_settings() -> Settings:
    """Return a fresh Settings instance (no global singleton — inject this)."""
    return Settings()
