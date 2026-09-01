"""Add authentication and workspace isolation.

Revision ID: 20260901_0002
Revises: 20260831_0001
Create Date: 2026-09-01
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "20260901_0002"
down_revision: str | None = "20260831_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    workspaces = op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.bulk_insert(workspaces, [{"id": "default", "name": "Offline demo", "created_at": datetime.now(UTC)}])
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "workspace_memberships",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "workspace_id"),
    )
    op.create_table(
        "auth_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index(op.f("ix_auth_sessions_expires_at"), "auth_sessions", ["expires_at"], unique=False)
    op.create_index(op.f("ix_auth_sessions_user_id"), "auth_sessions", ["user_id"], unique=False)

    op.add_column(
        "flows",
        sa.Column("workspace_id", sa.String(length=36), server_default=sa.text("'default'"), nullable=False),
    )
    op.create_index(op.f("ix_flows_workspace_id"), "flows", ["workspace_id"], unique=False)
    op.add_column(
        "flow_versions",
        sa.Column("workspace_id", sa.String(length=36), server_default=sa.text("'default'"), nullable=False),
    )
    op.create_index(op.f("ix_flow_versions_workspace_id"), "flow_versions", ["workspace_id"], unique=False)
    op.add_column(
        "sessions",
        sa.Column("workspace_id", sa.String(length=36), server_default=sa.text("'default'"), nullable=False),
    )
    op.create_index(op.f("ix_sessions_workspace_id"), "sessions", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sessions_workspace_id"), table_name="sessions")
    op.drop_column("sessions", "workspace_id")
    op.drop_index(op.f("ix_flow_versions_workspace_id"), table_name="flow_versions")
    op.drop_column("flow_versions", "workspace_id")
    op.drop_index(op.f("ix_flows_workspace_id"), table_name="flows")
    op.drop_column("flows", "workspace_id")
    op.drop_index(op.f("ix_auth_sessions_user_id"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_expires_at"), table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_table("workspace_memberships")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_table("workspaces")
