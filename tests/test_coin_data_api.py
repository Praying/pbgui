"""Focused pool-readiness contracts for the Coin Data API."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import api.coin_data as coin_data_api
from tests.i18n_helpers import assert_text_present
import api.services as services_api


class _FakeCoinData:
    """Minimal CoinData state source with a secret-free configurable pool status."""

    def __init__(self, ready: bool) -> None:
        self.cmc_pool_ready = ready
        self.exchanges = ["binance"]
        self.exchange = "binance"
        self.market_cap = 0.0
        self.vol_mcap = 10.0
        self.tags = []
        self.only_cpt = False
        self.notices_ignore = False

    def cmc_pool_status(self) -> dict:
        """Return the same non-sensitive shape as the real pool."""
        return {
            "ready": self.cmc_pool_ready,
            "active_credentials": 1 if self.cmc_pool_ready else 0,
            "keys": [{"id": "cmc_test", "status": "active"}] if self.cmc_pool_ready else [],
        }

    def load_exchange_mapping(self, _exchange: str) -> list:
        """Return no exchange rows for isolated state construction."""
        return []

    def build_mapping(self, _exchange: str) -> None:
        """Avoid external mapping work."""

    def update_prices(self, _exchange: str) -> None:
        """Avoid external price work."""

    def get_mapping_tags(self, _exchange: str, *, quote_filter: list[str]) -> list:
        """Return no tags for an empty mapping."""
        return []

    def filter_mapping_rows(self, **_kwargs) -> list:
        """Return no filtered rows for an empty mapping."""
        return []


def _payload() -> coin_data_api.CoinDataRefreshRequest:
    """Build the established empty refresh request."""
    return coin_data_api.CoinDataRefreshRequest()


@pytest.mark.parametrize("handler", [coin_data_api.refresh_cmc, coin_data_api.refresh_cmc_all])
def test_cmc_refresh_rejects_before_job_creation_without_active_local_key(monkeypatch, handler) -> None:
    """CMC refresh routes return 409 and create no job when the local pool is empty."""
    created = []
    monkeypatch.setattr(coin_data_api, "_new_coindata", lambda **kwargs: _FakeCoinData(False))
    monkeypatch.setattr(coin_data_api, "_start_refresh_job", lambda *args: created.append(args))

    with pytest.raises(HTTPException) as exc_info:
        handler(_payload(), SimpleNamespace())

    assert exc_info.value.status_code == 409
    assert created == []


@pytest.mark.parametrize("handler", [coin_data_api.refresh_cmc, coin_data_api.refresh_cmc_all])
def test_cmc_refresh_accepts_active_local_key_without_lease(monkeypatch, handler) -> None:
    """Readiness depends on active local materialization, not lease availability."""
    monkeypatch.setattr(coin_data_api, "_new_coindata", lambda **kwargs: _FakeCoinData(True))
    monkeypatch.setattr(coin_data_api, "_start_refresh_job", lambda *args: "existing-contract-job")

    assert handler(_payload(), SimpleNamespace()) == {
        "ok": True,
        "job_id": "existing-contract-job",
    }


def test_state_contains_secret_free_pool_readiness(monkeypatch, tmp_path: Path) -> None:
    """State exposes readiness and diagnostics without any stored credential value."""
    coindata_dir = tmp_path / "coindata"
    coindata_dir.mkdir()
    monkeypatch.setattr(coin_data_api, "COINDATA_DIR", coindata_dir)
    monkeypatch.setattr(coin_data_api, "_new_coindata", lambda **kwargs: _FakeCoinData(True))

    state = coin_data_api._build_state()

    assert state["cmc_pool"]["ready"] is True
    serialized = json.dumps(state)
    assert "api_key" not in serialized
    assert "secret" not in serialized


def test_services_key_status_uses_pool_without_legacy_api_key(monkeypatch) -> None:
    """Services status no longer blocks a pool-backed request on an empty compatibility property."""
    monkeypatch.setattr(
        services_api,
        "_cmc_pool_payload",
        lambda: {
            "ready": True,
            "active_credentials": 1,
            "keys": [{"provider_remaining": 9996}],
        },
    )

    result = services_api.get_pbcoindata_key_status(SimpleNamespace())

    assert result["ok"] is True
    assert result["keys"][0]["provider_remaining"] == 9996
    assert "api_key" not in json.dumps(result)


def test_coin_data_frontend_gates_only_cmc_refresh_and_keeps_cached_state() -> None:
    """The page consumes pool readiness, preserves cached views, and shows exact rejection detail.

    Re-pointed at the Vue sources with the coin_data migration: the store
    (useCoinDataState.ts) consumes the pool status, SidebarPanel.vue binds the
    CMC-button gating, useRefreshJobs.ts formats the rejection detail, and
    App.vue wires the refresh buttons.
    """
    root = Path(__file__).resolve().parent.parent
    page = root / "frontend" / "src" / "pages" / "coin_data"
    store = (page / "composables" / "useCoinDataState.ts").read_text(encoding="utf-8")
    sidebar = (page / "components" / "SidebarPanel.vue").read_text(encoding="utf-8")
    refresh = (page / "composables" / "useRefreshJobs.ts").read_text(encoding="utf-8")
    app = (page / "App.vue").read_text(encoding="utf-8")
    en = json.loads((root / "frontend" / "i18n" / "en.json").read_text(encoding="utf-8"))

    # pool readiness drives the status line (loadState :2173-2175)
    assert "data.cmc_pool || {}" in store
    assert "pool.ready ? t('market.ready')" in store
    # CMC-only gating: both CMC buttons disabled without a materialized key,
    # the exchange refresh stays enabled (renderSidebarMeta :2283-2291)
    assert ':disabled="!hasMaterializedCmcKey"' in sidebar
    assert 'id="btn-refresh-cmc"' in sidebar
    assert 'id="btn-refresh-exchange"' in sidebar
    assert ':disabled' not in sidebar.split('id="btn-refresh-exchange"')[1].split(">")[0]
    assert_text_present(en["market.cachedCoinDataReadable"], "Cached Coin Data remains readable.")
    assert_text_present(en["market.cachedCoinDataAvailable"], "Cached Coin Data remains available.")
    # exact rejection detail surfaces (runRefresh :2246-2248)
    assert "${error.status}: ${error.detail}" in refresh
    # the refresh buttons stay wired (bindControls :3085-3096)
    assert "@refresh-exchange" in app
