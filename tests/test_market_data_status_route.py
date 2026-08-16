"""Market data status-monitor route: fragment-aware page switch.

Unlike the migrated dashboard pages, /api/market-data/status-monitor/{exchange}
is consumed as a live FRAGMENT by the still-legacy market_data_main.html:
it fetches the URL, injects the HTML into #status-monitor-host via innerHTML
and re-executes the inline scripts on every exchange switch (mountStatusMonitor,
market_data_main.html:4142). ES module bundles execute only once per document,
so serving the Vue build here would leave the second mount blank. The legacy
fragment therefore stays the FIRST branch while market_data_main is live; the
Vue build takes over once the legacy fragment is retired, and a checkout with
neither fails loudly with the npm build hint.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.market_data as market_data
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)

LEGACY_MARKER = (
    '<div class="mds-root" id="__MDS_ROOT_ID__" data-token="" data-exchange="" '
    'data-api-host="" data-api-base="">'
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def status_monitor(exchange: str, request: Request):
        return market_data.get_market_data_status_monitor(
            exchange=exchange, request=request, session=SESSION
        )

    app.get("/api/market-data/status-monitor/{exchange}", include_in_schema=False)(status_monitor)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def legacy_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the module's PBGDIR at a temp tree with an (empty) frontend dir."""
    (tmp_path / "frontend").mkdir()
    monkeypatch.setattr(market_data, "PBGDIR", tmp_path)
    return tmp_path


def _write_legacy(pbgdir: Path) -> None:
    (pbgdir / "frontend" / "market_data_status.html").write_text(
        "<html>legacy " + LEGACY_MARKER + "</html>", encoding="utf-8"
    )


def _set_dist(monkeypatch: pytest.MonkeyPatch, pbgdir: Path, text: str | None) -> None:
    vue_index = pbgdir / "missing" / "index.html"
    if text is not None:
        vue_index = pbgdir / "dist-vue" / "index.html"
        vue_index.parent.mkdir(exist_ok=True)
        vue_index.write_text(text, encoding="utf-8")
    monkeypatch.setattr(market_data, "_frontend_dist_path", lambda page: vue_index)


def test_serves_legacy_fragment_while_market_data_main_is_live(
    client: TestClient, legacy_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The legacy consumer still injects this URL as a re-executable fragment,
    # so the legacy template wins even when a Vue build exists.
    _write_legacy(legacy_dir)
    _set_dist(monkeypatch, legacy_dir, "<html>vue build</html>")

    resp = client.get("/api/market-data/status-monitor/binance")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "legacy" in resp.text
    assert "vue build" not in resp.text
    # Server-side injections the fragment depends on.
    assert 'id="mds_fastapi_binance"' in resp.text
    assert 'data-token="tok-1"' in resp.text
    assert 'data-exchange="binance"' in resp.text
    assert 'data-api-base=' in resp.text


def test_serves_built_vue_page_after_legacy_fragment_removed(
    client: TestClient, legacy_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(monkeypatch, legacy_dir, '<div id="mds-app" data-exchange=""></div>')

    resp = client.get("/api/market-data/status-monitor/bybit")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'data-exchange="bybit"' in resp.text


def test_errors_clearly_when_no_build_and_no_legacy_exist(
    client: TestClient, legacy_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(monkeypatch, legacy_dir, None)

    resp = client.get("/api/market-data/status-monitor/binance")

    assert resp.status_code == 500
    assert "npm run build" in resp.text


def test_unknown_exchange_returns_404(client: TestClient) -> None:
    resp = client.get("/api/market-data/status-monitor/kraken")

    assert resp.status_code == 404
    assert "Unknown exchange" in resp.text
