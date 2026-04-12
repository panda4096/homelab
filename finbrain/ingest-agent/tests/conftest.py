import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import reset_settings_cache
from app.db import init_db, reset_engine_cache


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "finbrain-test.db"
    monkeypatch.setenv("FINBRAIN_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("FINBRAIN_BASE_PATH", "")
    reset_settings_cache()
    reset_engine_cache()
    init_db()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

    reset_settings_cache()
    reset_engine_cache()
