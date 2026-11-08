"""Initial schema: all tables with constraints and indexes.

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("lon", sa.Numeric(9, 6), nullable=False),
        sa.Column("is_coastal", sa.Boolean(), nullable=False, server_default="0"),
        sa.UniqueConstraint("name", name="uq_location_name"),
        sa.CheckConstraint("lat BETWEEN -90 AND 90", name="ck_location_lat"),
        sa.CheckConstraint("lon BETWEEN -180 AND 180", name="ck_location_lon"),
    )

    op.create_table(
        "places",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("coast_type", sa.String(20), nullable=False),
        sa.Column("lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("lon", sa.Numeric(9, 6), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column(
            "location_id",
            sa.Integer(),
            sa.ForeignKey("locations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("osm_id", name="uq_place_osm_id"),
        sa.CheckConstraint(
            "category IN ('hotel','restaurant','attraction')",
            name="ck_place_category",
        ),
        sa.CheckConstraint("coast_type IN ('coastal','inland')", name="ck_place_coast_type"),
        sa.CheckConstraint("lat BETWEEN -90 AND 90", name="ck_place_lat"),
        sa.CheckConstraint("lon BETWEEN -180 AND 180", name="ck_place_lon"),
    )
    op.create_index("ix_places_category", "places", ["category"])

    op.create_table(
        "weather_daily",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "location_id",
            sa.Integer(),
            sa.ForeignKey("locations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("temp_max_c", sa.Numeric(5, 2), nullable=False),
        sa.Column("temp_min_c", sa.Numeric(5, 2), nullable=False),
        sa.Column("precipitation_mm", sa.Numeric(6, 2), nullable=False),
        sa.Column("rain_probability", sa.Numeric(4, 3), nullable=False),
        sa.Column("uv_index", sa.Numeric(4, 1), nullable=False),
        sa.Column("wind_speed_kmh", sa.Numeric(5, 1), nullable=False),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("location_id", "date", name="uq_weather_location_date"),
        sa.CheckConstraint("rain_probability BETWEEN 0 AND 1", name="ck_weather_rain_prob"),
    )
    op.create_index("ix_weather_location_date", "weather_daily", ["location_id", "date"])

    op.create_table(
        "marine_daily",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "location_id",
            sa.Integer(),
            sa.ForeignKey("locations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("wave_height_m", sa.Numeric(4, 2), nullable=False),
        sa.Column("wave_period_s", sa.Numeric(4, 1), nullable=False),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("location_id", "date", name="uq_marine_location_date"),
    )
    op.create_index("ix_marine_location_date", "marine_daily", ["location_id", "date"])

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("date_start", sa.Date(), nullable=False),
        sa.Column("date_end", sa.Date(), nullable=False),
        sa.Column("crowd_level", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="events.yaml"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("name", "date_start", name="uq_event_name_start"),
        sa.CheckConstraint("crowd_level BETWEEN 1 AND 5", name="ck_event_crowd"),
        sa.CheckConstraint("date_end >= date_start", name="ck_event_dates"),
    )
    op.create_index("ix_event_dates", "events", ["date_start", "date_end"])

    op.create_table(
        "visitors_monthly",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("visitors", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("place_id", "year", "month", name="uq_visitors_place_year_month"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_visitors_month"),
        sa.CheckConstraint("year BETWEEN 2000 AND 2100", name="ck_visitors_year"),
        sa.CheckConstraint("visitors >= 0", name="ck_visitors_non_negative"),
    )
    op.create_index(
        "ix_visitors_place_year_month", "visitors_monthly", ["place_id", "year", "month"]
    )

    op.create_table(
        "price_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date_stay", sa.Date(), nullable=False),
        sa.Column("date_scraped", sa.Date(), nullable=False),
        sa.Column("price_usd", sa.Numeric(8, 2), nullable=False),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "place_id", "date_stay", "date_scraped", "source", name="uq_price_snapshot"
        ),
        sa.CheckConstraint("price_usd > 0", name="ck_price_positive"),
    )
    op.create_index("ix_price_place_stay", "price_snapshots", ["place_id", "date_stay"])

    op.create_table(
        "scores",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("score", sa.Numeric(5, 2), nullable=False),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=False),
        sa.Column("breakdown_json", sa.JSON(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("weights_version", sa.String(50), nullable=False),
        sa.UniqueConstraint("place_id", "date", name="uq_score_place_date"),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name="ck_score_range"),
        sa.CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_score_confidence"),
    )
    op.create_index("ix_score_place_date", "scores", ["place_id", "date"])

    op.create_table(
        "scrape_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("collector", sa.String(100), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("rows_upserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_rejected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.String(500), nullable=True),
        sa.CheckConstraint(
            "status IN ('ok','partial','failed','skipped')",
            name="ck_scrape_status",
        ),
    )
    op.create_index("ix_scrape_collector_started", "scrape_runs", ["collector", "started_at"])


def downgrade() -> None:
    op.drop_table("scrape_runs")
    op.drop_table("scores")
    op.drop_table("price_snapshots")
    op.drop_table("visitors_monthly")
    op.drop_table("events")
    op.drop_table("marine_daily")
    op.drop_table("weather_daily")
    op.drop_table("places")
    op.drop_table("locations")
