"""Add safety_score, reviews, user_rating_count and image_url to place_details.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-05 01:15:00.000000
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("place_details", sa.Column("user_rating_count", sa.Integer(), nullable=True))
    op.add_column("place_details", sa.Column("image_url", sa.String(length=1000), nullable=True))
    op.add_column("place_details", sa.Column("reviews_json", sa.JSON(), nullable=True))
    op.add_column("place_details", sa.Column("safety_score", sa.Numeric(5, 2), nullable=True))

    # Purge any previously seeded heuristic offers or unverified commercial details
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM offers"))
    conn.execute(
        sa.text(
            "UPDATE place_details SET "
            "stars = NULL, price_level = NULL, price_min = NULL, price_max = NULL, "
            "cuisine = NULL, website = NULL, phone = NULL, opening_hours = NULL, "
            "safety_score = NULL, source = 'osm'"
        )
    )


def downgrade() -> None:
    op.drop_column("place_details", "safety_score")
    op.drop_column("place_details", "reviews_json")
    op.drop_column("place_details", "image_url")
    op.drop_column("place_details", "user_rating_count")
