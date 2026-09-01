"""Add agent presence, routing and wrap-up state.

Revision ID: 20260901_0005
Revises: 20260901_0004
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260901_0005"
down_revision: str | None = "20260901_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("assigned_agent", sa.String(length=120), nullable=True))
    op.add_column("sessions", sa.Column("wrap_up_code", sa.String(length=80), nullable=True))
    op.create_index(
        "ix_sessions_workspace_agent_status",
        "sessions",
        ["workspace_id", "assigned_agent", "status"],
        unique=False,
    )
    op.create_table(
        "agent_states",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("agent_name", sa.String(length=120), nullable=False),
        sa.Column("presence", sa.String(length=30), nullable=False),
        sa.Column("routing_status", sa.String(length=30), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("workspace_id", "agent_name"),
    )


def downgrade() -> None:
    op.drop_table("agent_states")
    op.drop_index("ix_sessions_workspace_agent_status", table_name="sessions")
    op.drop_column("sessions", "wrap_up_code")
    op.drop_column("sessions", "assigned_agent")
