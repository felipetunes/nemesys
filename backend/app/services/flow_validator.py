from collections import deque

from pydantic import BaseModel, Field

from app.models import AiIntentConfig, FlowDefinition, FlowEdge


class ValidationIssue(BaseModel):
    level: str
    code: str
    message: str
    node_id: str | None = None
    edge_id: str | None = None


class FlowValidationResult(BaseModel):
    valid: bool
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)


def validate_flow(flow: FlowDefinition) -> FlowValidationResult:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []
    node_ids = [n.id for n in flow.nodes]
    edge_ids = [e.id for e in flow.edges]
    node_set = set(node_ids)

    if len(node_ids) != len(node_set):
        errors.append(ValidationIssue(level="error", code="duplicate_node_id", message="Node IDs must be unique."))
    if len(edge_ids) != len(set(edge_ids)):
        errors.append(ValidationIssue(level="error", code="duplicate_edge_id", message="Edge IDs must be unique."))

    starts = [n for n in flow.nodes if n.type == "start"]
    if len(starts) != 1:
        errors.append(
            ValidationIssue(
                level="error",
                code="start_count",
                message=f"Flow must contain exactly one start node; found {len(starts)}.",
            )
        )
    ends = [n for n in flow.nodes if n.type == "end"]
    if not ends:
        errors.append(
            ValidationIssue(level="error", code="end_count", message="Flow must contain at least one end node.")
        )

    for edge in flow.edges:
        if edge.source not in node_set:
            errors.append(
                ValidationIssue(
                    level="error",
                    code="missing_edge_source",
                    message=f"Edge source '{edge.source}' does not exist.",
                    edge_id=edge.id,
                )
            )
        if edge.target not in node_set:
            errors.append(
                ValidationIssue(
                    level="error",
                    code="missing_edge_target",
                    message=f"Edge target '{edge.target}' does not exist.",
                    edge_id=edge.id,
                )
            )

    outgoing: dict[str, list[FlowEdge]] = {node_id: [] for node_id in node_set}
    incoming: dict[str, list[FlowEdge]] = {node_id: [] for node_id in node_set}
    for edge in flow.edges:
        if edge.source in outgoing:
            outgoing[edge.source].append(edge)
        if edge.target in incoming:
            incoming[edge.target].append(edge)

    for node in flow.nodes:
        node_edges = outgoing.get(node.id, [])
        if node.type != "end" and not node_edges:
            errors.append(
                ValidationIssue(
                    level="error",
                    code="dead_end",
                    message=f"Node '{node.label}' has no outgoing edge.",
                    node_id=node.id,
                )
            )
            continue
        if node.type == "end" and node_edges:
            errors.append(
                ValidationIssue(
                    level="error",
                    code="end_has_edges",
                    message=f"End node '{node.label}' cannot have outgoing edges.",
                    node_id=node.id,
                )
            )
            continue

        if node.type in {"start", "prompt", "collect_input", "set_variable", "queue"}:
            default_edges = [edge for edge in node_edges if edge.condition is None]
            if len(default_edges) != 1:
                errors.append(
                    ValidationIssue(
                        level="error",
                        code="default_route_count",
                        message=f"Node '{node.label}' must have exactly one unconditional outgoing edge; found {len(default_edges)}.",
                        node_id=node.id,
                    )
                )
            for edge in node_edges:
                if edge.condition is not None:
                    errors.append(
                        ValidationIssue(
                            level="error",
                            code="unexpected_condition",
                            message=f"Node '{node.label}' does not support conditional outgoing edges.",
                            node_id=node.id,
                            edge_id=edge.id,
                        )
                    )

        if node.type in {"ai_intent", "decision"}:
            conditions = [edge.condition for edge in node_edges if edge.condition is not None]
            duplicates = sorted({condition for condition in conditions if conditions.count(condition) > 1})
            for condition in duplicates:
                errors.append(
                    ValidationIssue(
                        level="error",
                        code="duplicate_condition",
                        message=f"Node '{node.label}' has more than one route for condition '{condition}'.",
                        node_id=node.id,
                    )
                )
            default_edges = [edge for edge in node_edges if edge.condition is None]
            if len(default_edges) > 1:
                errors.append(
                    ValidationIssue(
                        level="error",
                        code="default_route_count",
                        message=f"Node '{node.label}' can have at most one unconditional outgoing edge.",
                        node_id=node.id,
                    )
                )

        if node.type == "ai_intent":
            assert isinstance(node.config, AiIntentConfig)
            intents = set(node.config.intents)
            routed_conditions = {edge.condition for edge in node_edges if edge.condition}
            has_default = any(edge.condition in {None, "fallback"} for edge in node_edges)
            for intent in sorted(intents - routed_conditions):
                if has_default:
                    continue
                warnings.append(
                    ValidationIssue(
                        level="warning",
                        code="missing_intent_route",
                        message=f"Intent '{intent}' has no explicit outgoing route.",
                        node_id=node.id,
                    )
                )

    if len(starts) == 1:
        seen = {starts[0].id}
        queue = deque([starts[0].id])
        while queue:
            current = queue.popleft()
            for edge in outgoing.get(current, []):
                if edge.target in node_set and edge.target not in seen:
                    seen.add(edge.target)
                    queue.append(edge.target)
        for node in flow.nodes:
            if node.id not in seen:
                warnings.append(
                    ValidationIssue(
                        level="warning",
                        code="unreachable_node",
                        message=f"Node '{node.label}' is unreachable from Start.",
                        node_id=node.id,
                    )
                )

        if ends:
            reaches_end = {node.id for node in ends}
            reverse_queue = deque(reaches_end)
            while reverse_queue:
                current = reverse_queue.popleft()
                for edge in incoming.get(current, []):
                    if edge.source in node_set and edge.source not in reaches_end:
                        reaches_end.add(edge.source)
                        reverse_queue.append(edge.source)
            for node in flow.nodes:
                if node.id in seen and node.id not in reaches_end:
                    errors.append(
                        ValidationIssue(
                            level="error",
                            code="no_terminal_path",
                            message=f"Node '{node.label}' has no path to an end node.",
                            node_id=node.id,
                        )
                    )

    return FlowValidationResult(valid=not errors, errors=errors, warnings=warnings)
