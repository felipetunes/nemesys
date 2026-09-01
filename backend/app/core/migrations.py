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
            revision = "head" if "audit_events" in tables and "failed_login_attempts" in user_columns else "20260901_0002"
        command.stamp(config, revision)
    command.upgrade(config, "head")
