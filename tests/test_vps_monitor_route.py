"""VPS Monitor route: Vue build first with the cookie-only legacy fallback."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.vps as vps_api
from api.auth import SessionToken, require_auth

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    """Expose the VPS main-page route with authentication overridden."""
    app = FastAPI()

    def main_page(request: Request):
        return vps_api.get_main_page(request=request, session=SESSION)

    app.get("/api/vps/main_page")(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, vue: str | None, legacy: str | None) -> None:
    """Patch the shared Vue/legacy page locations."""
    vue_path = tmp_path / "missing" / "index.html"
    if vue is not None:
        vue_path = tmp_path / "dist" / "vps_monitor" / "index.html"
        vue_path.parent.mkdir(parents=True, exist_ok=True)
        vue_path.write_text(vue, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "vps_monitor.html"
    if legacy is not None:
        legacy_path = tmp_path / "frontend" / "vps_monitor.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_path if name == "vps_monitor" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "vps_monitor.html" else tmp_path / "missing" / name)


def test_vps_page_serves_vue_build(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The built Vue entry is preferred."""
    _set_files(monkeypatch, tmp_path, "<html>vue vps monitor</html>", "<html>legacy</html>")
    response = client.get("/api/vps/main_page")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "vue vps monitor" in response.text


def test_vps_page_falls_back_without_session_fields(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Legacy placeholders are filled without exposing the session token."""
    legacy = '<html><script>var WS_BASE="%%WS_BASE%%";var VERSION="%%VERSION%%";var SERIAL="%%SERIAL%%";</script></html>'
    _set_files(monkeypatch, tmp_path, None, legacy)
    response = client.get("/api/vps/main_page")
    assert response.status_code == 200
    assert "ws://testserver" in response.text
    assert "%%" not in response.text
    assert "tok-1" not in response.text


def test_vps_page_reports_missing_build_and_fallback(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing artifacts return the standard build hint."""
    _set_files(monkeypatch, tmp_path, None, None)
    response = client.get("/api/vps/main_page")
    assert response.status_code == 500
    assert "pnpm run build" in response.text
    assert "vps_monitor" in response.text
