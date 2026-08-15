"""Services main_page route: built Vue page first, legacy template fallback."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.services as services
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return services.get_main_page(request, session=SESSION)

    app.get("/api/services/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def test_main_page_prefers_built_vue_page(tmp_path: Path, client: TestClient, monkeypatch) -> None:
    vue_index = tmp_path / "index.html"
    vue_index.write_text("<html>vue build</html>", encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/api/services/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue build" in resp.text


def test_main_page_falls_back_to_legacy_template_without_build(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    """A clone that never ran `npm run build` still gets injected legacy HTML."""
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    legacy = tmp_path / "services_monitor.html"
    legacy.write_text(
        '<script>\n'
        'var TOKEN = "%%TOKEN%%";\n'
        'var API_BASE = "%%API_BASE%%";\n'
        'var WS_BASE = "%%WS_BASE%%";\n'
        'var PBGUI_VERSION = "%%VERSION%%";\n'
        'var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '</script>\n'
        '<script src="/app/pbgui_nav.js?v=%%NAV_HASH%%"></script>',
        encoding="utf-8",
    )
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy)

    resp = client.get("/api/services/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var TOKEN = "tok-1";' in resp.text
    assert 'var API_BASE = "http://testserver/api/services";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    # The bare (unquoted) replacements cover version/serial usage outside string literals.
    assert "%%TOKEN%%" not in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "%%WS_BASE%%" not in resp.text
    assert "%%VERSION%%" not in resp.text
    assert "%%SERIAL%%" not in resp.text
    assert "%%NAV_HASH%%" not in resp.text


def test_main_page_errors_clearly_when_no_frontend_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: tmp_path / "gone.html")

    resp = client.get("/api/services/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
