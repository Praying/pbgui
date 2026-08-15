"""GET /api/boot.js must return a no-store JS payload with boot fields."""

import json

from fastapi.testclient import TestClient

import PBApiServer
import api.auth as auth


def _client() -> TestClient:
    return TestClient(PBApiServer.app, raise_server_exceptions=False)


def _payload(response) -> dict:
    body = response.text
    assert body.startswith("window.__BOOT__=")
    assert body.endswith(";")
    return json.loads(body.removeprefix("window.__BOOT__=").removesuffix(";"))


def test_boot_js_returns_boot_payload() -> None:
    resp = _client().get("/api/boot.js")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/javascript")
    assert resp.headers["cache-control"] == "no-store"
    payload = _payload(resp)
    assert {"token", "origin", "version", "serial"} <= set(payload)


def test_boot_js_token_empty_without_auth() -> None:
    payload = _payload(_client().get("/api/boot.js"))
    assert payload["token"] == ""


def test_boot_js_exposes_valid_session_token(tmp_path, monkeypatch) -> None:
    """A request with a valid session receives its real token."""
    monkeypatch.setattr(auth, "PBGDIR", str(tmp_path))
    session = auth.generate_token("welcome:test", expires_in_seconds=60)

    resp = _client().get("/api/boot.js", headers={"Authorization": f"Bearer {session.token}"})
    payload = _payload(resp)

    assert resp.status_code == 200
    assert payload["token"] == session.token
