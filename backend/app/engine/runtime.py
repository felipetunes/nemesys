from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.models import (
    AiIntentConfig,
    CallSession,
    CollectInputConfig,
    DecisionConfig,
    FlowDefinition,
    FlowNode,
    MessageConfig,
    QueueConfig,
    SetVariableConfig,
    TraceEvent,
)
from app.services.intent_classifier import IntentClassifier


class FlowEngineError(RuntimeError):
    pass


class FlowEngine:
    def __init__(self, classifier: IntentClassifier | None = None):
        self.classifier = classifier or IntentClassifier()

    def create_session(self, flow: FlowDefinition, initial_variables: dict[str, Any] | None = None) -> CallSession:
        session = CallSession(
            id=str(uuid4()),
            flow_id=flow.id,
            flow_version=flow.version or 1,
            variables=initial_variables or {},
        )
        start = next((n for n in flow.nodes if n.type == "start"), None)
        if start is None:
            raise FlowEngineError("Flow has no start node")
        session.current_node_id = start.id
        self._event(session, "session_started", start.id, f"Session started on flow {flow.name}")
        self.run(flow, session)
        return session

    def submit_input(self, flow: FlowDefinition, session: CallSession, value: str) -> CallSession:
        if session.status != "waiting_input" or not session.pending_input_variable:
            raise FlowEngineError("Session is not waiting for input")
        variable = session.pending_input_variable
        session.variables[variable] = value
        session.pending_input_variable = None
        session.pending_input_prompt = None
        session.status = "running"
        self._event(
            session,
            "input_received",
            session.current_node_id,
            f"Input received for {variable}",
            {"variable": variable, "value_length": len(value)},
        )
        self._advance_unconditional(flow, session)
        self.run(flow, session)
        return session

    def connect_agent(self, flow: FlowDefinition, session: CallSession, agent_name: str) -> CallSession:
        if session.status != "queued" or not session.queue_name:
            raise FlowEngineError("Session is not waiting in an agent queue")
        wait_seconds = 0.0
        if session.queued_at is not None:
            wait_seconds = max((datetime.now(UTC) - session.queued_at).total_seconds(), 0)
        session.assigned_agent = agent_name
        session.variables["assigned_agent"] = agent_name
        session.status = "running"
        self._event(
            session,
            "agent_connected",
            session.current_node_id,
            f"Agent {agent_name} connected",
            {"agent_name": agent_name, "queue_name": session.queue_name, "wait_seconds": wait_seconds},
        )
        self._advance_unconditional(flow, session)
        self.run(flow, session)
        return session

    def run(self, flow: FlowDefinition, session: CallSession, max_steps: int = 50) -> None:
        node_map = {n.id: n for n in flow.nodes}
        for _ in range(max_steps):
            if session.status in ("waiting_input", "queued", "completed", "failed"):
                return
            node = node_map.get(session.current_node_id or "")
            if not node:
                self._fail(session, f"Node not found: {session.current_node_id}")
                return
            try:
                should_continue = self._execute_node(flow, session, node)
            except Exception as exc:
                self._fail(session, f"{type(exc).__name__}: {exc}")
                return
            if not should_continue:
                return
        self._fail(session, "Safety stop: maximum node execution count reached")

    def _execute_node(self, flow: FlowDefinition, session: CallSession, node: FlowNode) -> bool:
        self._event(session, "node_entered", node.id, f"Entered {node.label}", {"node_type": node.type})

        if node.type == "start":
            return self._advance_unconditional(flow, session)

        if node.type == "prompt":
            assert isinstance(node.config, MessageConfig)
            message = node.config.message
            session.last_prompt = message
            self._event(session, "prompt", node.id, message)
            return self._advance_unconditional(flow, session)

        if node.type == "collect_input":
            assert isinstance(node.config, CollectInputConfig)
            variable = node.config.variable
            prompt = node.config.prompt
            session.last_prompt = prompt
            session.pending_input_variable = variable
            session.pending_input_prompt = prompt
            session.status = "waiting_input"
            self._event(
                session,
                "input_requested",
                node.id,
                prompt,
                {"variable": variable, "input_mode": node.config.input_mode},
            )
            return False

        if node.type == "set_variable":
            assert isinstance(node.config, SetVariableConfig)
            variable = node.config.variable
            value = node.config.value
            session.variables[variable] = value
            self._event(session, "variable_set", node.id, f"{variable} updated", {"variable": variable, "value": value})
            return self._advance_unconditional(flow, session)

        if node.type == "ai_intent":
            assert isinstance(node.config, AiIntentConfig)
            source = node.config.source_variable
            result_var = node.config.result_variable
            intents = node.config.intents
            utterance = str(session.variables.get(source, ""))
            result = self.classifier.classify(utterance, intents)
            session.variables[result_var] = result.intent
            session.variables[f"{result_var}_confidence"] = result.confidence
            self._event(
                session,
                "ai_intent",
                node.id,
                f"Intent: {result.intent} ({result.confidence:.0%})",
                result.model_dump(),
            )
            return self._advance_by_condition(flow, session, result.intent)

        if node.type == "queue":
            assert isinstance(node.config, QueueConfig)
            session.queue_name = node.config.queue_name
            session.queued_at = datetime.now(UTC)
            session.last_prompt = node.config.message
            session.status = "queued"
            self._event(session, "prompt", node.id, node.config.message)
            self._event(
                session,
                "session_queued",
                node.id,
                f"Session entered queue {node.config.queue_name}",
                {"queue_name": node.config.queue_name},
            )
            return False

        if node.type == "decision":
            assert isinstance(node.config, DecisionConfig)
            variable = node.config.variable
            value = str(session.variables.get(variable, ""))
            self._event(
                session, "decision", node.id, f"Decision {variable}={value}", {"variable": variable, "value": value}
            )
            return self._advance_by_condition(flow, session, value)

        if node.type == "end":
            assert isinstance(node.config, MessageConfig)
            message = node.config.message
            if message:
                session.last_prompt = message
                self._event(session, "prompt", node.id, message)
            session.status = "completed"
            self._event(session, "session_completed", node.id, "Session completed")
            return False

        raise FlowEngineError(f"Unsupported node type: {node.type}")

    def _advance_unconditional(self, flow: FlowDefinition, session: CallSession) -> bool:
        outgoing = [e for e in flow.edges if e.source == session.current_node_id]
        edge = next((e for e in outgoing if e.condition is None), None)
        if edge is None and outgoing:
            edge = outgoing[0]
        if edge is None:
            self._fail(session, f"No outgoing edge from {session.current_node_id}")
            return False
        self._transition(session, edge.target, edge.id)
        return True

    def _advance_by_condition(self, flow: FlowDefinition, session: CallSession, condition: str) -> bool:
        outgoing = [e for e in flow.edges if e.source == session.current_node_id]
        edge = next((e for e in outgoing if e.condition == condition), None)
        if edge is None:
            edge = next((e for e in outgoing if e.condition == "fallback"), None)
        if edge is None:
            edge = next((e for e in outgoing if e.condition is None), None)
        if edge is None:
            self._fail(session, f"No route matched condition '{condition}'")
            return False
        self._transition(session, edge.target, edge.id)
        return True

    def _transition(self, session: CallSession, target: str, edge_id: str) -> None:
        previous = session.current_node_id
        session.current_node_id = target
        self._event(
            session,
            "transition",
            target,
            f"{previous} -> {target}",
            {"edge_id": edge_id, "from": previous, "to": target},
        )

    def _fail(self, session: CallSession, message: str) -> None:
        session.status = "failed"
        self._event(session, "error", session.current_node_id, message)

    @staticmethod
    def _event(
        session: CallSession,
        event_type: str,
        node_id: str | None,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        session.trace.append(
            TraceEvent(
                seq=len(session.trace) + 1,
                type=event_type,
                node_id=node_id,
                message=message,
                data=data or {},
            )
        )
