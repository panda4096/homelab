from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FINBRAIN_",
        case_sensitive=False,
        extra="ignore",
    )

    env: str = "development"
    base_path: str = ""
    timezone: str = "Asia/Shanghai"
    database_url: str = "sqlite:///./finbrain.db"
    firefly_base_url: str = "http://localhost:8080"
    ghostfolio_base_url: str = "http://localhost:3333"
    firefly_token: str | None = None
    ghostfolio_token: str | None = None
    fx_base_currency: str = "HKD"
    uploads_dir: str = "./uploads"

    @property
    def normalized_base_path(self) -> str:
        if not self.base_path:
            return ""
        if self.base_path == "/":
            return ""
        return "/" + self.base_path.strip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
