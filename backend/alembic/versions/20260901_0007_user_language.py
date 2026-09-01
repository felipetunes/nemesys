"""Persist the user's preferred interface language.

Revision ID: 20260901_0007
Revises: 20260901_0006
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260901_0007"
down_revision: str | None = "20260901_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("language", sa.String(length=10), server_default="pt-BR", nullable=False)
        )
        batch_op.create_check_constraint(
            "ck_users_language",
            "language IN ('pt-BR', 'en-US')",
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_language", type_="check")
        batch_op.drop_column("language")
