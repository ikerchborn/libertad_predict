"""Add safety_report_json to place_details.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-05 12:45:00.000000
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("place_details") as batch_op:
        batch_op.add_column(sa.Column("safety_report_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("place_details") as batch_op:
        batch_op.drop_column("safety_report_json")
