/* i18n.js — Lightweight i18n engine for the PBGui web console (en/zh).
 *
 * Load this script EARLY (in <head> or right after <body> opens) on every page:
 *     <script src="/app/i18n.js?v=1"></script>
 *
 * Dictionary files live in frontend/i18n/en.json and frontend/i18n/zh.json
 * (served at /app/i18n/). Keys are semantic, e.g. 'common.cancel', 'nav.system'.
 *
 * Public API (window.PBGuiI18n):
 *   lang                       -> 'en' | 'zh' (current language)
 *   t(key[, params])           -> translated string; params interpolate {name}
 *   setLang('en'|'zh')         -> persist choice and reload the page
 *   translateDom(rootEl)       -> apply [data-i18n*] attributes below rootEl
 *   serverMsg(text)            -> map known server English text to the UI
 *                                 language; unmapped text is returned unchanged
 *
 * Supported data attributes (set on static markup; t() is for JS-built text):
 *   data-i18n             textContent of a LEAF element (no element children!)
 *   data-i18n-html        innerHTML — only for our own trusted static markup
 *   data-i18n-title       title attribute
 *   data-i18n-placeholder placeholder attribute
 *   data-i18n-aria-label  aria-label attribute
 *   data-i18n-value       value attribute
 *
 * Language resolution order:
 *   1. localStorage['pbgui-lang'] === 'en' | 'zh'
 *   2. navigator.language starting with 'zh' -> zh
 *   3. otherwise -> en (matches the historical English-only default)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pbgui-lang';
  var SUPPORTED = ['en', 'zh'];
  var DICT = {};
  var SERVER_MSGS = null;
  var MISSING = {};
  var LOADED = false;

  /* ── language detection ── */
  function detectLang() {
    try {
      var stored = null;
      if (typeof localStorage !== 'undefined') stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'zh') return stored;
      var nav = String(
        (navigator.language || navigator.userLanguage || navigator.browserLanguage || '')
      ).toLowerCase();
      return nav.indexOf('zh') === 0 ? 'zh' : 'en';
    } catch (e) {
      return 'en';
    }
  }

  var lang = detectLang();

  /* ── dictionary loading (synchronous: local static asset, loaded once) ── */
  function loadDict(l) {
    if (DICT[l]) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/app/i18n/' + l + '.json?v=1', false);
      xhr.send(null);
      if (xhr.status === 200) {
        DICT[l] = JSON.parse(xhr.responseText) || {};
        return;
      }
    } catch (e) {
      /* fall through to empty dict */
    }
    DICT[l] = {};
  }

  function ensureLoaded() {
    if (LOADED) return;
    LOADED = true;
    loadDict(lang);
    /* en fallback so t() has something to show if the active dict is empty */
    if (lang !== 'en') loadDict('en');
  }

  function interpolate(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
    });
  }

  /* ── server message mapping ── */
  function loadServerMsgs() {
    if (SERVER_MSGS) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/app/i18n/server_msgs.json?v=1', false);
      xhr.send(null);
      SERVER_MSGS = xhr.status === 200 ? (JSON.parse(xhr.responseText) || {}) : {};
    } catch (e) {
      SERVER_MSGS = {};
    }
  }

  function serverMsg(text) {
    if (lang === 'en' || !text) return text;
    loadServerMsgs();
    var s = String(text);
    if (Object.prototype.hasOwnProperty.call(SERVER_MSGS, s)) return SERVER_MSGS[s];
    return s;
  }

  /* ── translation ── */
  function t(key, params) {
    ensureLoaded();
    var active = DICT[lang] || {};
    var v = active[key];
    if (v === undefined || v === null || v === '') v = (DICT.en || {})[key];
    if (v === undefined || v === null || v === '') {
      if (!MISSING[key]) {
        MISSING[key] = true;
        if (window.console && console.warn) console.warn('[i18n] missing key:', key);
      }
      return key;
    }
    return interpolate(v, params);
  }

  function setLang(l) {
    if (SUPPORTED.indexOf(l) === -1) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, l);
    } catch (e) {
      /* non-fatal: reload still applies the language for this session */
    }
    window.location.reload();
  }

  function toggleLang() {
    setLang(lang === 'zh' ? 'en' : 'zh');
  }

  function applyAttr(el, attr, key, useHtml) {
    var value = t(key);
    if (useHtml) el.innerHTML = value;
    else el.setAttribute(attr, value);
  }

  function translateDom(root) {
    ensureLoaded();
    var scope = root || document;
    var els = scope.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-value]');
    var i, el, key;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      key = el.getAttribute('data-i18n');
      if (key && !el.querySelector('*')) el.textContent = t(key);
      key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
      key = el.getAttribute('data-i18n-title');
      if (key) applyAttr(el, 'title', key, false);
      key = el.getAttribute('data-i18n-placeholder');
      if (key) applyAttr(el, 'placeholder', key, false);
      key = el.getAttribute('data-i18n-aria-label');
      if (key) applyAttr(el, 'aria-label', key, false);
      key = el.getAttribute('data-i18n-value');
      if (key) el.value = t(key);
    }
  }

  function applyLangAttrs() {
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
  }

  function onDomReady() {
    applyLangAttrs();
    translateDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady);
  } else {
    onDomReady();
  }

  window.PBGuiI18n = {
    lang: lang,
    t: t,
    setLang: setLang,
    toggleLang: toggleLang,
    translateDom: translateDom,
    serverMsg: serverMsg
  };
})();
