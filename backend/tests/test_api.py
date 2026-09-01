import hashlib
import hmac
import time

import httpx
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.db import Base, get_db
from app.demo_flow import build_demo_flow
from app.main import app
from app.models import SessionRow
from app.services.auth import AuthService
from app.services.flow_repository import FlowRepository
from app.telephony import generic_adapter


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def api_client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'api.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with db_factory() as db:
        repo = FlowRepository(db)
        repo.save(build_demo_flow())
        repo.publish("demo-commerce")

    def override_db():
        with db_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                yield client, db_factory
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_session_uses_published_version_after_draft_changes(api_client):
    client, _ = api_client
    created = await client.post("/api/sessions", json={"flow_id": "demo-commerce"})
    assert created.status_code == 200
    session = created.json()
    assert session["flow_version"] == 1

    draft = (await client.get("/api/flows/demo-commerce")).json()
    welcome = next(node for node in draft["nodes"] if node["id"] == "welcome")
    welcome["config"]["message"] = "New draft welcome"
    saved = await client.put("/api/flows/demo-commerce", json=draft)
    assert saved.status_code == 200
    published = await client.post("/api/flows/demo-commerce/publish")
    assert published.status_code == 200
    assert published.json()["version"] == 2

    completed = await client.post(f"/api/sessions/{session['id']}/input", json={"value": "2"})
    assert completed.status_code == 200
    assert completed.json()["flow_version"] == 1
    assert completed.json()["variables"]["intent"] == "cancellation"


