"""Dashboard editor_page route: serves the built Vue page, falls back to the
legacy template with %% injections, fails loudly without either."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Query, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.dashboard as dashboard
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def editor_page(
        request: Request,
        name: str = Query(default=""),
        api_base: str = Query(default=""),
        view_only: bool = Query(default=False),
        standalone: bool = Query(default=False),
    ):
        return dashboard.get_editor_page(
            request,
            name=name,
            api_base=api_base,
            view_only=view_only,
            standalone=standalone,
            session=SESSION,
        )

    app.get("/api/dashboard/editor_page", include_in_schema=False)(editor_page)
    return TestClient(app, raise_server_exceptions=False)


def test_editor_page_serves_built_vue_page(tmp_path: Path, client: TestClient, monkeypatch) -> None:
    vue_index = tmp_path / "index.html"
    vue_index.write_text("<html>vue editor build</html>", encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/api/dashboard/editor_page", params={"name": "Draft", "standalone": "true"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue editor build" in resp.text


def test_editor_page_falls_back_to_legacy_html_with_injections(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    legacy = tmp_path / "dashboard_editor.html"
    legacy.write_text(
        "<html>%%API_BASE%% %%DASHBOARD_NAME%% %%VIEW_ONLY%% %%STANDALONE%% "
        "%%EDIT_ONLY_STYLE%% %%BODY_CLASS%% %%TOKEN%%</html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy)

    # Edit mode: no body class, no edit-only style, API base derived from the
    # request URL (same derivation as get_main_page).
    resp = client.get("/api/dashboard/editor_page", params={"name": "My Dash", "api_base": "/api"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "%%TOKEN%%" not in resp.text
    assert "%%API_BASE%%" not in resp.text
    assert "http://testserver/api" in resp.text
    assert '"My Dash"' in resp.text
    assert "%%DASHBOARD_NAME%%" not in resp.text
    assert "%%VIEW_ONLY%%" not in resp.text
    assert "%%STANDALONE%%" not in resp.text
    assert "%%EDIT_ONLY_STYLE%%" not in resp.text
    assert "%%BODY_CLASS%%" not in resp.text

    # View-only mode: edit-only style hidden + view-mode body class.
    resp_view = client.get("/api/dashboard/editor_page", params={"name": "V", "view_only": "true"})
    assert "display:none!important" in resp_view.text
    assert "view-mode" in resp_view.text
    assert "standalone-mode" not in resp_view.text

    # Standalone mode: standalone body class, no view class.
    resp_standalone = client.get(
        "/api/dashboard/editor_page", params={"name": "S", "standalone": "true"}
    )
    assert "standalone-mode" in resp_standalone.text
    assert "view-mode" not in resp_standalone.text
    assert "display:none!important" not in resp_standalone.text


def test_editor_page_errors_clearly_when_no_frontend_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    monkeypatch.setattr(
        auth, "_frontend_template_path", lambda name: tmp_path / "missing" / "dashboard_editor.html"
    )

    resp = client.get("/api/dashboard/editor_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
