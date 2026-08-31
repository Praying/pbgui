"""Chinese (ZH) help docs endpoints: /api/help/* and /api/docs/*.

The four handlers (PBApiServer.py) must resolve ``lang=ZH`` to the
``docs/help_zh/`` and ``docs/strategy_explorer_zh/`` directories while
keeping the existing EN/DE behavior and the path-traversal guards.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

import PBApiServer
from api.auth import SessionToken

SESSION = SessionToken(token="tok-1", user_id="root", created_at=0.0, expires_at=0.0)


def _zh_client() -> TestClient:
    """A minimal FastAPI app exposing the four real help/docs handlers."""
    app = FastAPI()

    async def help_index(lang: str = "EN"):
        return await PBApiServer.help_index(lang=lang, session=SESSION)

    async def help_content(file: str, lang: str = "EN"):
        return await PBApiServer.help_content(file=file, lang=lang, session=SESSION)

    async def docs_index(lang: str = "EN"):
        return await PBApiServer.docs_index(lang=lang, session=SESSION)

    async def docs_content(file: str, lang: str = "EN"):
        return await PBApiServer.docs_content(file=file, lang=lang, session=SESSION)

    app.get("/api/help/index")(help_index)
    app.get("/api/help/content")(help_content)
    app.get("/api/docs/index")(docs_index)
    app.get("/api/docs/content")(docs_content)
    return TestClient(app, raise_server_exceptions=False)


def _has_cjk(text: str) -> bool:
    """True when the text contains at least one CJK ideograph."""
    return any("\u4e00" <= char <= "\u9fff" for char in text)


def test_help_index_zh_returns_chinese_titles() -> None:
    resp = _zh_client().get("/api/help/index?lang=ZH")

    assert resp.status_code == 200
    topics = resp.json()
    assert topics, "ZH index must not be empty"
    overview = next(t for t in topics if t["file"] == "00_overview.md")
    assert _has_cjk(overview["title"]), "ZH topic title must be Chinese"
    categories = {t["category"] for t in topics}
    assert categories == {"Help", "Strategy Explorer"}


def test_help_content_zh_returns_chinese_markdown() -> None:
    resp = _zh_client().get("/api/help/content?file=00_overview.md&lang=ZH")

    assert resp.status_code == 200
    assert _has_cjk(resp.json()["content"])


def test_help_content_zh_resolves_strategy_explorer_folder() -> None:
    resp = _zh_client().get(
        "/api/help/content?file=00_strategy_explorer_help.md&lang=ZH"
    )

    assert resp.status_code == 200
    assert _has_cjk(resp.json()["content"])


def test_docs_index_and_content_zh() -> None:
    client = _zh_client()

    index = client.get("/api/docs/index?lang=ZH")
    assert index.status_code == 200
    overview = next(t for t in index.json() if t["file"] == "00_overview.md")
    assert _has_cjk(overview["title"])

    content = client.get("/api/docs/content?file=00_overview.md&lang=ZH")
    assert content.status_code == 200
    assert _has_cjk(content.json()["content"])


def test_unknown_lang_still_falls_back_to_english() -> None:
    resp = _zh_client().get("/api/help/index?lang=XX")

    assert resp.status_code == 200
    overview = next(t for t in resp.json() if t["file"] == "00_overview.md")
    assert overview["title"] == "Help Overview"


def test_path_traversal_rejected_in_zh_mode() -> None:
    resp = _zh_client().get(
        "/api/help/content?file=..%2F..%2FPBApiServer.py&lang=ZH"
    )

    assert resp.status_code == 400
