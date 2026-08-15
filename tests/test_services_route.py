"""Services main_page route: serves the built Vue page, fails loudly without a build."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.services as services
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return services.get_main_page(session=SESSION)

    app.get("/api/services/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def test_main_page_serves_built_vue_page(tmp_path: Path, client: TestClient, monkeypatch) -> None:
    vue_index = tmp_path / "index.html"
    vue_index.write_text("<html>vue build</html>", encoding="utf-8")
    monkeypatch.setattr(services, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/api/services/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue build" in resp.text


def test_main_page_errors_clearly_when_no_frontend_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(services, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")

    resp = client.get("/api/services/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
