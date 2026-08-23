"""Pareto Explorer page route: Vue build first, legacy fallback with injections.

/api/pareto-explorer/main_page (api/pareto_explorer.py) is the ONLY route
serving the page (the v8 flavour is the ?optimize_version=v8 query param,
pbgui_nav.js:1032,1039 — recon §0). It serves the built Vue page
(frontend/src/pages/v7_pareto_explorer) when the dist output exists — the
page seeds its flavour from the query string and re-resolves it per result
at runtime (composables/useParetoSession.ts), so no pathname detection.
Without a build it falls back to the legacy frontend/v7_pareto_explorer.html
template with the exact placeholder set the static file always received,
including the server-side %%OPTIMIZE_VERSION%% resolution: the result
directory's owning version wins over the query seed
(pareto_explorer.py:_result_optimize_version).
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
from api import pareto_explorer
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)

LEGACY_PLACEHOLDER_HTML = (
    "<html><script>\n"
    '  var API_BASE = "%%API_BASE%%";\n'
    '  var WS_BASE = "%%WS_BASE%%";\n'
    '  var RESULT_PATH = "%%RESULT_PATH%%";\n'
    '  var OPTIMIZE_VERSION = "%%OPTIMIZE_VERSION%%";\n'
    '  var PBGUI_VERSION = "%%VERSION%%";\n'
    '  var PBGUI_SERIAL = "%%SERIAL%%";\n'
    '  var NAV_HASH = "%%NAV_HASH%%";\n'
    "</script></html>"
)


@pytest.fixture
def pareto_client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request, result_path: str = "", optimize_version: str = "v7"):
        return pareto_explorer.main_page(
            request=request,
            result_path=result_path,
            optimize_version=optimize_version,
            _session=SESSION,
        )

    app.get("/api/pareto-explorer/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "v7_pareto_explorer" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "v7_pareto_explorer.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "v7_pareto_explorer.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "v7_pareto_explorer" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "v7_pareto_explorer.html" else tmp_path / "missing" / name)


def test_pareto_serves_built_vue_page(
    pareto_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "<html>vue pareto</html>", "<html>legacy</html>")

    resp = pareto_client.get("/api/pareto-explorer/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue pareto" in resp.text
    # dist wins when both artifacts exist
    assert "legacy" not in resp.text


def test_pareto_falls_back_to_legacy_template_with_injections(
    pareto_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, LEGACY_PLACEHOLDER_HTML)

    resp = pareto_client.get("/api/pareto-explorer/main_page?result_path=/data/opt/r1&optimize_version=v8")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'var API_BASE = "http://testserver/api/pareto-explorer";' in resp.text
    assert 'var WS_BASE = "ws://testserver";' in resp.text
    assert 'var RESULT_PATH = "/data/opt/r1";' in resp.text
    # query seed honoured when no result directory resolves
    assert 'var OPTIMIZE_VERSION = "v8";' in resp.text
    for token in ("%%API_BASE%%", "%%WS_BASE%%", "%%RESULT_PATH%%", "%%OPTIMIZE_VERSION%%", "%%VERSION%%", "%%SERIAL%%", "%%NAV_HASH%%"):
        assert token not in resp.text
    # version/serial come from the server, not literal placeholders
    assert 'var PBGUI_VERSION = ""' not in resp.text
    assert 'var PBGUI_SERIAL = ""' not in resp.text


def test_fallback_defaults_seed_version_to_v7(
    pareto_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, LEGACY_PLACEHOLDER_HTML)

    default_resp = pareto_client.get("/api/pareto-explorer/main_page")
    junk_resp = pareto_client.get("/api/pareto-explorer/main_page?optimize_version=nope")

    assert 'var OPTIMIZE_VERSION = "v7";' in default_resp.text
    assert 'var OPTIMIZE_VERSION = "v7";' in junk_resp.text
    assert 'var RESULT_PATH = "";' in default_resp.text


def test_fallback_resolves_version_from_result_dir_over_query_seed(
    pareto_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, LEGACY_PLACEHOLDER_HTML)
    monkeypatch.setattr(pareto_explorer, "_resolve_result_dir", lambda path: Path("/data/opt/v8-result"))
    monkeypatch.setattr(pareto_explorer, "_result_optimize_version", lambda result_dir: "v8")

    resp = pareto_client.get("/api/pareto-explorer/main_page?result_path=/data/opt/v8-result&optimize_version=v7")

    # the result directory's owning version wins over the query seed (:3358-3362)
    assert 'var OPTIMIZE_VERSION = "v8";' in resp.text


def test_pareto_page_errors_clearly_when_no_build_and_no_legacy(
    pareto_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, None)

    resp = pareto_client.get("/api/pareto-explorer/main_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "v7_pareto_explorer" in resp.text
