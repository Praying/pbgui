"""Optimize page routes: built Vue entry first, legacy template fallback."""
from pathlib import Path
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
import api.auth as auth
from api import optimize_v7, optimize_v8
from api.auth import SessionToken

SESSION = SessionToken(token='tok-1', user_id='root', created_at=0.0, expires_at=0.0)

@pytest.fixture
def clients() -> tuple[TestClient, TestClient]:
    app = FastAPI()

    def v7_page(request: Request):
        return optimize_v7.main_page(request=request, session=SESSION)

    def v8_page(request: Request):
        return optimize_v8.main_page(request=request, session=SESSION)

    app.get('/api/optimize-v7/main_page', include_in_schema=False)(v7_page)
    app.get('/api/optimize-v8/main_page', include_in_schema=False)(v8_page)
    return TestClient(app, raise_server_exceptions=False), TestClient(app, raise_server_exceptions=False)

def set_files(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, vue: str | None, legacy: str | None) -> None:
    vue_path = tmp_path / 'missing' / 'index.html'
    if vue is not None:
        vue_path = tmp_path / 'dist' / 'v7_optimize' / 'index.html'; vue_path.parent.mkdir(parents=True); vue_path.write_text(vue)
    legacy_path = tmp_path / 'missing' / 'v7_optimize.html'
    if legacy is not None:
        legacy_path = tmp_path / 'frontend' / 'v7_optimize.html'; legacy_path.parent.mkdir(parents=True); legacy_path.write_text(legacy)
    monkeypatch.setattr(auth, '_frontend_dist_path', lambda name: vue_path if name == 'v7_optimize' else tmp_path / 'missing' / 'index.html')
    monkeypatch.setattr(auth, '_frontend_template_path', lambda name: legacy_path if name == 'v7_optimize.html' else tmp_path / 'missing' / name)

def test_both_flavours_serve_shared_vue_build(clients, tmp_path, monkeypatch):
    set_files(monkeypatch, tmp_path, '<html>vue optimize</html>', '<html>legacy</html>')
    for client, path in zip(clients, ['/api/optimize-v7/main_page', '/api/optimize-v8/main_page']):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        assert 'vue optimize' in response.text

def test_legacy_fallback_keeps_v7_and_v8_placeholders(clients, tmp_path, monkeypatch):
    legacy = '<script>var TOKEN="%%TOKEN%%";var API_BASE="%%API_BASE%%";var WS_BASE="%%WS_BASE%%";var OV="%%OPTIMIZE_VERSION%%";var BV="%%BACKTEST_VERSION%%";var CURRENT="%%OPTIMIZE_NAV_CURRENT%%";var LIMITS=%%LIMITS_META%%;</script>'
    set_files(monkeypatch, tmp_path, None, legacy)
    monkeypatch.setattr(optimize_v7, 'get_optimize_limits_meta_payload', lambda: {'metrics': ['adg']})
    monkeypatch.setattr(optimize_v8, 'get_pb8_optimize_metadata', lambda: {'limits': {'metrics': ['adg']}})
    response7 = clients[0].get('/api/optimize-v7/main_page')
    response8 = clients[1].get('/api/optimize-v8/main_page')
    assert 'http://testserver/api/optimize-v7' in response7.text and 'var OV="v7"' in response7.text
    assert 'http://testserver/api/optimize-v8' in response8.text and 'var OV="v8"' in response8.text
    assert '%%' not in response7.text and '%%' not in response8.text

def test_missing_build_and_legacy_returns_build_hint(clients, tmp_path, monkeypatch):
    set_files(monkeypatch, tmp_path, None, None)
    response = clients[0].get('/api/optimize-v7/main_page')
    assert response.status_code == 500
    assert 'npm run build' in response.text and 'v7_optimize' in response.text

def test_v7_metadata_exposes_limits_contract(monkeypatch):
    """Vue editor receives the same limits metadata that legacy HTML injection used."""
    monkeypatch.setattr(optimize_v7, 'get_optimize_limits_meta_payload', lambda: {'metrics_by_group': {'all': ['adg']}})
    assert optimize_v7.get_metadata(SESSION) == {'metrics_by_group': {'all': ['adg']}}
