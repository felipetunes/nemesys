from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

NodeType = Literal[
    "start",
    "prompt",
    "collect_input",
    "ai_intent",
    "decision",
    "set_variable",
    "set_outcome",
    "queue",
    "end",
]
VariableName = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")]
FlowIdentifier = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]
WorkspaceRole = Literal["viewer", "editor", "admin", "owner"]
SupportedLanguage = Literal["pt-BR", "en-US"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartConfig(StrictModel):
    pass


class MessageConfig(StrictModel):
    message: str = Field(min_length=1, max_length=4000)


class CollectInputConfig(StrictModel):
    prompt: str = Field(min_length=1, max_length=4000)
    variable: VariableName
    input_mode: Literal["text", "speech", "dtmf", "speech_or_dtmf"] = "text"


class AiIntentConfig(StrictModel):
    source_variable: VariableName
    result_variable: VariableName
    intents: list[str] = Field(min_length=1, max_length=100)

    @field_validator("intents")
    @classmethod
    def validate_intents(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value for value in normalized):
            raise ValueError("Intent names cannot be empty")
        if len(normalized) != len(set(normalized)):
            raise ValueError("Intent names must be unique")
        return normalized


class DecisionConfig(StrictModel):
    variable: VariableName


class SetVariableConfig(StrictModel):
    variable: VariableName
    value: Any


class FlowOutcomeConfig(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    result: Literal["success", "failure"] = "success"


class QueueConfig(StrictModel):
    queue_name: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=4000)


NodeConfig = (
    StartConfig
    | MessageConfig
    | CollectInputConfig
    | AiIntentConfig
    | DecisionConfig
    | SetVariableConfig
    | FlowOutcomeConfig
    | QueueConfig
)
NODE_CONFIG_MODELS: dict[str, type[StrictModel]] = {
    "start": StartConfig,
    "prompt": MessageConfig,
    "collect_input": CollectInputConfig,
    "ai_intent": AiIntentConfig,
    "decision": DecisionConfig,
    "set_variable": SetVariableConfig,
    "set_outcome": FlowOutcomeConfig,
    "queue": QueueConfig,
    "end": MessageConfig,
}


class FlowNode(StrictModel):
    id: str
    type: NodeType
    label: str
    x: float = 0
    y: float = 0
    config: NodeConfig

    @model_validator(mode="before")
    @classmethod
    def parse_typed_config(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        node_type = value.get("type")
        config_model = NODE_CONFIG_MODELS.get(str(node_type))
        if config_model is None:
            return value
        parsed = dict(value)
        parsed["config"] = config_model.model_validate(parsed.get("config", {}))
        return parsed


class FlowEdge(StrictModel):
    id: str
    source: str
    target: str
    condition: str | None = None
    label: str | None = None

    @field_validator("condition", "label")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class FlowDefinition(StrictModel):
    id: FlowIdentifier
    name: str
    description: str = ""
    nodes: list[FlowNode]
    edges: list[FlowEdge]
    version: int | None = Field(default=None, ge=1)
    published_at: datetime | None = None
    updated_at: datetime | None = None
    archived_at: datetime | None = None


class FlowDuplicateRequest(StrictModel):
    id: FlowIdentifier
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Flow name must contain at least two visible characters")
        return normalized


class FlowRow(Base):
    __tablename__ = "flows"
    workspace_id: Mapped[str] = mapped_column(String(36), primary_key=True, default="default", index=True)
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    definition_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FlowVersionRow(Base):
    __tablename__ = "flow_versions"
    workspace_id: Mapped[str] = mapped_column(String(36), primary_key=True, default="default", index=True)
    flow_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    definition_json: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


SessionStatus = Literal["running", "waiting_input", "queued", "wrap_up", "completed", "failed"]
WrapUpCode = Literal["resolved", "transferred", "callback_requested", "no_response", "other"]
AgentPresence = Literal["offline", "available", "away", "busy", "on_queue"]
AgentRoutingStatus = Literal["off_queue", "idle", "interacting", "not_responding"]


class TraceEvent(StrictModel):
    seq: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    type: str
    node_id: str | None = None
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class FlowOutcome(StrictModel):
    name: str
    result: Literal["success", "failure"]
    achieved_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CallSession(StrictModel):
    id: str
    flow_id: str
    flow_version: int = Field(ge=1)
    revision: int = Field(default=0, ge=0)
    status: SessionStatus = "running"
    current_node_id: str | None = None
    variables: dict[str, Any] = Field(default_factory=dict)
    trace: list[TraceEvent] = Field(default_factory=list)
    pending_input_variable: str | None = None
    pending_input_prompt: str | None = None
    last_prompt: str | None = None
    queue_name: str | None = None
    queued_at: datetime | None = None
    assigned_agent: str | None = None
    outcomes: list[FlowOutcome] = Field(default_factory=list)
    wrap_up_code: WrapUpCode | None = None
    wrap_up_notes: str | None = None
    wrapped_up_at: datetime | None = None


class SessionCreate(StrictModel):
    flow_id: FlowIdentifier
    flow_version: int | None = Field(default=None, ge=1)
    initial_variables: dict[str, Any] = Field(default_factory=dict)


class SessionInput(StrictModel):
    value: str = Field(min_length=1, max_length=2000)


class QueueClaim(StrictModel):
    agent_name: str = Field(min_length=1, max_length=120)

    @field_validator("agent_name")
    @classmethod
    def normalize_agent_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Agent name cannot be empty")
        return normalized


class QueueWrapUp(StrictModel):
    code: WrapUpCode
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class AgentPresenceUpdate(StrictModel):
    presence: AgentPresence


class AgentState(StrictModel):
    agent_name: str
    presence: AgentPresence
    routing_status: AgentRoutingStatus
    updated_at: datetime


class IntentResult(StrictModel):
    intent: str
    confidence: float = Field(ge=0, le=1)
    reason: str = ""
    provider: str


class MetricsSummary(StrictModel):
    total_sessions: int
    sessions_last_24h: int
    status_counts: dict[str, int]
    intent_counts: dict[str, int]
    channel_counts: dict[str, int]
    outcome_counts: dict[str, int]
    wrap_up_counts: dict[str, int]
    completion_rate: float = Field(ge=0, le=1)
    average_duration_seconds: float


class RetentionResult(StrictModel):
    retention_days: int
    cutoff: datetime
    deleted_sessions: int


class RegisterRequest(StrictModel):
    email: str = Field(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=200)
    workspace_name: str = Field(min_length=2, max_length=120)
    language: SupportedLanguage = "pt-BR"


class LoginRequest(StrictModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class WorkspaceInfo(StrictModel):
    id: str
    name: str
    role: WorkspaceRole


class WorkspaceMember(StrictModel):
    user_id: str
    email: str
    role: WorkspaceRole
    active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class WorkspaceMemberCreate(StrictModel):
    email: str = Field(min_length=5, max_length=320)
    role: WorkspaceRole = "viewer"


class WorkspaceUserCreate(StrictModel):
    email: str = Field(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=200)
    role: WorkspaceRole = "editor"


class WorkspaceMemberRoleUpdate(StrictModel):
    role: WorkspaceRole


class WorkspaceMemberStatusUpdate(StrictModel):
    active: bool


class AuthTokenResponse(StrictModel):
    token: str
    expires_at: datetime
    user_id: str
    email: str
    language: SupportedLanguage
    workspaces: list[WorkspaceInfo]


class AuthMe(StrictModel):
    user_id: str
    email: str
    language: SupportedLanguage
    active_workspace_id: str
    workspaces: list[WorkspaceInfo]


class UserProfileUpdate(StrictModel):
    language: SupportedLanguage


class WorkspaceRow(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class UserRow(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("language IN ('pt-BR', 'en-US')", name="ck_users_language"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(10), default="pt-BR")
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class WorkspaceMembershipRow(Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (
        CheckConstraint("role IN ('viewer', 'editor', 'admin', 'owner')", name="ck_membership_role"),
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(30), default="owner")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthSessionRow(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class SessionRow(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "provider",
            "provider_call_id",
            name="uq_session_workspace_provider_call",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(36), default="default", index=True)
    flow_id: Mapped[str] = mapped_column(String(120), index=True)
    flow_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), index=True)
    session_json: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_call_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    assigned_agent: Mapped[str | None] = mapped_column(String(120), nullable=True)
    wrap_up_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class AgentStateRow(Base):
    __tablename__ = "agent_states"

    workspace_id: Mapped[str] = mapped_column(String(36), primary_key=True, default="default")
    agent_name: Mapped[str] = mapped_column(String(120), primary_key=True)
    presence: Mapped[str] = mapped_column(String(30), default="offline")
    routing_status: Mapped[str] = mapped_column(String(30), default="off_queue")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class AuditEvent(StrictModel):
    id: str
    workspace_id: str
    actor: str
    action: str
    resource_type: str
    resource_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AuditEventRow(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(36), index=True)
    actor: Mapped[str] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(120), index=True)
    resource_type: Mapped[str] = mapped_column(String(120))
    resource_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
