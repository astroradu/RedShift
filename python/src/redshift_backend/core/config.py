import sys

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RedShift"
    version: str = "1.0.1-alpha"
    host: str = "127.0.0.1"
    port: int = 0
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_prefix="REDSHIFT_")

    @property
    def dev_mode(self) -> bool:
        return getattr(sys, "frozen", False) is False
