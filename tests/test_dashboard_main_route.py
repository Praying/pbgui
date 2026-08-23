"""Dashboard main_page route: serves the built Vue page, fails loudly
without a build. The legacy template fallback was removed with the Vue
migration (D-editor-8); the page reads `current` from the URL query string,
the dashboards list from the API, and boot values from /api/boot.js."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Query, Request
from fastapi.testclient import TestClient

import api.dashboard as dashboard
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request, current: str = Query(default="")):
        return dashboard.get_main_page(request, current=current, session=SESSION)

    app.get("/api/dashboard/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def test_main_page_serves_built_vue_page(tmp_path: Path, client: TestClient, monkeypatch) -> None:
    vue_index = tmp_path / "index.html"
    vue_index.write_text("<html>vue build</html>", encoding="utf-8")
    monkeypatch.setattr(dashboard, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/api/dashboard/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue build" in resp.text


def test_main_page_errors_clearly_when_no_build_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    # A leftover legacy template must NOT satisfy the route: the Vue bundle
    # is the only dashboard main page now (mirrors services.py get_main_page).
    legacy = tmp_path / "dashboard_main.html"
    legacy.write_text("<html>legacy main</html>", encoding="utf-8")
    monkeypatch.setattr(dashboard, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")

    resp = client.get("/api/dashboard/main_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "legacy main" not in resp.text
