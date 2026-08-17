"""PBv7/PBv8 Run page routes: Vue build first, legacy fallback with injections.

/api/v7/main_page (api/v7_instances.py) and /api/v8/main_page
(api/v8_instances.py) serve the SAME built Vue page (frontend/src/pages/
v7_run) when the dist output exists — the page derives the run version from
the serving route's path (config.ts detectRunVersion). Without a build both
fall back to the legacy frontend/v7_run.html template with the exact
placeholder set the static file always received (v8 through the same
_apply_placeholders helper every other PB8 page uses).
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
from api import v7_instances, v8_instances
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def run_clients() -> tuple[TestClient, TestClient]:
    app = FastAPI()

    def v7_page(request: Request):
        return v7_instances.get_main_page(request=request, session=SESSION)

    def v8_page(request: Request):
        return v8_instances.get_v8_main_page(request=request, session=SESSION)

    app.get("/api/v7/main_page", include_in_schema=False)(v7_page)
    app.get("/api/v8/main_page", include_in_schema=False)(v8_page)
    return TestClient(app, raise_server_exceptions=False), TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "v7_run" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "v7_run.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "v7_run.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "v7_run" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "v7_run.html" else tmp_path / "missing" / name)


def test_v7_serves_built_vue_page(
    run_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = run_clients
    _set_files(monkeypatch, tmp_path, "<html>vue run</html>", "<html>legacy</html>")

    resp = v7_client.get("/api/v7/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue run" in resp.text


def test_v8_serves_the_same_vue_build(
    run_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = run_clients
    _set_files(monkeypatch, tmp_path, "<html>vue run</html>", "<html>legacy</html>")

    resp = v8_client.get("/api/v8/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue run" in resp.text


def test_v7_falls_back_to_legacy_template_with_injections(
    run_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = run_clients
    legacy = (
        "<html><script>\n"
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var WS_BASE = "%%WS_BASE%%";\n'
        '  var RUN_VERSION = "%%RUN_VERSION%%";\n'
        '  var MASTER_NAME = "%%MASTER_NAME%%";\n'
        '  var PBGUI_VERSION = "%%VERSION%%";\n'
        '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '  var NAV_HASH = "%%NAV_HASH%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v7_client.get("/api/v7/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/v7";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    assert 'var RUN_VERSION = "v7";' in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "%%WS_BASE%%" not in resp.text
    assert "%%RUN_VERSION%%" not in resp.text
    assert "%%MASTER_NAME%%" not in resp.text
    assert "%%VERSION%%" not in resp.text
    assert "%%SERIAL%%" not in resp.text
    assert "%%NAV_HASH%%" not in resp.text
    # master name/version/serial come from the server, not literal placeholders
    assert 'var MASTER_NAME = ""' not in resp.text
    assert 'var PBGUI_VERSION = ""' not in resp.text


def test_v8_falls_back_to_legacy_template_with_v8_injections(
    run_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = run_clients
    legacy = (
        "<html><script>\n"
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var RUN_VERSION = "%%RUN_VERSION%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v8_client.get("/api/v8/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/v8";' in resp.text
    assert 'var RUN_VERSION = "v8";' in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "%%RUN_VERSION%%" not in resp.text


def test_run_page_errors_clearly_when_no_build_and_no_legacy(
    run_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = run_clients
    _set_files(monkeypatch, tmp_path, None, None)

    resp = v7_client.get("/api/v7/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
    assert "v7_run" in resp.text
