"""Add flow lifecycle metadata.

Revision ID: 20260901_0004
Revises: 20260901_0003
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260901_0004"
down_revision: str | None = "20260901_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("flows", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_flows_workspace_archived",
        "flows",
        ["workspace_id", "archived_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_flows_workspace_archived", table_name="flows")
    op.drop_column("flows", "archived_at")
