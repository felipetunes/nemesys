"""Harden workspace isolation, authentication and auditing.

Revision ID: 20260901_0003
Revises: 20260901_0002
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260901_0003"
down_revision: str | None = "20260901_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _upgrade_flow_keys() -> None:
    op.create_table(
        "flows_0003",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("workspace_id", "id"),
    )
    op.execute(
        "INSERT INTO flows_0003 (workspace_id, id, name, description, definition_json, updated_at) "
        "SELECT workspace_id, id, name, description, definition_json, updated_at FROM flows"
    )
    op.drop_index(op.f("ix_flows_workspace_id"), table_name="flows")
    op.drop_table("flows")
    op.rename_table("flows_0003", "flows")
    op.create_index(op.f("ix_flows_workspace_id"), "flows", ["workspace_id"], unique=False)

    op.create_table(
        "flow_versions_0003",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("flow_id", sa.String(length=120), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("workspace_id", "flow_id", "version"),
    )
    op.execute(
        "INSERT INTO flow_versions_0003 "
        "(workspace_id, flow_id, version, definition_json, published_at) "
        "SELECT workspace_id, flow_id, version, definition_json, published_at FROM flow_versions"
    )
    op.drop_index(op.f("ix_flow_versions_workspace_id"), table_name="flow_versions")
    op.drop_table("flow_versions")
    op.rename_table("flow_versions_0003", "flow_versions")
    op.create_index(
        op.f("ix_flow_versions_workspace_id"),
        "flow_versions",
        ["workspace_id"],
        unique=False,
    )


def _downgrade_flow_keys() -> None:
    op.create_table(
        "flows_0002",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        "INSERT INTO flows_0002 (id, workspace_id, name, description, definition_json, updated_at) "
        "SELECT id, workspace_id, name, description, definition_json, updated_at FROM flows"
    )
    op.drop_index(op.f("ix_flows_workspace_id"), table_name="flows")
    op.drop_table("flows")
    op.rename_table("flows_0002", "flows")
    op.create_index(op.f("ix_flows_workspace_id"), "flows", ["workspace_id"], unique=False)

    op.create_table(
        "flow_versions_0002",
        sa.Column("flow_id", sa.String(length=120), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("flow_id", "version"),
    )
    op.execute(
        "INSERT INTO flow_versions_0002 "
        "(flow_id, version, workspace_id, definition_json, published_at) "
        "SELECT flow_id, version, workspace_id, definition_json, published_at FROM flow_versions"
    )
    op.drop_index(op.f("ix_flow_versions_workspace_id"), table_name="flow_versions")
    op.drop_table("flow_versions")
    op.rename_table("flow_versions_0002", "flow_versions")
    op.create_index(
        op.f("ix_flow_versions_workspace_id"),
        "flow_versions",
        ["workspace_id"],
        unique=False,
    )


def upgrade() -> None:
    _upgrade_flow_keys()
    op.add_column(
        "users",
        sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("workspace_memberships", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_membership_role",
            "role IN ('viewer', 'editor', 'admin', 'owner')",
        )
    with op.batch_alter_table("sessions", recreate="always") as batch_op:
        batch_op.drop_constraint("uq_session_provider_call", type_="unique")
        batch_op.create_unique_constraint(
            "uq_session_workspace_provider_call",
            ["workspace_id", "provider", "provider_call_id"],
        )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("actor", sa.String(length=320), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("resource_type", sa.String(length=120), nullable=False),
        sa.Column("resource_id", sa.String(length=200), nullable=True),
        sa.Column("details_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_events_action"), "audit_events", ["action"], unique=False)
    op.create_index(op.f("ix_audit_events_created_at"), "audit_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_audit_events_workspace_id"), "audit_events", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_events_workspace_id"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_created_at"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_action"), table_name="audit_events")
    op.drop_table("audit_events")
    with op.batch_alter_table("sessions", recreate="always") as batch_op:
        batch_op.drop_constraint("uq_session_workspace_provider_call", type_="unique")
        batch_op.create_unique_constraint(
            "uq_session_provider_call",
            ["provider", "provider_call_id"],
        )
    with op.batch_alter_table("workspace_memberships", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_membership_role", type_="check")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_attempts")
    _downgrade_flow_keys()
