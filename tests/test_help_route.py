"""Help page route: Vue build first, legacy fallback with injections.

/api/help/main_page (PBApiServer.py, next to the /api/help/* endpoints)
serves the built Vue page (frontend/src/pages/help) when the dist output
exists and falls back to the legacy frontend/help.html template. Until this
route existed the page was served as a static file at /app/help.html with its
'%%API_BASE%%'/'%%WS_BASE%%'/'%%VERSION%%'/'%%SERIAL%%' placeholders
(help.html:553-556) left literal — the fallback now fills them (single-quoted
form as written in the file).
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import PBApiServer
import api.auth as auth
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def help_client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return PBApiServer.help_main_page(request=request, session=SESSION)

    app.get("/api/help/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "help" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "help.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "help.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "help" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "help.html" else tmp_path / "missing" / name)


def test_help_serves_built_vue_page(
    help_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "<html>vue help</html>", "<html>legacy</html>")

    resp = help_client.get("/api/help/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue help" in resp.text


def test_help_falls_back_to_legacy_template_with_injections(
    help_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = (
        "<html><script>\n"
        "  var API_BASE = '%%API_BASE%%';\n"
        "  var WS_BASE = '%%WS_BASE%%';\n"
        "  var PBGUI_VERSION = '%%VERSION%%';\n"
        "  var PBGUI_SERIAL = '%%SERIAL%%';\n"
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = help_client.get("/api/help/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/help";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    assert '"%%' not in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "%%WS_BASE%%" not in resp.text
    assert "%%VERSION%%" not in resp.text
    assert "%%SERIAL%%" not in resp.text
    # version/serial come from pbgui_purefunc, not the literal placeholders
    assert 'var PBGUI_VERSION = ""' not in resp.text


def test_help_errors_clearly_when_no_build_and_no_legacy(
    help_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, None)

    resp = help_client.get("/api/help/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
    assert "help" in resp.text
