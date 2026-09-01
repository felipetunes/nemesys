from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Revelys"
    database_url: str = "sqlite:///./data/revelys.db"
    cors_origins: str = "http://localhost:5173"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-luna"
    twilio_auth_token: str | None = None
    twilio_validate_signatures: bool = False
    public_base_url: str = "http://localhost:8000"
    admin_api_key: str | None = None
    session_retention_days: int = 30
    auth_required: bool = False
    allow_registration: bool = False
    auth_session_days: int = 7
    telephony_workspace_id: str = "default"
    generic_webhook_secret: str | None = None

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
