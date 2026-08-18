"""Cluster Sync route: Vue build first with legacy fallback."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.cluster as cluster_api
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    """Expose the Cluster Sync page route with direct auth injection."""
    app = FastAPI()

    def main_page(request: Request):
        return cluster_api.get_main_page(request=request, session=SESSION)

    app.get("/api/cluster/main_page")(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, vue: str | None, legacy: str | None) -> None:
    """Patch shared Vue/legacy page locations."""
    vue_path = tmp_path / "missing" / "index.html"
    if vue is not None:
        vue_path = tmp_path / "dist" / "cluster_sync" / "index.html"
        vue_path.parent.mkdir(parents=True, exist_ok=True)
        vue_path.write_text(vue, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "cluster.html"
    if legacy is not None:
        legacy_path = tmp_path / "frontend" / "cluster.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_path if name == "cluster_sync" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "cluster.html" else tmp_path / "missing" / name)


def test_cluster_page_serves_vue_build(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The built Vue entry is preferred."""
    _set_files(monkeypatch, tmp_path, "<html>vue cluster</html>", "<html>legacy</html>")
    response = client.get("/api/cluster/main_page")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "vue cluster" in response.text


def test_cluster_page_falls_back_without_session_token(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Legacy placeholders retain same-origin cookie-only behavior."""
    legacy = '<html><script>var API_BASE="%%API_BASE%%";var WS_BASE="%%WS_BASE%%";</script></html>'
    _set_files(monkeypatch, tmp_path, None, legacy)
    response = client.get("/api/cluster/main_page")
    assert response.status_code == 200
    assert '"http://testserver/api/cluster"' in response.text
    assert '"ws://testserver"' in response.text
    assert "tok-1" not in response.text
    assert "%%" not in response.text


def test_cluster_page_reports_missing_build_and_fallback(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing artifacts return the standard build hint."""
    _set_files(monkeypatch, tmp_path, None, None)
    response = client.get("/api/cluster/main_page")
    assert response.status_code == 500
    assert "npm run build" in response.text
    assert "cluster_sync" in response.text
