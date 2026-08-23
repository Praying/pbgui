"""Shared Jobs Monitor route: Vue build first with legacy fallback."""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth
import api.jobs as jobs_api
from api.auth import SessionToken, require_auth

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    """Expose the real jobs router with authentication overridden."""
    app = FastAPI()
    app.include_router(jobs_api.router, prefix="/api/jobs")
    app.dependency_overrides[require_auth] = lambda: SESSION
    return TestClient(app, raise_server_exceptions=False)


def _set_files(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, vue: str | None, legacy: str | None) -> None:
    """Patch the shared Vue/legacy page locations."""
    vue_path = tmp_path / "missing" / "index.html"
    if vue is not None:
        vue_path = tmp_path / "dist" / "jobs_monitor" / "index.html"
        vue_path.parent.mkdir(parents=True, exist_ok=True)
        vue_path.write_text(vue, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "jobs_monitor.html"
    if legacy is not None:
        legacy_path = tmp_path / "frontend" / "jobs_monitor.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_path if name == "jobs_monitor" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "jobs_monitor.html" else tmp_path / "missing" / name)


def test_jobs_page_serves_vue_build(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The named main-page route wins over the dynamic job-id route."""
    _set_files(monkeypatch, tmp_path, "<html>vue jobs monitor</html>", "<html>legacy</html>")
    response = client.get("/api/jobs/main_page")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "vue jobs monitor" in response.text


def test_jobs_page_falls_back_without_exposing_session_token(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The fallback stays cookie-only and receives the same-origin API base."""
    legacy = '<html><script>var API_BASE="%%API_BASE%%";</script></html>'
    _set_files(monkeypatch, tmp_path, None, legacy)
    response = client.get("/api/jobs/main_page")
    assert response.status_code == 200
    assert '"http://testserver/api"' in response.text
    assert "%%API_BASE%%" not in response.text
    assert "tok-1" not in response.text


def test_jobs_page_reports_missing_build_and_fallback(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing frontend artifacts return the standard build hint."""
    _set_files(monkeypatch, tmp_path, None, None)
    response = client.get("/api/jobs/main_page")
    assert response.status_code == 500
    assert "pnpm run build" in response.text
    assert "jobs_monitor" in response.text
