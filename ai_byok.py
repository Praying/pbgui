"""Bring-your-own-key model endpoints for the AI chat (OpenAI Chat Completions / Responses)."""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import aiohttp

from file_lock import advisory_file_lock
from secure_files import atomic_write_private_text, read_regular_file_nofollow

PROVIDER = "custom"
PROTOCOLS = ("chat", "responses")
MAX_MODELS = 32
MAX_EFFORTS = 16
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,127}$")
_EFFORT_ID = re.compile(r"^[A-Za-z0-9_.\-]{1,32}$")
_STORE_FILE = "custom-models.json"
_LEGACY_SUFFIX = ".custom.json"
_LEGACY_OWNER = re.compile(r"^[0-9a-f]{32}$")
_NO_KEY = "no-key"
_TEST_PROMPT = "Connection test. Reply briefly with: PBGui connection OK"


class CustomModelError(ValueError):
    """User-correctable custom endpoint configuration error."""


def _bounded_int(value: object, name: str, low: int, high: int) -> int:
    """Return one integer inside a closed range, rejecting booleans and text."""
    if type(value) is not int or not low <= value <= high:
        raise CustomModelError(f"{name} must be a whole number between {low} and {high}")
    return value


def normalize_base_url(value: object) -> str:
    """Accept only a plain http(s) endpoint root, without credentials, query or fragment."""
    text = str(value or "").strip().rstrip("/")
    if not text or len(text) > 512 or any(ord(char) < 33 or ord(char) == 127 for char in text):
        raise CustomModelError("Base URL is required and must not contain spaces or control characters")
    try:
        parts = urlsplit(text)
        host = parts.hostname
        parts.port  # noqa: B018 - validates the port range
    except ValueError as exc:
        raise CustomModelError("Base URL is invalid") from exc
    if parts.scheme not in {"http", "https"} or not host:
        raise CustomModelError("Base URL must start with http:// or https://")
    if parts.username is not None or parts.password is not None or parts.query or parts.fragment:
        raise CustomModelError("Base URL must not contain credentials, a query string or a fragment")
    return text


def normalize_entry(raw: object) -> dict[str, Any]:
    """Validate one model configuration submitted by the browser (key handled separately)."""
    if not isinstance(raw, dict):
        raise CustomModelError("Invalid model configuration")
    model = str(raw.get("model") or "").strip()
    if not _MODEL_ID.match(model):
        raise CustomModelError("Model name is required (letters, digits and . _ : / @ + - only)")
    protocol = str(raw.get("protocol") or "")
    if protocol not in PROTOCOLS:
        raise CustomModelError("Protocol must be 'chat' (Chat Completions) or 'responses'")
    context = _bounded_int(raw.get("context"), "Context size", 1024, 10_000_000)
    output = _bounded_int(raw.get("output_limit"), "Output size", 1, 10_000_000)
    if output >= context:
        raise CustomModelError("Output size must be smaller than the context size")
    efforts: list[str] = []
    raw_efforts = raw.get("reasoning_efforts") or []
    if not isinstance(raw_efforts, list) or len(raw_efforts) > MAX_EFFORTS:
        raise CustomModelError("Thinking levels must be a short list")
    for item in raw_efforts:
        effort = str(item).strip()
        if not _EFFORT_ID.match(effort):
            raise CustomModelError("Thinking level names may only use letters, digits and . _ -")
        if effort not in efforts:
            efforts.append(effort)
    name = str(raw.get("name") or model).strip()[:80] or model
    if any(ord(char) < 32 for char in name):
        raise CustomModelError("Display name must not contain control characters")
    return {
        "model": model,
        "name": name,
        "base_url": normalize_base_url(raw.get("base_url")),
        "protocol": protocol,
        "context": context,
        "output_limit": output,
        "image_input": bool(raw.get("image_input")),
        "tools": raw.get("tools", True) is not False,
        "reasoning_efforts": efforts,
    }


