"""DB Tools page route: Vue build first, legacy fallback.

/api/db-tools/main_page serves the built db_tools Vue page when the dist
output exists, falls back to the legacy template with its server-side
injections for checkouts without a build, and fails with the npm build hint
when neither file exists.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.db_tools as db_tools
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return db_tools.get_main_page(request=request, session=SESSION)

    app.get("/api/db-tools/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "db_tools" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "db_tools.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "db_tools.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "db_tools" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "db_tools.html" else tmp_path / "missing" / name)


def test_serves_built_vue_page(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "<html>vue db tools</html>", "<html>legacy</html>")

    resp = client.get("/api/db-tools/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue db tools" in resp.text


def test_falls_back_to_legacy_template_with_injections(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = (
        '<html><script>var API_BASE = "%%API_BASE%%"; var WS_BASE = "%%WS_BASE%%";'
        ' var TOKEN = "%%TOKEN%%";</script></html>'
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = client.get("/api/db-tools/main_page")

    assert resp.status_code == 200
    assert '"http://testserver/api/db-tools"' in resp.text
    assert 'ws://testserver' in resp.text
    assert '"tok-1"' in resp.text
    assert "%%" not in resp.text


def test_errors_clearly_when_no_build_and_no_legacy(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, None)

    resp = client.get("/api/db-tools/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
    assert "db_tools" in resp.text
