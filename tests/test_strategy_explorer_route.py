"""Strategy Explorer page routes: Vue build first, legacy fallback with injections.

/api/strategy-explorer/main_page (api/strategy_explorer.py) and
/api/strategy-explorer-v8/main_page (api/strategy_explorer_v8.py) serve the
SAME built Vue page (frontend/src/pages/v7_strategy_explorer) when the dist
output exists — the page derives the explorer flavour from the serving
route's path (config.ts detectExplorerFlavor, the twin of v7_run's
detectRunVersion). Without a build both fall back to the legacy
frontend/v7_strategy_explorer.html template with the exact placeholder set
each static file always received.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
from api import strategy_explorer, strategy_explorer_v8
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def explorer_clients() -> tuple[TestClient, TestClient]:
    app = FastAPI()

    def v7_page(request: Request, draft_id: str = "", result_path: str = ""):
        return strategy_explorer.main_page(request=request, draft_id=draft_id, result_path=result_path, session=SESSION)

    def v8_page(request: Request, draft_id: str = ""):
        return strategy_explorer_v8.main_page(request=request, draft_id=draft_id, session=SESSION)

    app.get("/api/strategy-explorer/main_page", include_in_schema=False)(v7_page)
    app.get("/api/strategy-explorer-v8/main_page", include_in_schema=False)(v8_page)
    return TestClient(app, raise_server_exceptions=False), TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "v7_strategy_explorer" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "v7_strategy_explorer.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "v7_strategy_explorer.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "v7_strategy_explorer" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "v7_strategy_explorer.html" else tmp_path / "missing" / name)


def test_v7_serves_built_vue_page(
    explorer_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = explorer_clients
    _set_files(monkeypatch, tmp_path, "<html>vue explorer</html>", "<html>legacy</html>")

    resp = v7_client.get("/api/strategy-explorer/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue explorer" in resp.text


def test_v8_serves_the_same_vue_build(
    explorer_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = explorer_clients
    _set_files(monkeypatch, tmp_path, "<html>vue explorer</html>", "<html>legacy</html>")

    resp = v8_client.get("/api/strategy-explorer-v8/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue explorer" in resp.text


def test_v7_falls_back_to_legacy_template_with_injections(
    explorer_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = explorer_clients
    legacy = (
        "<html><script>\n"
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var WS_BASE = "%%WS_BASE%%";\n'
        '  var DRAFT_ID = "%%DRAFT_ID%%";\n'
        '  var RESULT_PATH = "%%RESULT_PATH%%";\n'
        '  var PBGUI_VERSION = "%%VERSION%%";\n'
        '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '  var NAV_HASH = "%%NAV_HASH%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v7_client.get("/api/strategy-explorer/main_page?draft_id=d-7&result_path=/data/bt/2024")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/strategy-explorer";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    assert 'var DRAFT_ID = "d-7";' in resp.text
    assert 'var RESULT_PATH = "/data/bt/2024";' in resp.text
    for token in ("%%API_BASE%%", "%%WS_BASE%%", "%%DRAFT_ID%%", "%%RESULT_PATH%%", "%%VERSION%%", "%%SERIAL%%", "%%NAV_HASH%%"):
        assert token not in resp.text
    # version/serial come from the server, not literal placeholders
    assert 'var PBGUI_VERSION = ""' not in resp.text


def test_v8_falls_back_to_legacy_template_with_v8_injections(
    explorer_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = explorer_clients
    legacy = (
        "<html><script>\n"
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var DRAFT_ID = "%%DRAFT_ID%%";\n'
        '  var RESULT_PATH = "%%RESULT_PATH%%";\n'
        '  var TOKEN = "%%TOKEN%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v8_client.get("/api/strategy-explorer-v8/main_page?draft_id=d-8&result_path=/ignored")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    # v8 api_base derives from the request route path (:531-534)
    assert 'var API_BASE = "http://testserver/api/strategy-explorer-v8";' in resp.text
    assert 'var DRAFT_ID = "d-8";' in resp.text
    # v8 ignores result_path (:527) and authenticates cookie-only (:526)
    assert 'var RESULT_PATH = "";' in resp.text
    assert 'var TOKEN = "";' in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "%%DRAFT_ID%%" not in resp.text


def test_explorer_page_errors_clearly_when_no_build_and_no_legacy(
    explorer_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, v8_client = explorer_clients
    _set_files(monkeypatch, tmp_path, None, None)

    resp = v7_client.get("/api/strategy-explorer/main_page")
    resp8 = v8_client.get("/api/strategy-explorer-v8/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
    assert "v7_strategy_explorer" in resp.text
    assert resp8.status_code == 500
