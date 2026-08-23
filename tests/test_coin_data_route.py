"""Coin Data + HL data-actions page routes: Vue build first, legacy fallback.

/api/coin-data/main_page and /api/market-data/data-actions/hyperliquid serve
the built Vue pages (frontend/src/pages/{coin_data,hl_data_actions}) when the
dist output exists, fall back to the legacy templates with their server-side
injections for checkouts without a build, and fail with the pnpm build hint
when neither file exists.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.coin_data as coin_data
import api.market_data as market_data
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def coin_client() -> TestClient:
    app = FastAPI()

    def main_page(request: Request):
        return coin_data.get_main_page(request=request, session=SESSION)

    app.get("/api/coin-data/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def hlda_client() -> TestClient:
    app = FastAPI()

    def data_actions(request: Request, section: str = ""):
        return market_data.get_hyperliquid_data_actions(request=request, section=section, session=SESSION)

    app.get("/api/market-data/data-actions/hyperliquid", include_in_schema=False)(data_actions)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    page: str,
    legacy_name: str,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / page / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / legacy_name
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / legacy_name
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == page else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == legacy_name else tmp_path / "missing" / name)


def test_coin_data_serves_built_vue_page(
    coin_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "coin_data", "coin_data.html", "<html>vue coin data</html>", "<html>legacy</html>")

    resp = coin_client.get("/api/coin-data/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue coin data" in resp.text


def test_coin_data_falls_back_to_legacy_template(
    coin_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = '<html><script>var TOKEN = "%%TOKEN%%"; var API_BASE = "%%API_BASE%%";</script></html>'
    _set_files(monkeypatch, tmp_path, "coin_data", "coin_data.html", None, legacy)

    resp = coin_client.get("/api/coin-data/main_page")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert '"tok-1"' in resp.text
    assert "/api/coin-data" in resp.text
    assert "%%TOKEN%%" not in resp.text


def test_coin_data_errors_clearly_when_no_build_and_no_legacy(
    coin_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "coin_data", "coin_data.html", None, None)

    resp = coin_client.get("/api/coin-data/main_page")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "coin_data" in resp.text


def test_hlda_serves_built_vue_page(
    hlda_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "hl_data_actions", "hl_data_actions.html", "<html>vue hlda</html>", "<html>legacy</html>")

    resp = hlda_client.get("/api/market-data/data-actions/hyperliquid?section=build")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue hlda" in resp.text


def test_hlda_falls_back_to_prefixed_legacy_template(
    hlda_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = '<div id="__HLDA_ROOT__" data-token="" data-api-base="" data-initial-section=""></div>'
    _set_files(monkeypatch, tmp_path, "hl_data_actions", "hl_data_actions.html", None, legacy)

    resp = hlda_client.get("/api/market-data/data-actions/hyperliquid?section=build")

    assert resp.status_code == 200
    assert 'id="hlda_fastapi_market_data"' in resp.text
    assert 'data-token="tok-1"' in resp.text
    assert 'data-initial-section="build"' in resp.text


def test_hlda_rejects_unknown_section_in_fallback(
    hlda_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = '<div data-initial-section=""></div>'
    _set_files(monkeypatch, tmp_path, "hl_data_actions", "hl_data_actions.html", None, legacy)

    resp = hlda_client.get("/api/market-data/data-actions/hyperliquid?section=nonsense")

    assert resp.status_code == 200
    assert 'data-initial-section=""' in resp.text


def test_hlda_errors_clearly_when_no_build_and_no_legacy(
    hlda_client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "hl_data_actions", "hl_data_actions.html", None, None)

    resp = hlda_client.get("/api/market-data/data-actions/hyperliquid")

    assert resp.status_code == 500
    assert "pnpm run build" in resp.text
    assert "hl_data_actions" in resp.text
