import httpx
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.core.db import Base, get_db
from app.demo_flow import build_demo_flow
from app.main import app
from app.models import SessionRow
from app.services.flow_repository import FlowRepository


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
