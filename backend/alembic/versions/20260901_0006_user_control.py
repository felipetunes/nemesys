"""Add workspace member activation control.

Revision ID: 20260901_0006
Revises: 20260901_0005
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260901_0006"
down_revision: str | None = "20260901_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspace_memberships",
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.create_index(
        "ix_workspace_memberships_workspace_active",
        "workspace_memberships",
        ["workspace_id", "active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_memberships_workspace_active", table_name="workspace_memberships")
    op.drop_column("workspace_memberships", "active")
