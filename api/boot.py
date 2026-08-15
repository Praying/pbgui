"""Runtime boot script served at /api/boot.js for migrated Vue pages.

Replaces the per-page %%TOKEN%%-style string injections with a single
no-store script that publishes window.__BOOT__ for the frontend boot layer.
"""

import json
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from api.auth import SessionToken, _request_origin, optional_auth
from pbgui_purefunc import PBGUI_SERIAL, PBGUI_VERSION

router = APIRouter()


def _boot_payload(request: Request, session: SessionToken | None) -> dict[str, Any]:
    return {
        "token": session.token if session else "",
        "origin": _request_origin(request),
        "version": PBGUI_VERSION,
        "serial": PBGUI_SERIAL,
    }


@router.get("/api/boot.js")
def boot_js(request: Request, session: SessionToken | None = Depends(optional_auth)) -> Response:
    """Publish token/origin/version/serial for pages that load before login."""
    js = "window.__BOOT__=" + json.dumps(_boot_payload(request, session)) + ";"
    return Response(
        content=js,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )
