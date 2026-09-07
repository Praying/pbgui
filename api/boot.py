"""Runtime boot script served at /api/boot.js for migrated Vue pages.

Publishes window.__BOOT__ for the frontend boot layer: the API origin, the
trusted ASGI mount prefix, and version/serial. Authentication travels in the
HttpOnly same-origin session cookie, so no session token is exposed here.
"""

import json
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from api.auth import SessionToken, _request_origin, optional_auth
from pbgui_purefunc import PBGUI_SERIAL, PBGUI_VERSION

router = APIRouter()


def _trusted_mount_prefix(request: Request) -> str:
    """Return the validated ASGI root_path prefix ("" when unmounted)."""
    root_path = request.scope.get("root_path", "")
    if not isinstance(root_path, str):
        return ""
    prefix = root_path.rstrip("/")
    if not prefix:
        return ""
    if (
        not prefix.startswith("/")
        or prefix.startswith("//")
        or "\\" in prefix
        or any(ord(char) < 32 or ord(char) == 127 for char in prefix)
        or any(part in {".", ".."} for part in prefix.split("/"))
    ):
        return ""
    return prefix


def _boot_payload(request: Request, session: SessionToken | None) -> dict[str, Any]:
    return {
        "origin": _request_origin(request),
        "base_prefix": _trusted_mount_prefix(request),
        "authenticated": session is not None,
        "version": PBGUI_VERSION,
        "serial": PBGUI_SERIAL,
    }


@router.get("/api/boot.js")
def boot_js(request: Request, session: SessionToken | None = Depends(optional_auth)) -> Response:
    """Publish origin/prefix/auth/version/serial for pages that load before login."""
    js = "window.__BOOT__=" + json.dumps(_boot_payload(request, session)) + ";"
    return Response(
        content=js,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )
