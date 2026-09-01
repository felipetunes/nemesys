from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

NodeType = Literal["start", "prompt", "collect_input", "ai_intent", "decision", "set_variable", "end"]
VariableName = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")]
FlowIdentifier = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]


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


NodeConfig = StartConfig | MessageConfig | CollectInputConfig | AiIntentConfig | DecisionConfig | SetVariableConfig
NODE_CONFIG_MODELS: dict[str, type[StrictModel]] = {
    "start": StartConfig,
    "prompt": MessageConfig,
    "collect_input": CollectInputConfig,
    "ai_intent": AiIntentConfig,
    "decision": DecisionConfig,
    "set_variable": SetVariableConfig,
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


class FlowRow(Base):
    __tablename__ = "flows"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    definition_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class FlowVersionRow(Base):
    __tablename__ = "flow_versions"
    flow_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    definition_json: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


SessionStatus = Literal["running", "waiting_input", "completed", "failed"]


class TraceEvent(StrictModel):
    seq: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    type: str
    node_id: str | None = None
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


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


class SessionCreate(StrictModel):
    flow_id: FlowIdentifier
    flow_version: int | None = Field(default=None, ge=1)
    initial_variables: dict[str, Any] = Field(default_factory=dict)


class SessionInput(StrictModel):
    value: str = Field(min_length=1, max_length=2000)


class IntentResult(StrictModel):
    intent: str
    confidence: float = Field(ge=0, le=1)
    reason: str = ""
    provider: str


class SessionRow(Base):
    __tablename__ = "sessions"
    __table_args__ = (UniqueConstraint("provider", "provider_call_id", name="uq_session_provider_call"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    flow_id: Mapped[str] = mapped_column(String(120), index=True)
    flow_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), index=True)
    session_json: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_call_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