def _api_key(value: object) -> str:
    """Return a bounded control-character-free key; an empty key means an open endpoint."""
    key = str(value or "").strip()
    if len(key) > 1024 or any(ord(char) < 32 or ord(char) == 127 for char in key):
        raise CustomModelError("Invalid API key")
    return key


def public_model(entry: dict[str, Any]) -> dict[str, Any]:
    """Project a stored entry into the model shape the chat UI and adapters consume."""
    variants = [
        {"id": effort, "label": effort, "description": "", "type": "effort", "value": effort}
        for effort in entry["reasoning_efforts"]
    ]
    return {
        "id": entry["model"],
        "name": entry["name"],
        "default": False,
        "protocol": entry["protocol"],
        "retention": "Your endpoint",
        "training": False,
        "free": False,
        "cost": {},
        "image_input": entry["image_input"],
        "reasoning": bool(variants),
        "reasoning_variants": variants,
        "context": entry["context"],
        "output_limit": entry["output_limit"],
        "tools": entry["tools"],
        "loop_tool_support": False,
        "base_url": entry["base_url"],
        "has_key": bool(entry.get("api_key")),
    }


class CustomModelStore:
    """Instance-wide storage for user-defined model endpoints, including their API keys.

    AI owners derive from the client address of each login, so a per-owner
    file hid a configured endpoint from every other browser or network path
    of the same PBGui operator. Endpoints are server configuration, like the
    exchange API keys, and live in one file shared by every session.
    """

    def __init__(self, root: Path, lock_target: Path) -> None:
        """Share the credential root and lock with the other AI providers."""
        self.root = Path(root)
        self.lock_target = lock_target
        self.path = self.root / _STORE_FILE

    def _load(self, path: Path) -> list[dict[str, Any]]:
        """Parse one stored file; an unreadable payload counts as empty."""
        try:
            payload = json.loads(read_regular_file_nofollow(path, self.root).decode("utf-8"))
            rows = payload["models"]
            return [{**normalize_entry(row), "api_key": _api_key(row.get("api_key"))} for row in rows]
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, CustomModelError):
            return []

    def _legacy_paths(self) -> list[Path]:
        """Per-owner files written before endpoints were shared, newest first."""
        paths = [
            path for path in self.root.glob(f"*{_LEGACY_SUFFIX}")
            if _LEGACY_OWNER.match(path.name[:-len(_LEGACY_SUFFIX)]) and path.is_file() and not path.is_symlink()
        ]
        return sorted(paths, key=lambda path: path.stat().st_mtime, reverse=True)

    def _read(self) -> list[dict[str, Any]]:
        """Load stored entries, adopting legacy per-owner files once; callers hold the lock."""
        if self.path.is_symlink():
            return []
        if self.path.is_file():
            return self._load(self.path)
        legacy = self._legacy_paths()
        rows: list[dict[str, Any]] = []
        for path in legacy:
            for row in self._load(path):
                if len(rows) < MAX_MODELS and all(item["model"] != row["model"] for item in rows):
                    rows.append(row)
        if rows:
            self._write(rows)
            for path in legacy:
                path.unlink(missing_ok=True)
        return rows

    def _write(self, rows: list[dict[str, Any]]) -> None:
        """Atomically persist entries; callers hold the lock."""
        if not rows:
            self.path.unlink(missing_ok=True)
            return
        atomic_write_private_text(self.path, json.dumps({"provider": PROVIDER, "models": rows}, indent=4) + "\n")

    def configured(self) -> bool:
        """Return whether at least one custom model exists."""
        return bool(self.entries())

    def entries(self) -> list[dict[str, Any]]:
        """Return stored entries including keys, for trusted server-side use only."""
        with advisory_file_lock(self.lock_target):
            return self._read()

    def get(self, model: str) -> dict[str, Any] | None:
        """Return one entry including its key, or None."""
        return next((row for row in self.entries() if row["model"] == model), None)

    def models(self) -> list[dict[str, Any]]:
        """Return key-free model projections, with the first one marked as default."""
        rows = [public_model(row) for row in self.entries()]
        if rows:
            rows[0]["default"] = True
        return rows

    def save(self, raw: object, api_key: object, original: str = "") -> dict[str, Any]:
        """Add or replace one entry; a blank key keeps the key already stored for it."""
        entry = normalize_entry(raw)
        key = _api_key(api_key)
        with advisory_file_lock(self.lock_target):
            rows = self._read()
            previous = next((row for row in rows if row["model"] == original), None) if original else None
            if original and previous is None:
                raise CustomModelError("Custom model not found")
            if not key and previous is not None:
                key = previous["api_key"]
            if (previous is None or entry["model"] != original) and any(row["model"] == entry["model"] for row in rows):
                raise CustomModelError("A custom model with this name already exists")
            if previous is None and len(rows) >= MAX_MODELS:
                raise CustomModelError(f"At most {MAX_MODELS} custom models are supported")
            stored = {**entry, "api_key": key}
            if previous is None:
                rows.append(stored)
            else:
                rows[rows.index(previous)] = stored
            self._write(rows)
        return public_model(stored)

    def delete(self, model: str) -> bool:
        """Remove one entry; return whether it existed."""
        with advisory_file_lock(self.lock_target):
            rows = self._read()
            kept = [row for row in rows if row["model"] != model]
            if len(kept) != len(rows):
                self._write(kept)
            return len(kept) != len(rows)


