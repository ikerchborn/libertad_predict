"""Hotel prices collector (stub + local CSV loader)."""
from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pandas as pd
import structlog
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from turismo.pricing.domain.models import PriceSnapshot
from turismo.shared.collector import BaseCollector
from turismo.shared.models import RunResult

if TYPE_CHECKING:
    from turismo.pricing.infrastructure.repository import PriceRepo
    from turismo.shared.config import Settings
    from turismo.shared.db import ScrapeRunRepo
    from turismo.shared.ports import PlaceRepository

logger = structlog.get_logger(__name__)


class RawPriceCsvRow(BaseModel):
    """Pydantic schema for validating raw hotel price observations."""

    model_config = ConfigDict(strict=False)

    place_id: int | None = None
    osm_id: int | None = None
    date_stay: date
    date_scraped: date | None = None
    price_usd: float = Field(gt=0.0, le=10000.0)
    source: str = Field(default="csv_import", min_length=1, max_length=50)


COLUMN_ALIASES: dict[str, list[str]] = {
    "place_id": ["place_id", "id_lugar", "place"],
    "osm_id": ["osm_id", "id_osm"],
    "date_stay": ["date_stay", "stay_date", "date", "fecha_estancia", "fecha"],
    "date_scraped": ["date_scraped", "scraped_date", "fecha_scraping", "fecha_registro"],
    "price_usd": ["price_usd", "price", "precio", "precio_usd", "tarifa_usd", "rate_usd"],
    "source": ["source", "fuente", "origen"],
}


def _normalize_price_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize CSV columns to canonical names: date_stay, price_usd, and place_id/osm_id."""
    clean_cols = {col: str(col).strip().lower() for col in df.columns}
    df = df.rename(columns=clean_cols)

    canonical_mapping: dict[str, str] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in df.columns and alias not in canonical_mapping:
                canonical_mapping[alias] = canonical
                break

    df = df.rename(columns=canonical_mapping)
    if "date_stay" not in df.columns or "price_usd" not in df.columns:
        raise ValueError("Price CSV must contain date_stay and price_usd columns")
    if "place_id" not in df.columns and "osm_id" not in df.columns:
        raise ValueError("Price CSV must contain either place_id or osm_id")

    return df


class HotelPricesCollector(BaseCollector):
    name = "hotel_prices"

    def __init__(
        self,
        place_repo: PlaceRepository,
        price_repo: PriceRepo,
        scrape_repo: ScrapeRunRepo,
        settings: Settings,
    ) -> None:
        super().__init__(scrape_repo)
        self._place_repo = place_repo
        self._price_repo = price_repo
        self._settings = settings

    async def _run_impl(self) -> RunResult:
        if not self._settings.enable_hotel_prices:
            logger.info("Hotel prices collector disabled (ENABLE_HOTEL_PRICES=false)")
            return RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=0,
                status="skipped",
                error="Hotel prices collection disabled (ENABLE_HOTEL_PRICES=false)",
            )

        data_dir = self._settings.hotel_prices_data_dir
        if not data_dir.exists() or not data_dir.is_dir():
            logger.info("Hotel prices directory does not exist", path=str(data_dir))
            return RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=0,
                status="skipped",
                error=f"Directory {data_dir} does not exist",
            )

        csv_files = sorted(data_dir.glob("*.csv"))
        if not csv_files:
            return RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=0,
                status="skipped",
                error=f"No CSV files found in {data_dir}",
            )

        valid_place_ids = self._place_repo.get_existing_ids()
        osm_to_id = self._place_repo.get_osm_to_id_map()

        now_utc = datetime.now(tz=UTC)
        today = now_utc.date()
        records: list[PriceSnapshot] = []
        rejected = 0

        for file_path in csv_files:
            rejected += self._process_file(
                file_path=file_path,
                valid_place_ids=valid_place_ids,
                osm_to_id=osm_to_id,
                records=records,
                today=today,
                now_utc=now_utc,
            )

        upserted = self._price_repo.upsert_many(records)
        return RunResult(
            collector=self.name,
            rows_upserted=upserted,
            rows_rejected=rejected,
            status="ok",
        )

    def _process_file(
        self,
        file_path: Path,
        valid_place_ids: set[int],
        osm_to_id: dict[int, int],
        records: list[PriceSnapshot],
        today: date,
        now_utc: datetime,
    ) -> int:
        rejected = 0
        try:
            df = pd.read_csv(file_path, encoding="utf-8")
            if df.empty:
                return 0
            df = _normalize_price_columns(df)
        except Exception as exc:
            logger.warning("Failed to read price CSV", path=str(file_path), error=str(exc))
            return 1

        for _, row in df.iterrows():
            if not self._parse_and_append_row(
                row=row,
                valid_place_ids=valid_place_ids,
                osm_to_id=osm_to_id,
                records=records,
                today=today,
                now_utc=now_utc,
            ):
                rejected += 1

        return rejected

    def _parse_and_append_row(
        self,
        row: pd.Series[Any],
        valid_place_ids: set[int],
        osm_to_id: dict[int, int],
        records: list[PriceSnapshot],
        today: date,
        now_utc: datetime,
    ) -> bool:
        try:
            raw_data = {str(k): v for k, v in row.to_dict().items() if pd.notna(v)}
            validated = RawPriceCsvRow(**raw_data)

            target_id: int | None = None
            if validated.place_id is not None and validated.place_id in valid_place_ids:
                target_id = validated.place_id
            elif validated.osm_id is not None and validated.osm_id in osm_to_id:
                target_id = osm_to_id[validated.osm_id]

            if target_id is None:
                return False

            records.append(
                PriceSnapshot(
                    place_id=target_id,
                    date_stay=validated.date_stay,
                    date_scraped=validated.date_scraped or today,
                    price_usd=validated.price_usd,
                    source=validated.source,
                    fetched_at=now_utc,
                )
            )
            return True
        except (ValidationError, ValueError, TypeError):
            return False
