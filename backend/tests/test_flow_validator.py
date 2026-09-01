import pytest
from pydantic import ValidationError

from app.demo_flow import build_demo_flow
from app.models import FlowDefinition, FlowEdge, FlowNode
from app.services.flow_validator import validate_flow


def test_demo_flow_is_valid():
    result = validate_flow(build_demo_flow())
    assert result.valid
    assert result.errors == []


def test_missing_edge_is_rejected():
    flow = build_demo_flow()
    flow.edges = [e for e in flow.edges if e.source != "welcome"]
    result = validate_flow(flow)
    assert not result.valid
    assert any(issue.code == "dead_end" and issue.node_id == "welcome" for issue in result.errors)


def test_unreachable_node_warns():
    flow = build_demo_flow()
    flow.nodes.append(flow.nodes[-1].model_copy(update={"id": "orphan", "label": "Orphan"}))
    result = validate_flow(flow)
    assert result.valid
    assert any(issue.code == "unreachable_node" and issue.node_id == "orphan" for issue in result.warnings)


def test_node_configuration_is_validated_at_the_boundary():
    with pytest.raises(ValidationError):
        FlowNode(id="set", type="set_variable", label="Invalid", config={})


def test_duplicate_default_routes_are_rejected():
    flow = FlowDefinition(
        id="ambiguous",
        name="Ambiguous",
        nodes=[
            FlowNode(id="start", type="start", label="Start", config={}),
            FlowNode(id="end-a", type="end", label="End A", config={"message": "A"}),
            FlowNode(id="end-b", type="end", label="End B", config={"message": "B"}),
        ],
        edges=[
            FlowEdge(id="e1", source="start", target="end-a"),
            FlowEdge(id="e2", source="start", target="end-b"),
        ],
    )

    result = validate_flow(flow)

    assert not result.valid
    assert any(issue.code == "default_route_count" and issue.node_id == "start" for issue in result.errors)


def test_non_terminating_subgraph_is_rejected():
    flow = FlowDefinition(
        id="cycle",
        name="Cycle",
        nodes=[
            FlowNode(id="start", type="start", label="Start", config={}),
            FlowNode(id="loop", type="prompt", label="Loop", config={"message": "Again"}),
            FlowNode(id="end", type="end", label="End", config={"message": "Done"}),
        ],
        edges=[
            FlowEdge(id="e1", source="start", target="loop"),
            FlowEdge(id="e2", source="loop", target="loop"),
        ],
    )

    result = validate_flow(flow)

    assert not result.valid
    assert any(issue.code == "no_terminal_path" and issue.node_id == "loop" for issue in result.errors)
