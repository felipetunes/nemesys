"""Create flow, version and session tables.

Revision ID: 20260831_0001
Revises:
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260831_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flows",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "flow_versions",
        sa.Column("flow_id", sa.String(length=120), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("flow_id", "version"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("flow_id", sa.String(length=120), nullable=False),
        sa.Column("flow_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("session_json", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("provider_call_id", sa.String(length=200), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_call_id", name="uq_session_provider_call"),
    )
    op.create_index(op.f("ix_sessions_flow_id"), "sessions", ["flow_id"], unique=False)
    op.create_index(op.f("ix_sessions_status"), "sessions", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sessions_status"), table_name="sessions")
    op.drop_index(op.f("ix_sessions_flow_id"), table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("flow_versions")
    op.drop_table("flows")
