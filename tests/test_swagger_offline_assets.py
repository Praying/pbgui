"""Verify that the API documentation uses locally served Swagger assets."""

from pathlib import Path

from fastapi.testclient import TestClient

import PBApiServer
from api.auth import require_auth

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_swagger_route_disables_fastapi_cdn_defaults() -> None:
    """Authenticated Swagger HTML must reference only local assets."""
    PBApiServer.app.dependency_overrides[require_auth] = lambda: object()
    try:
        response = TestClient(PBApiServer.app, root_path="/pbgui").get("/docs")
    finally:
        PBApiServer.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "cdn.jsdelivr.net" not in response.text
    assert "fastapi.tiangolo.com" not in response.text
    assert "/pbgui/openapi.json" in response.text
    assert "/pbgui/app/vendor/swagger-ui/swagger-ui-bundle.js" in response.text
    assert "/pbgui/app/vendor/swagger-ui/swagger-ui.css" in response.text
    assert "/pbgui/app/vendor/swagger-ui/pbgui-swagger.css" in response.text


def test_swagger_and_openapi_require_authentication() -> None:
    """Unauthenticated clients must not receive API documentation."""
    client = TestClient(PBApiServer.app)

    assert client.get("/docs", follow_redirects=False).status_code == 401
    assert client.get("/openapi.json", follow_redirects=False).status_code == 401


def test_swagger_assets_are_vendored() -> None:
    """The local Swagger bundle and stylesheet must be available below /app."""
    asset_root = PROJECT_ROOT / "frontend" / "vendor" / "swagger-ui"

    assert (asset_root / "swagger-ui-bundle.js").is_file()
    assert (asset_root / "swagger-ui-bundle.js.LICENSE.txt").is_file()
    assert (asset_root / "swagger-ui.css").is_file()
    assert (asset_root / "pbgui-swagger.css").is_file()
    assert (asset_root / "README.md").is_file()
