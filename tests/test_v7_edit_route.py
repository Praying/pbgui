"""PBv7/PBv8 Edit page routes: Vue build first, legacy fallback with injections.

/api/v7/edit_page (api/v7_instances.py get_edit_page) and /api/v8/edit_page
(api/v8_instances.py get_v8_edit_page) serve the SAME built Vue page
(frontend/src/pages/v7_edit) when the dist output exists — the page derives
the run version from the serving route's path (config.ts detectEditFlavor)
and name/new/draft_id from the query string. Without a build both fall back
to the legacy frontend/v7_edit.html template with the exact placeholder set
the static file always received (v8 through the same _apply_placeholders
helper every other PB8 page uses). Mirrors test_v7_run_route.py.
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
def edit_clients() -> tuple[TestClient, TestClient]:
    app = FastAPI()

    def v7_page(request: Request, name: str = "", new: str = "", draft_id: str = ""):
        return v7_instances.get_edit_page(request=request, name=name, new=new, draft_id=draft_id, session=SESSION)

    def v8_page(request: Request, name: str = "", new: str = "", draft_id: str = ""):
        return v8_instances.get_v8_edit_page(request=request, name=name, new=new, draft_id=draft_id, session=SESSION)

    app.get("/api/v7/edit_page", include_in_schema=False)(v7_page)
    app.get("/api/v8/edit_page", include_in_schema=False)(v8_page)
    return TestClient(app, raise_server_exceptions=False), TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "v7_edit" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "v7_edit.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "v7_edit.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "v7_edit" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "v7_edit.html" else tmp_path / "missing" / name)


def test_v7_serves_built_vue_page(
    edit_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = edit_clients
    _set_files(monkeypatch, tmp_path, "<html>vue edit</html>", "<html>legacy</html>")

    resp = v7_client.get("/api/v7/edit_page", params={"name": "alice", "draft_id": "d-1"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue edit" in resp.text


def test_v8_serves_the_same_vue_build(
    edit_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = edit_clients
    _set_files(monkeypatch, tmp_path, "<html>vue edit</html>", "<html>legacy</html>")

    resp = v8_client.get("/api/v8/edit_page", params={"new": "1"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue edit" in resp.text


def test_v7_falls_back_to_legacy_template_with_injections(
    edit_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = edit_clients
    legacy = (
        "<html><script>\n"
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var WS_BASE = "%%WS_BASE%%";\n'
        '  var INSTANCE_NAME = "%%INSTANCE%%";\n'
        '  var IS_NEW = "%%IS_NEW%%";\n'
        '  var DRAFT_ID = "%%DRAFT_ID%%";\n'
        '  var RUN_VERSION = "%%RUN_VERSION%%";\n'
        '  var MASTER_NAME = "%%MASTER_NAME%%";\n'
        '  var PBGUI_VERSION = "%%VERSION%%";\n'
        '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
        '  var NAV_HASH = "%%NAV_HASH%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v7_client.get("/api/v7/edit_page", params={"name": "alice", "draft_id": "d-9"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/v7";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    assert 'var INSTANCE_NAME = "alice";' in resp.text
    assert 'var IS_NEW = "false";' in resp.text
    assert 'var DRAFT_ID = "d-9";' in resp.text
    assert 'var RUN_VERSION = "v7";' in resp.text
    for token in ("%%API_BASE%%", "%%WS_BASE%%", "%%INSTANCE%%", "%%IS_NEW%%", "%%DRAFT_ID%%", "%%RUN_VERSION%%", "%%MASTER_NAME%%", "%%VERSION%%", "%%SERIAL%%", "%%NAV_HASH%%"):
        assert token not in resp.text


def test_v8_falls_back_to_legacy_template_with_v8_injections(
    edit_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, v8_client = edit_clients
    legacy = (
        "<html><script>\n"
        '  var API_BASE = "%%API_BASE%%";\n'
        '  var INSTANCE_NAME = "%%INSTANCE%%";\n'
        '  var IS_NEW = "%%IS_NEW%%";\n'
        '  var DRAFT_ID = "%%DRAFT_ID%%";\n'
        '  var RUN_VERSION = "%%RUN_VERSION%%";\n'
        "</script></html>"
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = v8_client.get("/api/v8/edit_page", params={"new": "1", "draft_id": "d-8"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/v8";' in resp.text
    assert 'var INSTANCE_NAME = "";' in resp.text
    assert 'var IS_NEW = "true";' in resp.text
    assert 'var DRAFT_ID = "d-8";' in resp.text
    assert 'var RUN_VERSION = "v8";' in resp.text
    for token in ("%%API_BASE%%", "%%INSTANCE%%", "%%IS_NEW%%", "%%DRAFT_ID%%", "%%RUN_VERSION%%"):
        assert token not in resp.text


def test_edit_page_errors_clearly_when_no_build_and_no_legacy(
    edit_clients: tuple[TestClient, TestClient], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    v7_client, _ = edit_clients
    _set_files(monkeypatch, tmp_path, None, None)

    resp = v7_client.get("/api/v7/edit_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "v7_edit" in resp.text
