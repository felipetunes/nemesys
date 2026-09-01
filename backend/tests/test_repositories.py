import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.demo_flow import build_demo_flow
from app.engine.runtime import FlowEngine
from app.models import FlowDefinition, FlowEdge, FlowNode, MessageConfig
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository


@pytest.fixture
def db_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'repository.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def test_published_versions_are_immutable(db_factory):
    with db_factory() as db:
        repo = FlowRepository(db)
        draft = repo.save(build_demo_flow())
        version_one = repo.publish(draft.id)
        assert version_one is not None

        welcome = next(node for node in draft.nodes if node.id == "welcome")
        assert isinstance(welcome.config, MessageConfig)
        welcome.config.message = "Updated draft"
        repo.save(draft)
        version_two = repo.publish(draft.id)
        assert version_two is not None

        persisted_v1 = repo.get_version(draft.id, 1)
        persisted_v2 = repo.get_version(draft.id, 2)

    assert persisted_v1 is not None
    assert persisted_v2 is not None
    assert persisted_v1.version == 1
    assert persisted_v2.version == 2
    first_welcome = next(node for node in persisted_v1.nodes if node.id == "welcome")
    second_welcome = next(node for node in persisted_v2.nodes if node.id == "welcome")
    assert isinstance(first_welcome.config, MessageConfig)
    assert isinstance(second_welcome.config, MessageConfig)
    assert first_welcome.config.message != second_welcome.config.message


def test_active_session_remains_pinned_to_original_flow_version(db_factory):
    engine = FlowEngine()
    with db_factory() as db:
        flow_repo = FlowRepository(db)
        flow_repo.save(build_demo_flow())
        published = flow_repo.publish("demo-commerce")
        assert published is not None
        session = SessionRepository(db).create(engine.create_session(published))

        replacement = FlowDefinition(
            id="demo-commerce",
            name="Replacement",
            nodes=[
                FlowNode(id="start", type="start", label="Start", config={}),
                FlowNode(id="end", type="end", label="End", config={"message": "Done"}),
            ],
            edges=[FlowEdge(id="replacement-edge", source="start", target="end")],
        )
        flow_repo.save(replacement)
        flow_repo.publish(replacement.id)

        pinned_flow = flow_repo.get_version(session.flow_id, session.flow_version)
        assert pinned_flow is not None
        engine.submit_input(pinned_flow, session, "2")
        persisted = SessionRepository(db).save(session, expected_revision=0)

    assert persisted.status == "completed"
    assert persisted.variables["intent"] == "cancellation"
    assert persisted.flow_version == 1


def test_session_updates_use_optimistic_concurrency(db_factory):
    engine = FlowEngine()
    with db_factory() as db:
        flow_repo = FlowRepository(db)
        flow_repo.save(build_demo_flow())
        flow = flow_repo.publish("demo-commerce")
        assert flow is not None
        created = SessionRepository(db).create(engine.create_session(flow))

    with db_factory() as first_db, db_factory() as second_db:
        first_repo = SessionRepository(first_db)
        second_repo = SessionRepository(second_db)
        first = first_repo.get(created.id)
        second = second_repo.get(created.id)
        assert first is not None
        assert second is not None

        engine.submit_input(flow, first, "1")
        engine.submit_input(flow, second, "2")
        first_repo.save(first, expected_revision=first.revision)

        with pytest.raises(SessionConflictError):
            second_repo.save(second, expected_revision=second.revision)


def test_provider_call_lookup_supports_idempotency(db_factory):
    engine = FlowEngine()
    with db_factory() as db:
        flow_repo = FlowRepository(db)
        flow_repo.save(build_demo_flow())
        flow = flow_repo.publish("demo-commerce")
        assert flow is not None
        repo = SessionRepository(db)
        created = repo.create(
            engine.create_session(flow, {"provider_call_id": "CA123"}),
            provider="twilio",
            provider_call_id="CA123",
        )
        found = repo.get_by_provider_call("twilio", "CA123")
        duplicate = repo.create(
            engine.create_session(flow, {"provider_call_id": "CA123"}),
            provider="twilio",
            provider_call_id="CA123",
        )

    assert found is not None
    assert found.id == created.id
    assert duplicate.id == created.id


def test_flow_and_provider_identifiers_are_isolated_by_workspace(db_factory):
    engine = FlowEngine()
    with db_factory() as db:
        first_flow_repo = FlowRepository(db, "workspace-one")
        second_flow_repo = FlowRepository(db, "workspace-two")
        first_flow_repo.save(build_demo_flow().model_copy(update={"name": "First workspace"}))
        second_flow_repo.save(build_demo_flow().model_copy(update={"name": "Second workspace"}))
        first_flow = first_flow_repo.publish("demo-commerce")
        second_flow = second_flow_repo.publish("demo-commerce")
        assert first_flow is not None
        assert second_flow is not None

        first_session = SessionRepository(db, "workspace-one").create(
            engine.create_session(first_flow),
            provider="generic",
            provider_call_id="shared-provider-id",
        )
        second_session = SessionRepository(db, "workspace-two").create(
            engine.create_session(second_flow),
            provider="generic",
            provider_call_id="shared-provider-id",
        )

    assert first_flow.name == "First workspace"
    assert second_flow.name == "Second workspace"
    assert first_flow.version == second_flow.version == 1
    assert first_session.id != second_session.id
