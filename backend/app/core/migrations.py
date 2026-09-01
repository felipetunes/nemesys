from pathlib import Path

from sqlalchemy import Engine, inspect

from alembic import command
from alembic.config import Config


def upgrade_database(engine: Engine, database_url: str) -> None:
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "flows" in tables and "alembic_version" not in tables:
        flow_columns = {column["name"] for column in inspector.get_columns("flows")}
        if "workspace_id" not in flow_columns:
            revision = "20260831_0001"
        else:
            user_columns = (
                {column["name"] for column in inspector.get_columns("users")} if "users" in tables else set()
            )
            if "audit_events" not in tables or "failed_login_attempts" not in user_columns:
                revision = "20260901_0002"
            elif "archived_at" not in flow_columns:
                revision = "20260901_0003"
            else:
                session_columns = {column["name"] for column in inspector.get_columns("sessions")}
                if "agent_states" not in tables or "assigned_agent" not in session_columns:
                    revision = "20260901_0004"
                else:
                    membership_columns = {
                        column["name"] for column in inspector.get_columns("workspace_memberships")
                    }
                    revision = "head" if "active" in membership_columns else "20260901_0005"
        command.stamp(config, revision)
    command.upgrade(config, "head")
