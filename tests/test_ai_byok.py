"""Offline contracts for bring-your-own-key AI model endpoints."""

from __future__ import annotations

import asyncio
import json

import pytest

from ai_byok import CustomModelError, CustomModelStore, check_connection, normalize_base_url, normalize_entry
from ai_chat import AIChatService, AIChatError, owner_key

OWNER = owner_key("alice")


def _config(**changes):
    base = {"model": "my-model", "name": "Mine", "base_url": "http://127.0.0.1:8000/v1/", "protocol": "chat",
            "context": 32768, "output_limit": 4096, "image_input": True, "reasoning_efforts": ["low", "high"]}
    return {**base, **changes}


def _store(tmp_path):
    return CustomModelStore(tmp_path, tmp_path / ".locks" / "credentials")


CREDENTIALED = "https://" + "name" + ":" + "secret" + "@host/v1"
_UNSAFE_URLS = ["ftp://host/v1", CREDENTIALED, "https://host/v1?a=1", "https://host/v1#f", "host/v1", "", "http://a b/"]


@pytest.mark.parametrize("url", _UNSAFE_URLS)
def test_base_url_rejects_unsafe_shapes(url):
    with pytest.raises(CustomModelError):
        normalize_base_url(url)


def test_base_url_is_trimmed():
    assert normalize_base_url(" https://api.example.com/v1/ ") == "https://api.example.com/v1"


@pytest.mark.parametrize("changes", [{"protocol": "messages"}, {"context": 100}, {"output_limit": 40000},
                                     {"context": True}, {"model": "bad name"}, {"reasoning_efforts": ["a b"]}])
def test_entry_validation(changes):
    with pytest.raises(CustomModelError):
        normalize_entry(_config(**changes))


def test_store_keeps_key_private_and_reuses_it_when_blank(tmp_path):
    store = _store(tmp_path)
    public = store.save(OWNER, _config(), "sk-secret-value-123456")
    assert public["id"] == "my-model" and public["has_key"] and "api_key" not in public
    assert public["reasoning_variants"][0] == {"id": "low", "label": "low", "description": "", "type": "effort", "value": "low"}
    store.save(OWNER, _config(context=65536), "", original="my-model")
    assert store.get(OWNER, "my-model")["api_key"] == "sk-secret-value-123456"
    assert store.get(OWNER, "my-model")["context"] == 65536
    path = tmp_path / f"{OWNER}.custom.json"
    assert oct(path.stat().st_mode & 0o777) == "0o600"
    assert store.models(OWNER)[0]["default"] is True


def test_store_rejects_duplicates_and_deletes(tmp_path):
    store = _store(tmp_path)
    store.save(OWNER, _config(), "")
    with pytest.raises(CustomModelError):
        store.save(OWNER, _config(), "")
    assert store.delete(OWNER, "my-model") and not store.configured(OWNER)
    assert not (tmp_path / f"{OWNER}.custom.json").exists()


class _Response:
    def __init__(self, status, payload):
        self.status, self.payload = status, payload
        self.content = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def iter_chunked(self, size):
        yield json.dumps(self.payload).encode()


class _Session:
    def __init__(self, response):
        self.response, self.calls = response, []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class _Service:
    _read_json_response = staticmethod(AIChatService._read_json_response)

    def __init__(self, response):
        self.session = _Session(response)

    async def _http_session(self):
        return self.session


def _run(coro):
    return asyncio.run(coro)


def test_connection_chat_protocol(tmp_path):
    service = _Service(_Response(200, {"choices": [{"message": {"content": "PBGui connection OK"}}]}))
    result = _run(check_connection(service, _store(tmp_path), OWNER, _config(), "sk-secret-value-123456", effort="high"))
    url, kwargs = service.session.calls[0]
    assert result["ok"] and result["reply"] == "PBGui connection OK"
    assert url == "http://127.0.0.1:8000/v1/chat/completions"
    assert kwargs["json"]["reasoning_effort"] == "high" and kwargs["allow_redirects"] is False
    assert kwargs["headers"]["Authorization"] == "Bearer sk-secret-value-123456"
    assert "sk-secret" not in json.dumps(result)


def test_connection_responses_protocol(tmp_path):
    payload = {"output": [{"type": "message", "content": [{"type": "output_text", "text": "OK"}]}]}
    service = _Service(_Response(200, payload))
    result = _run(check_connection(service, _store(tmp_path), OWNER, _config(protocol="responses"), ""))
    url, kwargs = service.session.calls[0]
    assert result["ok"] and url.endswith("/v1/responses") and "max_output_tokens" in kwargs["json"]
    assert kwargs["headers"]["Authorization"] == "Bearer no-key"


def test_connection_reports_wrong_format_and_http_errors(tmp_path):
    wrong = _run(check_connection(_Service(_Response(200, {"hello": 1})), _store(tmp_path), OWNER, _config(), ""))
    assert not wrong["ok"] and "format" in wrong["error"]
    denied = _run(check_connection(_Service(_Response(401, {"error": {"message": "bad key"}})), _store(tmp_path), OWNER, _config(), ""))
    assert not denied["ok"] and denied["error"]


def test_connection_rejects_unconfigured_effort(tmp_path):
    with pytest.raises(CustomModelError):
        _run(check_connection(_Service(_Response(200, {})), _store(tmp_path), OWNER, _config(), "", effort="max"))


def test_service_exposes_custom_models(tmp_path):
    service = AIChatService(tmp_path)
    _run(service.save_custom_model(OWNER, _config(), "sk-secret-value-123456"))
    models = _run(service.models(OWNER, "custom"))
    assert models[0]["id"] == "my-model" and models[0]["protocol"] == "chat" and models[0]["image_input"] is True
    assert _run(service.status(OWNER))["providers"]["custom"]["connected"] is True
    assert service._validate_selection_preference({"provider": "custom", "model": "my-model"})["provider"] == "custom"
    with pytest.raises(AIChatError):
        _run(service.save_custom_model(OWNER, _config(protocol="x"), ""))
    _run(service.delete_custom_model(OWNER, "my-model"))
    with pytest.raises(AIChatError):
        _run(service.models(OWNER, "custom"))


@pytest.mark.parametrize("protocol,path,reply", [
    ("chat", "/chat/completions", {"choices": [{"message": {"content": "hi"}, "finish_reason": "stop"}]}),
    ("responses", "/responses", {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "hi"}]}]}),
])
def test_chat_turn_uses_the_configured_endpoint_key_and_effort(tmp_path, protocol, path, reply):
    service = AIChatService(tmp_path)
    _run(service.save_custom_model(OWNER, _config(protocol=protocol, tools=False), "sk-secret-value-123456"))
    fake = _Session(_Response(200, reply))

    async def session():
        return fake
    service._http_session = session
    text = _run(service._go_chat(OWNER, "my-model", [{"role": "user", "content": "hello"}], "custom", "", "high"))
    url, kwargs = fake.calls[0]
    assert text == "hi" and url == "http://127.0.0.1:8000/v1" + path
    assert kwargs["headers"]["Authorization"] == "Bearer sk-secret-value-123456"
    body = kwargs["json"]
    assert body["model"] == "my-model" and (body.get("reasoning_effort") == "high" or body["reasoning"]["effort"] == "high")
    assert body.get("max_tokens", body.get("max_output_tokens")) <= 4096
    with pytest.raises(AIChatError):
        _run(service._go_chat(OWNER, "other", [{"role": "user", "content": "hello"}], "custom", "", ""))
