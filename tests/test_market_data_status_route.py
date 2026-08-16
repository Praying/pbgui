"""Market data status-monitor route: built Vue page only (M-data-8 retirement).

/api/market-data/status-monitor/{exchange} serves the built market_data_status
Vue page with the exchange injected into the mount element's data-exchange
attribute (the page itself falls back to the ?exchange= query param and the
status-monitor path segment for standalone loads).

History: until M-data-8 the legacy market_data_main.html consumed this URL as
a live FRAGMENT — it fetched the response, injected the HTML into
#status-monitor-host via innerHTML and re-executed the inline scripts on every
exchange switch (mountStatusMonitor, market_data_main.html:4142). That
contract required inline CLASSIC scripts, so the legacy template had to stay
the first serving branch: ES module bundles execute only once per document,
and re-injecting the Vue document would have left every remount after the
first blank (documented here since the migration). With market_data_main.html
retired, the Vue market_data page embeds this URL as a same-origin iframe
(useStatusMonitor), so the built page serves every consumer — and a checkout
without a build fails loudly with the npm build hint.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.market_data as market_data
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def status_monitor(exchange: str, request: Request):
        return market_data.get_market_data_status_monitor(
            exchange=exchange, request=request, session=SESSION
        )

    app.get("/api/market-data/status-monitor/{exchange}", include_in_schema=False)(status_monitor)
    return TestClient(app, raise_server_exceptions=False)


def _set_dist(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, text: str | None) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if text is not None:
        vue_index = tmp_path / "dist-vue" / "index.html"
        vue_index.parent.mkdir(exist_ok=True)
        vue_index.write_text(text, encoding="utf-8")
    monkeypatch.setattr(market_data, "_frontend_dist_path", lambda page: vue_index)


def test_serves_built_vue_page_with_exchange_injected(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(
        monkeypatch,
        tmp_path,
        '<html><body><div id="mds-app" data-exchange=""></div></body></html>',
    )

    resp = client.get("/api/market-data/status-monitor/bybit")

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert 'data-exchange="bybit"' in resp.text
    assert 'id="mds-app"' in resp.text


def test_lowercases_the_exchange_before_injecting(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(monkeypatch, tmp_path, '<div id="mds-app" data-exchange=""></div>')

    resp = client.get("/api/market-data/status-monitor/BINANCEUSDM")

    assert resp.status_code == 200
    assert 'data-exchange="binanceusdm"' in resp.text


def test_errors_clearly_when_no_build_exists(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_dist(monkeypatch, tmp_path, None)

    resp = client.get("/api/market-data/status-monitor/binance")

    assert resp.status_code == 500
    assert "npm run build" in resp.text


def test_unknown_exchange_returns_404(client: TestClient) -> None:
    resp = client.get("/api/market-data/status-monitor/kraken")

    assert resp.status_code == 404
    assert "Unknown exchange" in resp.text
