from functools import lru_cache

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


def _sqlite_engine_options(database_url: str) -> dict:
    if not database_url.startswith("sqlite"):
        return {}
    options: dict = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in database_url:
        options["poolclass"] = StaticPool
    return options


@lru_cache
def get_engine():
    settings = get_settings()
    options = _sqlite_engine_options(settings.database_url)
    return create_engine(settings.database_url, echo=False, **options)


def reset_engine_cache() -> None:
    get_engine.cache_clear()


def init_db() -> None:
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session
