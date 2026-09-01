from app.demo_flow import build_demo_flow
from app.engine.runtime import FlowEngine
from app.models import IntentResult


class FakeClassifier:
    def __init__(self, intent: str):
        self.intent = intent

    def classify(self, utterance: str, intents: list[str]) -> IntentResult:
        assert utterance
        assert self.intent in intents
        return IntentResult(intent=self.intent, confidence=0.99, reason="test", provider="fake")


def test_flow_waits_for_input_and_completes():
    flow = build_demo_flow()
    engine = FlowEngine(classifier=FakeClassifier("order_status"))
    session = engine.create_session(flow)
    assert session.status == "waiting_input"
    assert session.pending_input_variable == "customer_reason"
    assert "motivo" in (session.pending_input_prompt or "").lower()

    engine.submit_input(flow, session, "quero saber do meu pedido")

    assert session.status == "completed"
    assert session.variables["intent"] == "order_status"
    assert any(e.type == "ai_intent" for e in session.trace)
    assert any("validar" in e.message.lower() for e in session.trace if e.type == "prompt")
    input_event = next(e for e in session.trace if e.type == "input_received")
    assert "value" not in input_event.data
    assert input_event.data["value_length"] == len("quero saber do meu pedido")


def test_fallback_route():
    flow = build_demo_flow()
    engine = FlowEngine(classifier=FakeClassifier("fallback"))
    session = engine.create_session(flow)
    engine.submit_input(flow, session, "banana")
    assert session.status == "completed"
    assert any("não consegui identificar" in e.message.lower() for e in session.trace if e.type == "prompt")
