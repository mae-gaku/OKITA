from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text

from .config import settings

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)


def _ensure_user_columns() -> None:
    """SQLite 既存 DB に追加カラムが無ければ補う。SQLite 限定の軽量マイグレ。"""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        tables = {row[0] for row in conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all()}
        if "user" not in tables:
            return
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").all()}
        if "plan" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE user ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'"
            )
        if "last_family_escalated_date" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE user ADD COLUMN last_family_escalated_date DATE"
            )
        if "referral_code" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE user ADD COLUMN referral_code TEXT"
            )
            # ALTER TABLE では UNIQUE INDEX を後付けする必要がある
            conn.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_referral_code "
                "ON user(referral_code) WHERE referral_code IS NOT NULL"
            )


def init_db() -> None:
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_user_columns()


def get_session():
    with Session(engine) as session:
        yield session
