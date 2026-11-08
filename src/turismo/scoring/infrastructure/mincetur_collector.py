"""MINCETUR monthly tourist visitor statistics collector."""
from __future__ import annotations

import io
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pandas as pd
import structlog
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from turismo.shared.collector import BaseCollector
from turismo.shared.models import RunResult, VisitorsMonth

if TYPE_CHECKING:
    from turismo.shared.config import Settings
    from turismo.shared.http import SafeHttpClient
    from turismo.shared.ports import (
        PlaceRepository,
        ScrapeRunRepository,
        VisitorsRepository,
    )

logger = structlog.get_logger(__name__)


class RawVisitorRow(BaseModel):
    """Schema validation for incoming monthly visitor record."""

    model_config = ConfigDict(strict=True)

    site_name: str = Field(min_length=1, max_length=200)
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    visitors: int = Field(ge=0)


COLUMN_ALIASES = {
    "year": ["year", "anio", "año", "periodo_anio"],
    "month": ["month", "mes", "periodo_mes"],
    "site": ["site", "sitio", "recurso", "atractivo", "lugar"],
    "visitors": ["visitors", "visitantes", "total_visitantes", "total"],
}


def normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and rename DataFrame columns to canonical names: year, month, site, visitors."""
    clean_cols = {col: str(col).strip().lower() for col in df.columns}
    df = df.rename(columns=clean_cols)

    canonical_mapping: dict[str, str] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        found = False
        for alias in aliases:
            if alias in df.columns:
                canonical_mapping[alias] = canonical
                found = True
                break
        if not found:
            raise ValueError(
                f"Missing required column for '{canonical}'. Expected one of: {aliases}"
            )

    return df.rename(columns=canonical_mapping)


class MinceturCollector(BaseCollector):
    name = "mincetur"

    def __init__(
        self,
        place_repo: PlaceRepository,
        visitors_repo: VisitorsRepository,
        scrape_repo: ScrapeRunRepository,
        settings: Settings,
        http_client: SafeHttpClient | None = None,
    ) -> None:
        super().__init__(scrape_repo)
        self._place_repo = place_repo
        self._visitors_repo = visitors_repo
        self._settings = settings
        self._http = http_client

    async def _run_impl(self) -> RunResult:
        place_name_to_id: dict[str, int] = {}
        if hasattr(self._place_repo, "get_name_to_id_map"):
            name_to_id = self._place_repo.get_name_to_id_map()
            if isinstance(name_to_id, dict):
                for name, pid in name_to_id.items():
                    lower = str(name).lower()
                    if "chan chan" in lower:
                        place_name_to_id["chan chan"] = int(pid)
                    elif "moche" in lower or "luna" in lower or "sol" in lower:
                        place_name_to_id["huacas de moche"] = int(pid)

        if not place_name_to_id:
            all_places = self._place_repo.list_all()
            if isinstance(all_places, list):
                for p in all_places:
                    lower = p.name.lower()
                    if "chan chan" in lower:
                        place_name_to_id["chan chan"] = p.osm_id
                    elif "moche" in lower or "luna" in lower or "sol" in lower:
                        place_name_to_id["huacas de moche"] = p.osm_id

        df: pd.DataFrame | None = None
        if self._settings.mincetur_url and self._http:
            df = await self._try_download_remote()

        if df is None:
            df = self._load_from_local_directory()

        if df is None or df.empty:
            return RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=0,
                status="skipped",
                error="No MINCETUR dataset available (URL unconfigured and local directory empty)",
            )

        try:
            df_norm = normalize_dataframe_columns(df)
        except ValueError as exc:
            return RunResult(
                collector=self.name,
                rows_upserted=0,
                rows_rejected=len(df),
                status="failed",
                error=str(exc)[:500],
            )

        now_utc = datetime.now(tz=UTC)
        records: list[VisitorsMonth] = []
        rejected = 0

        for _, row in df_norm.iterrows():
            site_raw = str(row.get("site", "")).strip().lower()
            target_id = None
            if "chan chan" in site_raw:
                target_id = place_name_to_id.get("chan chan", 101)
            elif "moche" in site_raw or "luna" in site_raw or "sol" in site_raw:
                target_id = place_name_to_id.get("huacas de moche", 102)

            if target_id is None:
                continue

            try:
                validated = RawVisitorRow(
                    site_name=site_raw,
                    year=int(row["year"]),
                    month=int(row["month"]),
                    visitors=int(row["visitors"]),
                )
                records.append(
                    VisitorsMonth(
                        place_id=target_id,
                        year=validated.year,
                        month=validated.month,
                        visitors=validated.visitors,
                        source="mincetur",
                        fetched_at=now_utc,
                    )
                )
            except (ValidationError, ValueError, TypeError):
                rejected += 1

        upserted = self._visitors_repo.upsert_many(records)
        return RunResult(
            collector=self.name,
            rows_upserted=upserted,
            rows_rejected=rejected,
            status="ok",
        )

    async def _try_download_remote(self) -> pd.DataFrame | None:
        url = self._settings.mincetur_url
        if not url or not self._http:
            return None
        try:
            resp = await self._http.get(
                url,
                collector=self.name,
                max_bytes=self._settings.mincetur_max_file_bytes,
                cache_ttl=2592000.0,
            )
            if resp.status_code != 200:
                return None

            content = resp.content
            if url.endswith(".xlsx") or b"PK" in content[:4]:
                return pd.read_excel(io.BytesIO(content))
            return pd.read_csv(io.BytesIO(content))
        except Exception:
            return None

    def _load_from_local_directory(self) -> pd.DataFrame | None:
        data_dir = self._settings.mincetur_data_dir
        if not data_dir.exists():
            return None

        csv_files = list(data_dir.glob("*.csv"))
        if csv_files:
            frames: list[pd.DataFrame] = []
            for path in csv_files:
                try:
                    frames.append(pd.read_csv(path))
                except Exception as exc:
                    logger.warning("mincetur_csv_read_error", path=str(path), error=str(exc))
                    continue
            if frames:
                return pd.concat(frames, ignore_index=True)

        xlsx_files = list(data_dir.glob("*.xlsx"))
        if xlsx_files:
            frames = []
            for path in xlsx_files:
                try:
                    frames.append(pd.read_excel(path))
                except Exception as exc:
                    logger.warning("mincetur_xlsx_read_error", path=str(path), error=str(exc))
                    continue
            if frames:
                return pd.concat(frames, ignore_index=True)

        return None
