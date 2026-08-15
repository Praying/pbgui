"""Dashboard templates_page route: serves the built Vue page, falls back to
the legacy template with %% injections, fails loudly without either."""

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

    def templates_page(
        request: Request, current: str = Query(default=""), api_base: str = Query(default="")
    ):
        return dashboard.get_templates_page(
            request, current=current, api_base=api_base, session=SESSION
        )

    app.get("/api/dashboard/templates_page", include_in_schema=False)(templates_page)
    return TestClient(app, raise_server_exceptions=False)


def test_templates_page_serves_built_vue_page(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    vue_index = tmp_path / "index.html"
    vue_index.write_text("<html>vue templates build</html>", encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/api/dashboard/templates_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue templates build" in resp.text


def test_templates_page_falls_back_to_legacy_html_with_injections(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    legacy = tmp_path / "dashboard_templates.html"
    legacy.write_text(
        '<html>"%%API_BASE%%" "%%TOKEN%%" %%CURRENT%%</html>',
        encoding="utf-8",
    )
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy)

    resp = client.get(
        "/api/dashboard/templates_page",
        params={"current": "myDash", "api_base": "http://pbgui.test:8000/api"},
    )

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    # The legacy %% placeholders were replaced by the inject callback.
    assert '"http://pbgui.test:8000/api"' in resp.text
    assert '"myDash"' in resp.text
    assert '"%%API_BASE%%"' not in resp.text
    assert '"%%TOKEN%%"' not in resp.text
    assert "%%CURRENT%%" not in resp.text


def test_templates_page_errors_clearly_when_no_frontend_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    monkeypatch.setattr(
        auth, "_frontend_template_path", lambda name: tmp_path / "missing" / "dashboard_templates.html"
    )

    resp = client.get("/api/dashboard/templates_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
