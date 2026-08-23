"""Root login route: built Vue page first, legacy template fallback."""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth


@pytest.fixture(autouse=True)
def password_required(monkeypatch):
    """Force the root entry into the login-page branch regardless of host config."""
    monkeypatch.setattr(
        auth,
        "_password_state",
        lambda: {"error": None, "required": True, "missing": False},
    )


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def root(request: Request):
        return auth.build_root_entry_response(request=request, session=None)

    app.get("/", include_in_schema=False)(root)
    return TestClient(app, raise_server_exceptions=False)


def test_root_login_prefers_built_vue_page(tmp_path: Path, client: TestClient, monkeypatch) -> None:
    vue_index = tmp_path / "index.html"
    vue_index.write_text("<html>vue build</html>", encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: vue_index)

    resp = client.get("/")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue build" in resp.text


def test_root_login_falls_back_to_legacy_template_without_build(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    """A clone that never ran `pnpm run build` still gets a working login page."""
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    legacy = tmp_path / "root_login.html"
    legacy.write_text('<script>var API_ORIGIN = "%%API_ORIGIN%%";</script>', encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy)

    resp = client.get("/", headers={"x-forwarded-proto": "https"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "%%API_ORIGIN%%" not in resp.text
    assert 'var API_ORIGIN = "http://testserver";' in resp.text


def test_root_login_errors_clearly_when_no_frontend_exists(
    tmp_path: Path, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda page: tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: tmp_path / "gone.html")

    resp = client.get("/")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
