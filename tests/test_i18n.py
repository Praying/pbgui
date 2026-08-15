"""i18n dictionary parity tests for the PBGui en/zh web console.

These tests are offline and read-only: they only inspect the frontend/ tree.
"""

import json
import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
I18N_DIR = FRONTEND / "i18n"

# Keys that are built dynamically at runtime (base prefix + runtime suffix)
# and therefore cannot be found by the static literal scan below.
DYNAMIC_KEY_PREFIXES = ("nav.page.",)

STATIC_KEY_RE = re.compile(
    r"""
      data-i18n(?:-(?:title|placeholder|aria-label|html|value))? # attribute name
      \s*=\s*["']([^"']+)["']                                   # literal key
    |
      PBGuiI18n\.t\(\s*["']([^"']+)["']\s*[,)]                  # t('key'[, ...])
    |
      navT\(\s*["']([^"']+)["']\s*[,)]                          # navT('key'[, ...])
    """,
    re.VERBOSE,
)


def _load(name: str) -> dict:
    with open(I18N_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


def test_en_zh_dictionaries_have_identical_key_sets():
    """Every key in en.json must exist in zh.json and vice versa."""
    en = _load("en.json")
    zh = _load("zh.json")
    missing_in_zh = sorted(set(en) - set(zh))
    extra_in_zh = sorted(set(zh) - set(en))
    assert en, "en.json is empty"
    assert not missing_in_zh, f"keys missing in zh.json: {missing_in_zh[:30]}"
    assert not extra_in_zh, f"keys only in zh.json: {extra_in_zh[:30]}"


def test_no_empty_translations():
    """No dictionary entry may be empty or whitespace-only."""
    for name in ("en.json", "zh.json"):
        data = _load(name)
        empties = [k for k, v in data.items() if v is None or not str(v).strip()]
        assert not empties, f"{name}: empty values for {empties[:30]}"


def test_server_messages_wellformed():
    """Server message map keys/values must be non-empty and trimmed."""
    msgs = _load("server_msgs.json")
    bad_keys = [k for k in msgs if k != k.strip()]
    bad_vals = [k for k, v in msgs.items() if not str(v).strip()]
    assert not bad_keys, f"untrimmed server message keys: {bad_keys[:20]}"
    assert not bad_vals, f"empty server message values: {bad_vals[:20]}"


def test_all_statically_referenced_keys_exist():
    """Every literal i18n key referenced in HTML/JS must be in both dictionaries."""
    en = _load("en.json")
    zh = _load("zh.json")
    referenced = set()
    for path in sorted(FRONTEND.rglob("*")):
        if path.suffix not in (".html", ".js"):
            continue
        parts = path.parts
        if "vendor" in parts or "node_modules" in parts or "dist" in parts or path.name in ("plotly.min.js", "i18n.js"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for groups in STATIC_KEY_RE.findall(text):
            key = groups[0] or groups[1] or groups[2]
            referenced.add(key)
    missing = sorted(
        k
        for k in referenced
        if not k.startswith(DYNAMIC_KEY_PREFIXES) and (k not in en or k not in zh)
    )
    assert not missing, (
        f"{len(missing)} referenced keys missing from the dictionaries "
        f"(first 30): {missing[:30]}"
    )
