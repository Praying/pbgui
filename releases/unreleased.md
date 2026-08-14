# Unreleased

## Internationalization (English / Simplified Chinese)

- Web console UI now supports English (default) and Simplified Chinese.
  - Browser language auto-detection (`zh*` → Chinese), manual switch button in the top navigation bar (and on the login page), persisted per browser via `localStorage['pbgui-lang']`; switching reloads the page.
  - New lightweight i18n engine `frontend/i18n.js` (`window.PBGuiI18n`: `t()`, `setLang()`, `toggleLang()`, `translateDom()`, `serverMsg()`); dictionaries `frontend/i18n/en.json` and `zh.json` with semantic keys; `data-i18n*` attributes for static markup.
  - All 36 console pages, shared JS modules, navigation bar, dialogs, toasts, alert overlay, and confirmations translated; `PBGuiI18n.serverMsg()` maps known server-side English error messages to Chinese and falls back to the original text.
  - Kept untranslated: user data, log content, config field names, and established abbreviations/terms (PNL, TP/SL, API, SSH, VPS, …); help guides remain EN/DE.
- Added `tests/test_i18n.py` enforcing en/zh key parity, non-empty translations, well-formed server message map, and that every key referenced by pages/scripts exists in both dictionaries.
- Updated `AGENTS.md` language convention accordingly.
