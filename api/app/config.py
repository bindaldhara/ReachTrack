from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: str = "8080"
    database_url: str
    supabase_url: str
    cors_origin: str = "http://localhost:5173"

    google_client_id: str = ""
    google_client_secret: str = ""
    gmail_redirect_uri: str = (
        "http://localhost:8080/api/v1/integrations/gmail/callback"
    )
    web_app_url: str = "http://localhost:5173"
    oauth_state_secret: str = ""
    follow_up_due_days: int = 1
    gmail_sync_timeout_seconds: int = 600
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def gmail_configured(self) -> bool:
        return bool(
            self.google_client_id.strip()
            and self.google_client_secret.strip()
            and self.gmail_redirect_uri.strip()
        )

    @property
    def state_secret(self) -> str:
        secret = self.oauth_state_secret.strip()
        if secret:
            return secret
        return self.google_client_secret.strip()

    @property
    def web_app_base(self) -> str:
        web = self.web_app_url.strip().rstrip("/")
        return web or "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.database_url:
        raise ValueError("DATABASE_URL is required")
    if not settings.supabase_url.strip():
        raise ValueError("SUPABASE_URL is required")
    return settings
