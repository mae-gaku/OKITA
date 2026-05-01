import os
from functools import lru_cache
from pathlib import Path


@lru_cache
def _load_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_env()


class Settings:
    secret_key: str = os.environ.get("SECRET_KEY", "dev-insecure-key")
    database_url: str = os.environ.get("DATABASE_URL", "sqlite:///./okita.db")
    access_token_expire_minutes: int = int(
        os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "43200")
    )
    expo_push_url: str = os.environ.get(
        "EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send"
    )
    algorithm: str = "HS256"
    env: str = os.environ.get("OKITA_ENV", "development")
    invite_base_url: str = os.environ.get("INVITE_BASE_URL", "https://okita.app")

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"


settings = Settings()
