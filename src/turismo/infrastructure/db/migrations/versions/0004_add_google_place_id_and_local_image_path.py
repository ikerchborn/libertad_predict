"""Add google_place_id and local_image_path to place_details.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-05 11:35:00.000000
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("place_details") as batch_op:
        batch_op.add_column(sa.Column("google_place_id", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("local_image_path", sa.String(length=500), nullable=True))
        batch_op.create_unique_constraint("uq_place_details_google_place_id", ["google_place_id"])


def downgrade() -> None:
    with op.batch_alter_table("place_details") as batch_op:
        batch_op.drop_constraint("uq_place_details_google_place_id", type_="unique")
        batch_op.drop_column("local_image_path")
        batch_op.drop_column("google_place_id")
