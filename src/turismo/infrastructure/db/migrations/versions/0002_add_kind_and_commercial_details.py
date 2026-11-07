"""Add kind column to places and create place_details and offers tables.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-04 19:55:00.000000
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add kind column to places
    with op.batch_alter_table("places") as batch_op:
        batch_op.add_column(
            sa.Column("kind", sa.String(20), nullable=False, server_default="unclassified")
        )
        batch_op.create_index("ix_places_kind", ["kind"])

    # 2. Reclassify existing rows
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE places SET kind = 'attraction' "
            "WHERE source = 'manual' OR category = 'attraction'"
        )
    )
    conn.execute(
        sa.text("UPDATE places SET kind = 'lodging' WHERE category = 'hotel'")
    )
    conn.execute(
        sa.text("UPDATE places SET kind = 'food' WHERE category = 'restaurant'")
    )

    # 3. Create place_details table
    op.create_table(
        "place_details",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("opening_hours", sa.String(200), nullable=True),
        sa.Column("cuisine", sa.String(100), nullable=True),
        sa.Column("stars", sa.Numeric(3, 1), nullable=True),
        sa.Column("price_level", sa.Integer(), nullable=True),
        sa.Column("price_min", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_max", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(10), nullable=False, server_default="PEN"),
        sa.Column("menu_url", sa.String(500), nullable=True),
        sa.Column("maps_url", sa.String(500), nullable=False),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price_level BETWEEN 1 AND 4", name="ck_place_details_price_level"),
    )
    op.create_index("ix_place_details_place_id", "place_details", ["place_id"])

    # 4. Create offers table
    op.create_table(
        "offers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="PEN"),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price > 0", name="ck_offer_price_positive"),
    )
    op.create_index("ix_offers_place_id", "offers", ["place_id"])


def downgrade() -> None:
    op.drop_table("offers")
    op.drop_table("place_details")
    with op.batch_alter_table("places") as batch_op:
        batch_op.drop_index("ix_places_kind")
        batch_op.drop_column("kind")
