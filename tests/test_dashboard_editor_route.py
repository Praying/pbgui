"""Dashboard editor_page route: serves the built Vue page, fails loudly
without a build. The legacy template fallback was removed with the Vue
migration (D-editor-8); the page reads name/view_only/standalone from the
URL query string and the API base from /api/boot.js at runtime."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Query, Request
from fastapi.testclient import TestClient

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
    monkeypatch.setattr(dashboard, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/api/dashboard/editor_page", params={"name": "Draft", "standalone": "true"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue editor build" in resp.text


def test_editor_page_errors_clearly_when_no_build_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    # A leftover legacy template must NOT satisfy the route: the Vue bundle
    # is the only editor now (mirrors services.py get_main_page).
    legacy = tmp_path / "dashboard_editor.html"
    legacy.write_text("<html>legacy editor</html>", encoding="utf-8")
    monkeypatch.setattr(dashboard, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")

    resp = client.get("/api/dashboard/editor_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "legacy editor" not in resp.text
