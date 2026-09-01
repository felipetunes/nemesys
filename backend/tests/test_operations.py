from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.demo_flow import build_demo_flow
from app.engine.runtime import FlowEngine
from app.models import SessionRow
from app.services.flow_repository import FlowRepository
from app.services.metrics import MetricsService
from app.services.retention import RetentionService
from app.services.session_repository import SessionRepository


def test_retention_prunes_only_old_terminal_sessions(db_factory):
    engine = FlowEngine()
    with db_factory() as db:
        flow_repo = FlowRepository(db)
        flow_repo.save(build_demo_flow())
        flow = flow_repo.publish("demo-commerce")
        assert flow is not None
        session_repo = SessionRepository(db)

        terminal = session_repo.create(engine.create_session(flow))
        engine.submit_input(flow, terminal, "1")
        terminal = session_repo.save(terminal, expected_revision=terminal.revision)
        active = session_repo.create(engine.create_session(flow))

        old = datetime.now(UTC) - timedelta(days=60)
        db.execute(update(SessionRow).where(SessionRow.id.in_((terminal.id, active.id))).values(updated_at=old))
        db.commit()

        result = RetentionService(db).prune_terminal_sessions(30)

        assert result.deleted_sessions == 1
        assert session_repo.get(terminal.id) is None
        assert session_repo.get(active.id) is not None


def test_metrics_are_derived_from_persisted_sessions(db_factory):
    engine = FlowEngine()
    with db_factory() as db:
        flow_repo = FlowRepository(db)
        flow_repo.save(build_demo_flow())
        flow = flow_repo.publish("demo-commerce")
        assert flow is not None
        session_repo = SessionRepository(db)

        completed = session_repo.create(engine.create_session(flow, {"channel": "voice"}))
        engine.submit_input(flow, completed, "2")
        session_repo.save(completed, expected_revision=completed.revision)
        session_repo.create(engine.create_session(flow))

        summary = MetricsService(db).summary()

    assert summary.total_sessions == 2
    assert summary.sessions_last_24h == 2
    assert summary.status_counts == {"completed": 1, "waiting_input": 1}
    assert summary.intent_counts == {"cancellation": 1}
    assert summary.channel_counts == {"voice": 1, "browser": 1}
    assert summary.completion_rate == 0.5
