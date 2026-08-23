"""API Keys editor page route: Vue build first, legacy fallback with injections.

/api/api-keys/main_page (api/api_keys.py) serves the built Vue page
(frontend/src/pages/api_keys_editor) when the dist output exists and falls
back to the legacy frontend/api_keys_editor.html template with the
server-side placeholder injections (token, api base, version/serial, nav
hash) the static file always received. The legacy file stays as the fallback
for checkouts without a build.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.api_keys as api_keys
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def api_keys_client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return api_keys.get_main_page(request=request, session=SESSION)

    app.get("/api/api-keys/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    """Patch the auth path helpers used by serve_vue_or_legacy_page."""
    import api.auth as auth

    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "api_keys_editor" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "api_keys_editor.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "api_keys_editor.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "api_keys_editor" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "api_keys_editor.html" else tmp_path / "missing" / name)


def test_api_keys_page_serves_built_vue_page(
    api_keys_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "<html>vue api keys editor</html>", "<html>legacy</html>")

    resp = api_keys_client.get("/api/api-keys/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue api keys editor" in resp.text


def test_api_keys_page_falls_back_to_legacy_template_with_injections(
    api_keys_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = (
        "<html><script>\n"
        '  var TOKEN = "%%TOKEN%%";\n'
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var PBGUI_VERSION = "%%VERSION%%";\n'
        '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '  var NAV_HASH = "%%NAV_HASH%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = api_keys_client.get("/api/api-keys/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    # token is empty by design: browser auth uses the same-origin cookie
    assert 'var TOKEN = "";' in resp.text
    assert 'var API_BASE = "http://testserver/api/api-keys";' in resp.text
    assert "%%TOKEN%%" not in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "%%VERSION%%" not in resp.text
    assert "%%SERIAL%%" not in resp.text
    assert "%%NAV_HASH%%" not in resp.text
    # version/serial come from pbgui_purefunc, not the literal placeholders
    assert 'var PBGUI_VERSION = ""' not in resp.text


def test_api_keys_page_errors_clearly_when_no_build_and_no_legacy(
    api_keys_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, None)

    resp = api_keys_client.get("/api/api-keys/main_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "api_keys_editor" in resp.text