@pytest.mark.anyio
async def test_twilio_voice_webhook_is_idempotent(api_client):
    client, db_factory = api_client

    first = await client.post("/api/telephony/twilio/voice", data={"CallSid": "CA-idempotent"})
    second = await client.post("/api/telephony/twilio/voice", data={"CallSid": "CA-idempotent"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.text == second.text
    with db_factory() as db:
        count = db.scalar(
            select(func.count())
            .select_from(SessionRow)
            .where(SessionRow.provider == "twilio", SessionRow.provider_call_id == "CA-idempotent")
        )
    assert count == 1


@pytest.mark.anyio
async def test_flow_validation_rejects_invalid_node_config(api_client):
    client, _ = api_client
    invalid = build_demo_flow().model_dump(mode="json")
    set_node = {
        "id": "invalid-set",
        "type": "set_variable",
        "label": "Invalid set",
        "x": 0,
        "y": 0,
        "config": {},
    }
    invalid["nodes"].append(set_node)

    response = await client.post("/api/flows/actions/validate", json=invalid)

    assert response.status_code == 422


@pytest.mark.anyio
async def test_flow_export_is_portable(api_client):
    client, _ = api_client

    response = await client.get("/api/flows/demo-commerce/export")

    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="demo-commerce.flow.json"'
    exported = response.json()
    assert exported["id"] == "demo-commerce"
    assert "version" not in exported
    assert "published_at" not in exported
    assert "updated_at" not in exported


@pytest.mark.anyio
async def test_flow_import_requires_explicit_overwrite(api_client):
    client, _ = api_client
    imported = build_demo_flow().model_copy(update={"id": "imported-commerce", "name": "Imported commerce"})

    created = await client.post("/api/flows/actions/import", json=imported.model_dump(mode="json"))
    duplicate = await client.post("/api/flows/actions/import", json=imported.model_dump(mode="json"))
    overwritten = await client.post(
        "/api/flows/actions/import?overwrite=true",
        json=imported.model_copy(update={"name": "Updated import"}).model_dump(mode="json"),
    )

    assert created.status_code == 201
    assert duplicate.status_code == 409
    assert overwritten.status_code == 201
    assert overwritten.json()["name"] == "Updated import"


@pytest.mark.anyio
async def test_flow_lifecycle_and_version_restore(api_client):
    client, _ = api_client
    original = (await client.get("/api/flows/demo-commerce")).json()
    duplicate_payload = {
        "id": "demo-commerce-copy",
        "name": "Demo Commerce Copy",
        "description": "Lifecycle test",
    }

    duplicate = await client.post("/api/flows/demo-commerce/duplicate", json=duplicate_payload)
    archived = await client.post("/api/flows/demo-commerce/archive")
    active = await client.get("/api/flows")
    all_flows = await client.get("/api/flows?include_archived=true")
    blocked_publish = await client.post("/api/flows/demo-commerce/publish")
    blocked_session = await client.post("/api/sessions", json={"flow_id": "demo-commerce"})
    restored = await client.post("/api/flows/demo-commerce/restore")

    changed = restored.json()
    changed["name"] = "Changed draft"
    saved = await client.put("/api/flows/demo-commerce", json=changed)
    restored_version = await client.post("/api/flows/demo-commerce/versions/1/restore")

    assert duplicate.status_code == 201
    assert duplicate.json()["id"] == "demo-commerce-copy"
    assert duplicate.json()["version"] is None
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert {flow["id"] for flow in active.json()} == {"demo-commerce-copy"}
    assert {flow["id"] for flow in all_flows.json()} == {"demo-commerce", "demo-commerce-copy"}
    assert blocked_publish.status_code == 409
    assert blocked_session.status_code == 409
    assert saved.json()["name"] == "Changed draft"
    assert restored_version.status_code == 200
    assert restored_version.json()["name"] == original["name"]
    assert restored_version.json()["version"] is None


@pytest.mark.anyio
async def test_permanent_flow_delete_requires_archive_and_no_session_history(api_client):
    client, _ = api_client

    active_delete = await client.delete("/api/flows/demo-commerce")
    session = await client.post("/api/sessions", json={"flow_id": "demo-commerce"})
    archived = await client.post("/api/flows/demo-commerce/archive")
    protected_delete = await client.delete("/api/flows/demo-commerce")

    assert active_delete.status_code == 409
    assert session.status_code == 200
    assert archived.status_code == 200
    assert protected_delete.status_code == 409
    assert "session history" in protected_delete.json()["detail"]


@pytest.mark.anyio
async def test_archived_flow_without_sessions_can_be_deleted(api_client):
    client, _ = api_client
    flow = build_demo_flow().model_copy(update={"id": "temporary-flow", "name": "Temporary flow"})

    created = await client.post("/api/flows/actions/import", json=flow.model_dump(mode="json"))
    archived = await client.post("/api/flows/temporary-flow/archive")
    deleted = await client.delete("/api/flows/temporary-flow")
    missing = await client.get("/api/flows/temporary-flow")

    assert created.status_code == 201
    assert archived.status_code == 200
    assert deleted.status_code == 204
    assert missing.status_code == 404


@pytest.mark.anyio
async def test_management_token_protects_flow_mutations(api_client, monkeypatch):
    client, _ = api_client
    draft = build_demo_flow().model_dump(mode="json")
    monkeypatch.setenv("ADMIN_API_KEY", "test-management-token")
    get_settings.cache_clear()
    try:
        rejected = await client.put("/api/flows/demo-commerce", json=draft)
        accepted = await client.put(
            "/api/flows/demo-commerce",
            json=draft,
            headers={"Authorization": "Bearer test-management-token"},
        )
    finally:
        get_settings.cache_clear()

    assert rejected.status_code == 401
    assert accepted.status_code == 200


@pytest.mark.anyio
async def test_metrics_endpoint_reports_persisted_activity(api_client):
    client, _ = api_client
    created = await client.post("/api/sessions", json={"flow_id": "demo-commerce"})
    session_id = created.json()["id"]
    completed = await client.post(f"/api/sessions/{session_id}/input", json={"value": "1"})

    response = await client.get("/api/operations/metrics")

    assert completed.status_code == 200
    assert response.status_code == 200
    assert response.json()["total_sessions"] == 1
    assert response.json()["status_counts"] == {"completed": 1}


@pytest.mark.anyio
async def test_queue_session_can_be_claimed_by_simulated_agent(api_client):
    client, _ = api_client
    created = await client.post("/api/sessions", json={"flow_id": "demo-commerce"})
    session_id = created.json()["id"]
    queued = await client.post(f"/api/sessions/{session_id}/input", json={"value": "0"})

    waiting = await client.get("/api/queue")
    blocked = await client.post(f"/api/queue/{session_id}/claim", json={"agent_name": "Test Agent"})
    presence = await client.put("/api/agents/Test%20Agent/presence", json={"presence": "on_queue"})
    claimed = await client.post(f"/api/queue/{session_id}/claim", json={"agent_name": "Test Agent"})
    assigned = await client.get("/api/queue/assigned", params={"agent_name": "Test Agent"})
    agents_during_interaction = await client.get("/api/agents")
    wrapped_up = await client.post(
        f"/api/queue/{session_id}/wrap-up",
        json={"code": "resolved", "notes": "Customer request resolved."},
    )
    assigned_after_wrap_up = await client.get("/api/queue/assigned", params={"agent_name": "Test Agent"})
    agents_after_wrap_up = await client.get("/api/agents")

    assert queued.status_code == 200
    assert queued.json()["status"] == "queued"
    assert [session["id"] for session in waiting.json()] == [session_id]
    assert blocked.status_code == 409
    assert presence.status_code == 200
    assert presence.json()["routing_status"] == "idle"
    assert claimed.status_code == 200
    assert claimed.json()["status"] == "wrap_up"
    assert claimed.json()["assigned_agent"] == "Test Agent"
    assert [session["id"] for session in assigned.json()] == [session_id]
    assert agents_during_interaction.json()[0]["routing_status"] == "interacting"
    assert wrapped_up.status_code == 200
    assert wrapped_up.json()["status"] == "completed"
    assert wrapped_up.json()["wrap_up_code"] == "resolved"
    assert wrapped_up.json()["wrap_up_notes"] == "Customer request resolved."
    assert assigned_after_wrap_up.json() == []
    assert agents_after_wrap_up.json()[0]["routing_status"] == "idle"


@pytest.mark.anyio
async def test_user_authentication_scopes_flows_to_workspace(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("ALLOW_REGISTRATION", "false")
    get_settings.cache_clear()
    try:
        registration_before = await client.get("/api/auth/capabilities")
        blocked = await client.get("/api/flows")
        registered = await client.post(
            "/api/auth/register",
            json={
                "email": "owner@example.com",
                "password": "correct horse battery staple",
                "workspace_name": "Example Support",
            },
        )
        token_payload = registered.json()
        headers = {
            "Authorization": f"Bearer {token_payload['token']}",
            "X-Workspace-ID": token_payload["workspaces"][0]["id"],
        }
        workspace_flows = await client.get("/api/flows", headers=headers)
        workspace_flow_by_id = await client.get("/api/flows/demo-commerce", headers=headers)
        logged_in = await client.post(
            "/api/auth/login",
            json={"email": "owner@example.com", "password": "correct horse battery staple"},
        )
        second_registration = await client.post(
            "/api/auth/register",
            json={
                "email": "second@example.com",
                "password": "another correct horse password",
                "workspace_name": "Second Support",
            },
        )
        registration_after = await client.get("/api/auth/capabilities")
        logged_out = await client.post("/api/auth/logout", headers=headers)
        revoked = await client.get("/api/flows", headers=headers)
    finally:
        get_settings.cache_clear()

    assert blocked.status_code == 401
    assert registration_before.json()["owner_registration_available"] is True
    assert registered.status_code == 201
    assert len(workspace_flows.json()) == 1
    assert workspace_flows.json()[0]["id"] == "demo-commerce"
    assert workspace_flow_by_id.status_code == 200
    assert workspace_flow_by_id.json()["name"] == "Example Support Demo IVR"
    assert logged_in.status_code == 200
    assert second_registration.status_code == 403
    assert registration_after.json()["owner_registration_available"] is False
    assert logged_out.status_code == 204
    assert revoked.status_code == 401


@pytest.mark.anyio
async def test_user_language_is_persisted_in_profile(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        registered = await client.post(
            "/api/auth/register",
            json={
                "email": "language-owner@example.com",
                "password": "correct horse battery staple",
                "workspace_name": "Language Support",
                "language": "en-US",
            },
        )
        registration = registered.json()
        workspace_id = registration["workspaces"][0]["id"]
        headers = {
            "Authorization": f"Bearer {registration['token']}",
            "X-Workspace-ID": workspace_id,
        }
        profile = await client.get("/api/auth/me", headers=headers)
        updated = await client.patch(
            "/api/auth/me",
            json={"language": "pt-BR"},
            headers=headers,
        )
        invalid = await client.patch(
            "/api/auth/me",
            json={"language": "es-AR"},
            headers=headers,
        )
        logged_in = await client.post(
            "/api/auth/login",
            json={"email": "language-owner@example.com", "password": "correct horse battery staple"},
        )
    finally:
        get_settings.cache_clear()

    assert registered.status_code == 201
    assert registration["language"] == "en-US"
    assert profile.status_code == 200
    assert profile.json()["language"] == "en-US"
    assert updated.status_code == 200
    assert updated.json()["language"] == "pt-BR"
    assert invalid.status_code == 422
    assert logged_in.status_code == 200
    assert logged_in.json()["language"] == "pt-BR"


@pytest.mark.anyio
async def test_generic_telephony_adapter_is_idempotent(api_client):
    client, _ = api_client
    payload = {"provider_call_id": "generic-call-1", "flow_id": "demo-commerce"}

    first = await client.post("/api/telephony/generic/start", json=payload)
    second = await client.post("/api/telephony/generic/start", json=payload)
    session_id = first.json()["id"]
    completed = await client.post(
        f"/api/telephony/generic/{session_id}/input",
        json={"provider_call_id": "generic-call-1", "value": "1"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == session_id
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert completed.json()["variables"]["channel"] == "generic-webhook"


@pytest.mark.anyio
async def test_generic_telephony_adapter_validates_signature(api_client):
    client, _ = api_client
    body = b'{"provider_call_id":"signed-call","flow_id":"demo-commerce"}'
    timestamp = str(int(time.time()))
    signature = hmac.new(b"test-webhook-secret", timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    generic_adapter.settings.generic_webhook_secret = "test-webhook-secret"
    try:
        rejected = await client.post(
            "/api/telephony/generic/start",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Nemesys-Timestamp": timestamp,
                "X-Nemesys-Signature": "invalid",
            },
        )
        stale_timestamp = str(int(time.time()) - generic_adapter.settings.generic_webhook_tolerance_seconds - 1)
        stale_signature = hmac.new(
            b"test-webhook-secret",
            stale_timestamp.encode() + b"." + body,
            hashlib.sha256,
        ).hexdigest()
        stale = await client.post(
            "/api/telephony/generic/start",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Nemesys-Timestamp": stale_timestamp,
                "X-Nemesys-Signature": stale_signature,
            },
        )
        accepted = await client.post(
            "/api/telephony/generic/start",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Nemesys-Timestamp": timestamp,
                "X-Nemesys-Signature": signature,
            },
        )
    finally:
        generic_adapter.settings.generic_webhook_secret = None

    assert rejected.status_code == 403
    assert stale.status_code == 403
    assert accepted.status_code == 200


@pytest.mark.anyio
async def test_workspace_roles_and_audit_log_are_enforced(api_client, monkeypatch):
    client, db_factory = api_client
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        owner_registration = await client.post(
            "/api/auth/register",
            json={
                "email": "rbac-owner@example.com",
                "password": "correct horse battery staple",
                "workspace_name": "RBAC Support",
            },
        )
        owner_payload = owner_registration.json()
        workspace_id = owner_payload["workspaces"][0]["id"]
        owner_headers = {
            "Authorization": f"Bearer {owner_payload['token']}",
            "X-Workspace-ID": workspace_id,
        }
        with db_factory() as db:
            viewer = AuthService(db).register(
                "viewer@example.com",
                "another correct horse password",
                "Viewer Home",
                7,
            )
        added_member = await client.post(
            "/api/workspaces/members",
            json={"email": "viewer@example.com", "role": "viewer"},
            headers=owner_headers,
        )
        viewer_headers = {
            "Authorization": f"Bearer {viewer.token}",
            "X-Workspace-ID": workspace_id,
        }

        readable = await client.get("/api/flows", headers=viewer_headers)
        draft = (await client.get("/api/flows/demo-commerce", headers=owner_headers)).json()
        forbidden_write = await client.put("/api/flows/demo-commerce", json=draft, headers=viewer_headers)
        promoted = await client.patch(
            f"/api/workspaces/members/{viewer.user_id}",
            json={"role": "editor"},
            headers=owner_headers,
        )
        editor_write = await client.put("/api/flows/demo-commerce", json=draft, headers=viewer_headers)
        owner_write = await client.put("/api/flows/demo-commerce", json=draft, headers=owner_headers)
        last_owner_delete = await client.delete(
            f"/api/workspaces/members/{owner_payload['user_id']}",
            headers=owner_headers,
        )
        forbidden_audit = await client.get("/api/operations/audit", headers=viewer_headers)
        audit = await client.get("/api/operations/audit", headers=owner_headers)
    finally:
        get_settings.cache_clear()

    assert owner_registration.status_code == 201
    assert added_member.status_code == 201
    assert readable.status_code == 200
    assert forbidden_write.status_code == 403
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "editor"
    assert editor_write.status_code == 200
    assert owner_write.status_code == 200
    assert last_owner_delete.status_code == 409
    assert forbidden_audit.status_code == 403
    assert audit.status_code == 200
    assert any(event["action"] == "flow.saved" for event in audit.json())


@pytest.mark.anyio
async def test_user_administration_and_agent_identity_are_enforced(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        owner_registration = await client.post(
            "/api/auth/register",
            json={
                "email": "admin@example.com",
                "password": "correct horse battery staple",
                "workspace_name": "Agent Support",
            },
        )
        owner = owner_registration.json()
        workspace_id = owner["workspaces"][0]["id"]
        owner_headers = {
            "Authorization": f"Bearer {owner['token']}",
            "X-Workspace-ID": workspace_id,
        }
        created_agent = await client.post(
            "/api/workspaces/users",
            json={
                "email": "agent@example.com",
                "password": "temporary agent password",
                "role": "editor",
            },
            headers=owner_headers,
        )
        members = await client.get("/api/workspaces/members", headers=owner_headers)
        agent_login = await client.post(
            "/api/auth/login",
            json={"email": "agent@example.com", "password": "temporary agent password"},
        )
        agent = agent_login.json()
        agent_headers = {
            "Authorization": f"Bearer {agent['token']}",
            "X-Workspace-ID": workspace_id,
        }
        own_presence = await client.put(
            "/api/agents/agent@example.com/presence",
            json={"presence": "on_queue"},
            headers=agent_headers,
        )
        impersonation = await client.put(
            "/api/agents/another-agent/presence",
            json={"presence": "on_queue"},
            headers=agent_headers,
        )
        owner_impersonation = await client.put(
            "/api/agents/agent@example.com/presence",
            json={"presence": "available"},
            headers=owner_headers,
        )
        agent_id = created_agent.json()["user_id"]
        deactivated = await client.patch(
            f"/api/workspaces/members/{agent_id}/status",
            json={"active": False},
            headers=owner_headers,
        )
        blocked_token = await client.get("/api/flows", headers=agent_headers)
        blocked_login = await client.post(
            "/api/auth/login",
            json={"email": "agent@example.com", "password": "temporary agent password"},
        )
        reactivated = await client.patch(
            f"/api/workspaces/members/{agent_id}/status",
            json={"active": True},
            headers=owner_headers,
        )
        revoked_token = await client.get("/api/flows", headers=agent_headers)
        last_owner_deactivation = await client.patch(
            f"/api/workspaces/members/{owner['user_id']}/status",
            json={"active": False},
            headers=owner_headers,
        )
    finally:
        get_settings.cache_clear()

    assert owner_registration.status_code == 201
    assert created_agent.status_code == 201
    assert created_agent.json()["active"] is True
    assert {member["email"] for member in members.json()} == {"admin@example.com", "agent@example.com"}
    assert agent_login.status_code == 200
    assert own_presence.status_code == 200
    assert own_presence.json()["agent_name"] == "agent@example.com"
    assert impersonation.status_code == 403
    assert owner_impersonation.status_code == 403
    assert deactivated.status_code == 200
    assert deactivated.json()["active"] is False
    assert blocked_token.status_code == 401
    assert blocked_login.status_code == 401
    assert reactivated.status_code == 200
    assert reactivated.json()["active"] is True
    assert revoked_token.status_code == 401
    assert last_owner_deactivation.status_code == 409


@pytest.mark.anyio
async def test_health_endpoints_and_security_headers(api_client):
    client, _ = api_client

    response = await client.get("/health/ready", headers={"X-Request-ID": "test-request-123"})

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "version": "0.15.0"}
    assert response.headers["x-request-id"] == "test-request-123"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