def _auth_headers(key: str) -> dict[str, str]:
    """Plain OpenAI-style auth; local servers that need no key get a placeholder."""
    return {"Authorization": f"Bearer {key or _NO_KEY}", "User-Agent": "pbgui-ai/1.0"}


async def check_connection(service: Any, store: CustomModelStore, raw: object,
                          api_key: object, original: str = "", effort: str = "") -> dict[str, Any]:
    """Send one tiny fixed prompt to the configured endpoint; never raises for endpoint failures."""
    from ai_chat import AIChatError, AIChatService

    entry = normalize_entry(raw)
    key = _api_key(api_key)
    if not key:
        stored = store.get(original or entry["model"])
        key = stored["api_key"] if stored else ""
    if effort and effort not in entry["reasoning_efforts"]:
        raise CustomModelError("Selected thinking level is not configured for this model")
    base = entry["base_url"]
    if entry["protocol"] == "responses":
        url, body = f"{base}/responses", {"model": entry["model"], "input": _TEST_PROMPT,
                                          "max_output_tokens": 256}
        if effort:
            body["reasoning"] = {"effort": effort}
    else:
        url, body = f"{base}/chat/completions", {
            "model": entry["model"], "messages": [{"role": "user", "content": _TEST_PROMPT}],
            "max_tokens": 256}
        if effort:
            body["reasoning_effort"] = effort
    started = time.monotonic()
    result = {"model": entry["model"], "protocol": entry["protocol"], "effort": effort,
              "url": url, "ok": False, "reply": "", "error": ""}
    try:
        session = await service._http_session()
        async with asyncio.timeout(45):
            async with session.post(url, headers=_auth_headers(key), json=body,
                                    allow_redirects=False) as response:
                if 300 <= response.status < 400:
                    raise AIChatError("Endpoint redirected the request; use its final base URL")
                payload = await service._read_json_response(
                    response, expected_status=200, max_bytes=512 * 1024)
        text = (AIChatService._response_text(payload) if entry["protocol"] == "responses"
                else AIChatService._chat_completion_text(payload))
        if not isinstance(payload, dict) or not (
                "choices" in payload or "output" in payload or "output_text" in payload):
            raise AIChatError(f"Endpoint did not answer in the {entry['protocol']} format")
        result.update(ok=True, reply=text[:500])
    except AIChatError as exc:
        result["error"] = str(exc)
    except TimeoutError:
        result["error"] = "Endpoint did not answer within 45 seconds"
    except aiohttp.ClientError as exc:
        result["error"] = f"Could not reach endpoint ({type(exc).__name__})"
    result["elapsed_seconds"] = round(time.monotonic() - started, 2)
    return result
