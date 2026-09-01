from app.core import migrations


class LegacyInspector:
    def get_table_names(self) -> list[str]:
        return [
            "flows",
            "users",
            "audit_events",
            "sessions",
            "agent_states",
            "workspace_memberships",
        ]

    def get_columns(self, table_name: str) -> list[dict[str, str]]:
        columns = {
            "flows": ["workspace_id", "archived_at"],
            "users": ["failed_login_attempts"],
            "sessions": ["assigned_agent"],
            "workspace_memberships": ["active"],
        }
        return [{"name": name} for name in columns.get(table_name, [])]


def test_unversioned_database_without_language_starts_from_previous_revision(monkeypatch):
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(migrations, "inspect", lambda _engine: LegacyInspector())
    monkeypatch.setattr(
        migrations.command,
        "stamp",
        lambda _config, revision: calls.append(("stamp", revision)),
    )
    monkeypatch.setattr(
        migrations.command,
        "upgrade",
        lambda _config, revision: calls.append(("upgrade", revision)),
    )

    migrations.upgrade_database(object(), "sqlite:///legacy.db")  # type: ignore[arg-type]

    assert calls == [("stamp", "20260901_0006"), ("upgrade", "head")]
