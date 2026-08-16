"""Balance Calculator page route: Vue build first, legacy fallback.

/api/balance-calc/main_page serves the built balance_calc Vue page when the
dist output exists, falls back to the legacy template with its server-side
injections for checkouts without a build, and fails with the npm build hint
when neither file exists. Also locks the Vue exchange mirror against the API
constant (the legacy %%EXCHANGES%% injection's successor).
"""

import json
import re
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth
import api.balance_calc as balance_calc
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)
ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    def main_page(
        request: Request,
        instance: str = "",
        instance_version: str = "",
        draft_id: str = "",
        exchange: str = "",
    ):
        return balance_calc.get_main_page(
            request=request,
            instance=instance,
            instance_version=instance_version,
            draft_id=draft_id,
            exchange=exchange,
            session=SESSION,
        )

    app.get("/api/balance-calc/main_page", include_in_schema=False)(main_page)
    return TestClient(app, raise_server_exceptions=False)


def _set_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    vue_text: str | None,
    legacy_text: str | None,
) -> None:
    vue_index = tmp_path / "missing" / "index.html"
    if vue_text is not None:
        vue_index = tmp_path / "dist" / "balance_calc" / "index.html"
        vue_index.parent.mkdir(parents=True, exist_ok=True)
        vue_index.write_text(vue_text, encoding="utf-8")
    legacy_path = tmp_path / "missing" / "balance_calc.html"
    if legacy_text is not None:
        legacy_path = tmp_path / "frontend" / "balance_calc.html"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(legacy_text, encoding="utf-8")
    monkeypatch.setattr(auth, "_frontend_dist_path", lambda name: vue_index if name == "balance_calc" else tmp_path / "missing" / "index.html")
    monkeypatch.setattr(auth, "_frontend_template_path", lambda name: legacy_path if name == "balance_calc.html" else tmp_path / "missing" / name)


def test_serves_built_vue_page(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, "<html>vue balance calc</html>", "<html>legacy</html>")

    resp = client.get("/api/balance-calc/main_page", params={"instance": "main", "draft_id": "d1"})

    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    assert "vue balance calc" in resp.text


def test_falls_back_to_legacy_template_with_injections(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy = (
        '<html><script>var API_BASE = "%%API_BASE%%"; var INIT_INSTANCE = "%%INSTANCE%%";'
        ' var DRAFT_ID = "%%DRAFT_ID%%"; var EXCHANGES = "%%EXCHANGES%%";</script></html>'
    )
    _set_files(monkeypatch, tmp_path, None, legacy)

    resp = client.get("/api/balance-calc/main_page", params={"instance": "main", "draft_id": "d1", "exchange": "bybit"})

    assert resp.status_code == 200
    assert '"http://testserver/api/balance-calc"' in resp.text
    assert '"main"' in resp.text
    assert '"d1"' in resp.text
    assert json.dumps(balance_calc.EXCHANGES) in resp.text
    assert "%%" not in resp.text


def test_errors_clearly_when_no_build_and_no_legacy(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_files(monkeypatch, tmp_path, None, None)

    resp = client.get("/api/balance-calc/main_page")

    assert resp.status_code == 500
    assert "npm run build" in resp.text
    assert "balance_calc" in resp.text


def test_vue_exchange_mirror_matches_the_api_constant() -> None:
    """The Vue config.ts exchange list replaces the %%EXCHANGES%% injection."""

    config = (ROOT / "frontend" / "src" / "pages" / "balance_calc" / "config.ts").read_text(encoding="utf-8")
    match = re.search(r"export const EXCHANGES = (\[[^\]]+\])", config)
    assert match is not None
    assert json.loads(match.group(1).replace("'", '"')) == balance_calc.EXCHANGES
