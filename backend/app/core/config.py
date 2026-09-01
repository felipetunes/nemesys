from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nemesys"
    database_url: str = "sqlite:///./data/nemesys.db"
    cors_origins: str = "http://localhost:5173"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-luna"
    twilio_auth_token: str | None = None
    twilio_validate_signatures: bool = False
    public_base_url: str = "http://localhost:8000"
    admin_api_key: str | None = None
    session_retention_days: int = Field(default=30, ge=1)
    auth_required: bool = False
    allow_registration: bool = False
    auth_session_days: int = Field(default=7, ge=1)
    auth_max_failed_attempts: int = Field(default=5, ge=1, le=100)
    auth_lockout_minutes: int = Field(default=15, ge=1)
    telephony_workspace_id: str = "default"
    generic_webhook_secret: str | None = None
    generic_webhook_tolerance_seconds: int = Field(default=300, ge=30, le=3600)

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
