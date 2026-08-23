"""Market data main page route: built Vue page only (M-data-8 retirement).

/api/market-data/main_page serves the built market_data Vue page directly and
fails with the pnpm build hint when the bundle is missing (services_monitor and
dashboard precedent). The legacy market_data_main.html template — and its
%%TOKEN%%/%%API_BASE%%/%%VERSION%%/%%SERIAL%%/%%NAV_HASH%% server-side
injections — was removed with the Vue migration; the page reads token/origin
from /api/boot.js at runtime.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.market_data as market_data
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def main_page():
        return market_data.get_main_page(session=SESSION)

    app.get("/api/market-data/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_dist(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, text: str | None) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if text is not None:
        vue_index = tmp_path / "dist-vue" / "index.html"
        vue_index.parent.mkdir(exist_ok=True)
        vue_index.write_text(text, encoding="utf-8")
    monkeypatch.setattr(market_data, "_frontend_dist_path", lambda page: vue_index)


def test_serves_built_vue_page(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(monkeypatch, tmp_path, "<html>vue market data build</html>")

    resp = client.get("/api/market-data/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue market data build" in resp.text


def test_errors_clearly_when_no_build_exists(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(monkeypatch, tmp_path, None)

    resp = client.get("/api/market-data/main_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "market_data" in resp.text
