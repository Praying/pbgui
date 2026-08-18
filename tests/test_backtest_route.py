"""PBv7/PBv8 Backtest page routes: Vue build first, legacy fallback with injections.

/api/backtest-v7/main_page (api/backtest_v7.py) and
/api/backtest-v8/main_page (api/backtest_v8.py) serve the SAME built Vue
page (frontend/src/pages/v7_backtest) when the dist output exists — the
page derives the flavour from the serving route's pathname (config.ts
detectBacktestVersion). Without a build both fall back to the legacy
frontend/v7_backtest.html template with the exact placeholder set each
router always injected (v7 carries the session TOKEN; v8 injects "").
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
from api import backtest_v7, backtest_v8
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def backtest_clients() -> tuple[TestClient, TestClient]:
    app = FastAPI()

    def v7_page(request: Request):
        return backtest_v7.main_page(request=request, session=SESSION)

    def v8_page(request: Request):
        return backtest_v8.main_page(request=request, session=SESSION)

    app.get("/api/backtest-v7/main_page", include_in_schema=False)(v7_page)
    app.get("/api/backtest-v8/main_page", include_in_schema=False)(v8_page)
    return TestClient(app, raise_server_exceptions=False), TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "v7_backtest" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "v7_backtest.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "v7_backtest.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "v7_backtest" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "v7_backtest.html" else tmp_path / "missing" / name)


def test_v7_serves_built_vue_page(
    backtest_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = backtest_clients
    _set_files(monkeypatch, tmp_path, "<html>vue backtest</html>", "<html>legacy</html>")

    resp = v7_client.get("/api/backtest-v7/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue backtest" in resp.text


def test_v8_serves_the_same_vue_build(
    backtest_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = backtest_clients
    _set_files(monkeypatch, tmp_path, "<html>vue backtest</html>", "<html>legacy</html>")

    resp = v8_client.get("/api/backtest-v8/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue backtest" in resp.text


def test_v7_falls_back_to_legacy_template_with_injections(
    backtest_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = backtest_clients
    legacy = (
        "<html><script>\n"
        '  var TOKEN = "%%TOKEN%%";\n'
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var WS_BASE = "%%WS_BASE%%";\n'
        '  var BACKTEST_VERSION = "%%BACKTEST_VERSION%%";\n'
        '  var BACKTEST_LABEL = "%%BACKTEST_LABEL%%";\n'
        '  var BACKTEST_SUBTITLE = "%%BACKTEST_SUBTITLE%%";\n'
        '  var BACKTEST_NAV_CURRENT = "%%BACKTEST_NAV_CURRENT%%";\n'
        '  var PBGUI_VERSION = "%%VERSION%%";\n'
        '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '  var NAV_HASH = "%%NAV_HASH%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v7_client.get("/api/backtest-v7/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var TOKEN = "tok-1";' in resp.text  # the v7 router injects the session token (:2838)
    assert 'var API_BASE = "http://testserver/api/backtest-v7";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    assert 'var BACKTEST_VERSION = "v7";' in resp.text
    assert 'var BACKTEST_LABEL = "V7";' in resp.text
    assert 'var BACKTEST_SUBTITLE = "PBv7 BACKTEST";' in resp.text
    assert 'var BACKTEST_NAV_CURRENT = "v7_backtest";' in resp.text
    for placeholder in ("%%TOKEN%%", "%%API_BASE%%", "%%WS_BASE%%", "%%BACKTEST_VERSION%%", "%%BACKTEST_LABEL%%",
                        "%%BACKTEST_SUBTITLE%%", "%%BACKTEST_NAV_CURRENT%%", "%%VERSION%%", "%%SERIAL%%", "%%NAV_HASH%%"):
        assert placeholder not in resp.text


def test_v8_falls_back_to_legacy_template_with_v8_injections(
    backtest_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = backtest_clients
    legacy = (
        "<html><script>\n"
        '  var TOKEN = "%%TOKEN%%";\n'
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var BACKTEST_VERSION = "%%BACKTEST_VERSION%%";\n'
        '  var BACKTEST_LABEL = "%%BACKTEST_LABEL%%";\n'
        '  var BACKTEST_NAV_CURRENT = "%%BACKTEST_NAV_CURRENT%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v8_client.get("/api/backtest-v8/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var TOKEN = "";' in resp.text  # the v8 router never carried a token (:1510)
    assert 'var API_BASE = "http://testserver/api/backtest-v8";' in resp.text
    assert 'var BACKTEST_VERSION = "v8";' in resp.text
    assert 'var BACKTEST_LABEL = "V8";' in resp.text
    assert 'var BACKTEST_NAV_CURRENT = "v8_backtest";' in resp.text
    for placeholder in ("%%TOKEN%%", "%%API_BASE%%", "%%BACKTEST_VERSION%%", "%%BACKTEST_LABEL%%", "%%BACKTEST_NAV_CURRENT%%"):
        assert placeholder not in resp.text


def test_backtest_page_errors_clearly_when_no_build_and_no_legacy(
    backtest_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = backtest_clients
    _set_files(monkeypatch, tmp_path, None, None)

    resp = v7_client.get("/api/backtest-v7/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
    assert "v7_backtest" in resp.text
