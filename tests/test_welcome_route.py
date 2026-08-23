"""Welcome page route: Vue build first, legacy fallback with injections.

/api/auth/main_page (api/auth.py) serves the built Vue page
(frontend/src/pages/welcome) when the dist output exists and falls back to
the legacy frontend/welcome.html template with the server-side placeholder
injections (token, origin, version/serial, nav hash) the static file always
received. The Referrer-Policy header and the session cookie are set on both
branches, as before the migration.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def welcome_client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return auth.main_page(request=request, session=SESSION)

    app.get("/api/auth/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "welcome" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "welcome.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "welcome.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "welcome" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "welcome.html" else tmp_path / "missing" / name)


def test_welcome_serves_built_vue_page(
    welcome_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "<html>vue welcome</html>", "<html>legacy</html>")

    resp = welcome_client.get("/api/auth/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert resp.headers["referrer-policy"] == "no-referrer"
    assert "vue welcome" in resp.text
    # the session cookie is set on the Vue branch too
    assert "set-cookie" in resp.headers


def test_welcome_falls_back_to_legacy_template_with_injections(
    welcome_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = (
        "<html><script>\n"
        '  var TOKEN = "%%TOKEN%%";\n'
        '  var API_ORIGIN = "%%API_ORIGIN%%";\n'
        '  var PBGUI_VERSION = "%%VERSION%%";\n'
        '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '  var NAV_HASH = "%%NAV_HASH%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = welcome_client.get("/api/auth/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert resp.headers["referrer-policy"] == "no-referrer"
    assert 'var TOKEN = "tok-1";' in resp.text
    assert 'var API_ORIGIN = "http://testserver";' in resp.text
    assert "%%TOKEN%%" not in resp.text
    assert "%%API_ORIGIN%%" not in resp.text
    assert "%%VERSION%%" not in resp.text
    assert "%%SERIAL%%" not in resp.text
    assert "%%NAV_HASH%%" not in resp.text
    # version/serial come from pbgui_purefunc, not the literal placeholders
    assert 'var PBGUI_VERSION = ""' not in resp.text
    # the session cookie is still set on the fallback branch
    assert "set-cookie" in resp.headers


def test_welcome_errors_clearly_when_no_build_and_no_legacy(
    welcome_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, None)

    resp = welcome_client.get("/api/auth/main_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "welcome" in resp.text
