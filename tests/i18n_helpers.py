"""Shared helpers for asserting UI text in i18n-ized frontend sources.

After the en/zh i18n change, UI strings may live in `frontend/i18n/en.json`
behind semantic keys instead of appearing as literals in the HTML/JS source.
`assert_text_present()` accepts both forms so regression tests keep working
against the English UI while the source itself is i18n-aware.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EN_PATH = ROOT / "frontend" / "i18n" / "en.json"

_en_cache: dict | None = None


def _en_dict() -> dict:
    """Return the English dictionary (cached)."""
    global _en_cache
    if _en_cache is None:
        _en_cache = json.loads(EN_PATH.read_text(encoding="utf-8"))
    return _en_cache


def assert_text_present(source: str, english: str) -> None:
    """Assert an English UI text is presented by the given frontend source.

    Accepts either the literal text in the source (legacy inline UI text or
    fallback markup) or an i18n key reference whose `en.json` value equals the
    expected text. Values with surrounding whitespace (concatenation-style
    suffix keys) are compared stripped.
    """
    if english in source:
        return
    keys = [k for k, v in _en_dict().items() if v == english]
    if not keys:
        keys = [k for k, v in _en_dict().items() if v.strip() == english.strip()]
    if not keys:
        raise AssertionError(
            f"UI text is neither literal in the source nor present in en.json: {english!r}"
        )
    for key in keys:
        if f"'{key}'" in source or f'"{key}"' in source:
            return
    raise AssertionError(
        f"UI text {english!r} exists in en.json ({keys[0]!r}) "
        f"but that key is not referenced in the source"
    )


NODE_I18N_STUB = (
    "const __PBGUI_I18N_EN__ = require('{en_json}');\n"
    "globalThis.window = globalThis;\n"
    "globalThis.PBGuiI18n = {\n"
    "  lang: 'en',\n"
    "  t: function (k, params) {\n"
    "    var v = __PBGUI_I18N_EN__[k];\n"
    "    if (v === undefined) return k;\n"
    "    if (params) {\n"
    "      v = String(v).replace(/\\{(\\w+)\\}/g, function (m, name) {\n"
    "        return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;\n"
    "      });\n"
    "    }\n"
    "    return v;\n"
    "  },\n"
    "  serverMsg: function (t) { return t; },\n"
    "  translateDom: function () {},\n"
    "  setLang: function () {},\n"
    "  toggleLang: function () {}\n"
    "};\n"
).replace("{en_json}", str(EN_PATH))
