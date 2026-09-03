import {
  createI18n as vueCreateI18n,
  type I18n,
  type LocaleMessageValue,
} from 'vue-i18n';
import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';
import serverMsgs from '../../i18n/server_msgs.json';

type FlatDict = Record<string, string>;
type MessageDict = Record<string, LocaleMessageValue>;
type BridgeMessages = { en: MessageDict; zh: MessageDict };

/** Storage key shared with the legacy frontend/i18n.js engine. */
const STORAGE_KEY = 'pbgui-lang';

/** Bare `|` (plural separator) and `@` (linked message) compile as syntax; emit them as literals. */
function escapeSpecials(value: string): string {
  return value.replaceAll('|', "{'|'}").replaceAll('@', "{'@'}");
}

/** vue-i18n resolves dotted paths against nested objects; our dicts are flat. */
function nest(flat: FlatDict): MessageDict {
  const root: MessageDict = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node: MessageDict = root;
    for (const p of parts.slice(0, -1)) {
      const next = node[p];
      node = (typeof next === 'object' && next !== null ? next : (node[p] = {})) as MessageDict;
    }
    node[parts[parts.length - 1]!] = escapeSpecials(value);
  }
  return root;
}

/** Same resolution order as legacy i18n.js: stored value, then navigator zh, then en. */
export function detectLang(): 'en' | 'zh' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function createI18n(lang: 'en' | 'zh' = 'en'): I18n<BridgeMessages, {}, {}, 'en' | 'zh', false> {
  return vueCreateI18n({
    legacy: false,
    locale: lang,
    fallbackLocale: 'en',
    messages: { en: nest(en), zh: nest(zh) },
  });
}

/** Exact-match translation of known server English messages; passthrough otherwise. */
export function serverMsg(text: string, lang?: string): string {
  const active = lang ?? detectLang();
  if (!text || active === 'en') return text;
  return (serverMsgs as FlatDict)[text] ?? text;
}

