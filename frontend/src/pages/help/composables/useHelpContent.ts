/*
 * Help content composable — data half of the legacy help.html IIFE
 * (:621-1093): topic index loading, topic selection + caching, EN/DE
 * language switching, and global-search data collection. View concerns
 * (marks navigation, drag/maximize) stay in App.vue.
 *
 * Deliberate deviations (documented):
 *  - Stale-response guards (indexSeq/topicSeq) so a slow in-flight request
 *    cannot overwrite a newer language switch — the same convention as the
 *    shared overlay's indexRequestSeq/topicRequestSeq (shared_help_overlay.js).
 *  - Stored 'help-lang' values other than EN/DE/ZH fall back to the browser
 *    default (zh* → ZH, else EN); legacy passed junk values straight through
 *    to the API.
 */
import { computed, ref } from 'vue';
import { apiFetch } from '@/shared/api';
import { helpApiUrl } from '../config';
import { renderMarkdown } from '../lib/markdown';
import { findMatchPositions, snippetAt, stripHtml } from '../lib/search';

export type HelpLang = 'EN' | 'DE' | 'ZH';

export interface HelpTopic {
  title: string;
  file: string;
  category?: string;
}

/** One global-search hit (legacy showGlobalResults `results` entries :801-808). */
export interface GlobalSearchResult {
  idx: number;
  title: string;
  snippets: string[];
}

export type HelpIndexStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error';
export type TopicContentStatus = 'idle' | 'loading' | 'ok' | 'error';

/** Shared with legacy help.html :631 and shared_help_overlay.js. */
const LANG_STORAGE_KEY = 'help-lang';

/**
 * Browser default help content language: zh* → ZH (like the GUI i18n
 * auto-select), everything else EN.
 */
function browserDefaultLang(): HelpLang {
  try {
    if (String(navigator.language || '').toLowerCase().startsWith('zh')) return 'ZH';
  } catch {
    /* ignore */
  }
  return 'EN';
}

/** Stored choice wins; junk stored values count as no preference. */
function storedLang(): HelpLang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    /* private mode */
  }
  if (stored === 'EN' || stored === 'DE' || stored === 'ZH') return stored;
  return browserDefaultLang();
}

export function useHelpContent() {
  const lang = ref<HelpLang>(storedLang());
  const topics = ref<HelpTopic[]>([]);
  const selected = ref(0);
  /** Sanitized HTML of the current topic (legacy `rawHtml`); null while loading. */
  const topicHtml = ref<string | null>(null);
  const indexStatus = ref<HelpIndexStatus>('idle');
  const contentStatus = ref<TopicContentStatus>('idle');
  const filter = ref('');
  /** True once an index load succeeded (legacy `helpLoaded`). */
  const loaded = ref(false);

  let topicCache = new Map<number, string>();
  let indexSeq = 0;
  let topicSeq = 0;

  /** Currently active topic. */
  const currentTopic = computed<HelpTopic | null>(() => topics.value[selected.value] ?? null);

  /** Previous topic in the index, if any. */
  const prevTopic = computed<{ topic: HelpTopic; index: number } | null>(() => {
    if (selected.value > 0 && selected.value < topics.value.length) {
      return { topic: topics.value[selected.value - 1]!, index: selected.value - 1 };
    }
    return null;
  });

  /** Next topic in the index, if any. */
  const nextTopic = computed<{ topic: HelpTopic; index: number } | null>(() => {
    if (selected.value >= 0 && selected.value < topics.value.length - 1) {
      return { topic: topics.value[selected.value + 1]!, index: selected.value + 1 };
    }
    return null;
  });

  /** TOC entries after the filter (legacy renderToc :816-829). */
  const filteredTopics = computed(() => {
    const needle = filter.value.trim().toLowerCase();
    const entries: { topic: HelpTopic; index: number }[] = [];
    topics.value.forEach((topic, index) => {
      if (needle && topic.title.toLowerCase().indexOf(needle) === -1) return;
      entries.push({ topic, index });
    });
    return entries;
  });

  async function fetchTopics(): Promise<HelpTopic[]> {
    const data = await apiFetch<HelpTopic[]>(helpApiUrl('/index?lang=' + lang.value));
    return Array.isArray(data) ? data : [];
  }

  async function fetchTopicHtml(topic: HelpTopic): Promise<string> {
    const data = await apiFetch<{ content?: string }>(
      helpApiUrl('/content?file=' + encodeURIComponent(topic.file) + '&lang=' + lang.value),
    );
    return renderMarkdown(data.content || '');
  }

  /** First topic matching keyword on title or file (legacy :872-883). */
  function findTopicIndex(keyword: string): number {
    let startIndex = 0;
    if (keyword) {
      const kw = String(keyword).toLowerCase();
      for (let i = 0; i < topics.value.length; i += 1) {
        const file = String(topics.value[i]!.file || '').toLowerCase();
        const title = String(topics.value[i]!.title || '').toLowerCase();
        if (title.indexOf(kw) !== -1 || file.indexOf(kw) !== -1) {
          startIndex = i;
          break;
        }
      }
    }
    return startIndex;
  }

  async function loadTopic(index: number): Promise<void> {
    const seq = ++topicSeq;
    selected.value = index;
    const topic = topics.value[index];
    if (!topic) return;
    topicHtml.value = null; // legacy rawHtml = null
    contentStatus.value = 'loading';
    const cached = topicCache.get(index);
    if (cached !== undefined) {
      topicHtml.value = cached;
      contentStatus.value = 'ok';
      return;
    }
    try {
      const html = await fetchTopicHtml(topic);
      if (seq !== topicSeq) return;
      topicCache.set(index, html);
      topicHtml.value = html;
      contentStatus.value = 'ok';
    } catch {
      if (seq !== topicSeq) return;
      contentStatus.value = 'error';
    }
  }

  async function loadIndex(keyword: string): Promise<void> {
    const seq = ++indexSeq;
    indexStatus.value = 'loading';
    try {
      const data = await fetchTopics();
      if (seq !== indexSeq) return;
      topics.value = data;
      if (!data.length) {
        indexStatus.value = 'empty';
        return;
      }
      indexStatus.value = 'ok';
      await loadTopic(findTopicIndex(keyword));
      loaded.value = true;
    } catch {
      if (seq !== indexSeq) return;
      indexStatus.value = 'error';
      contentStatus.value = 'error'; // legacy set both error messages :888-889
    }
  }

  /** Legacy ensureTopicCached (:712-735) — caches '' on failure. */
  async function ensureTopicCached(index: number): Promise<string> {
    const cached = topicCache.get(index);
    if (cached !== undefined) return cached;
    const topic = topics.value[index];
    if (!topic) return '';
    try {
      const html = await fetchTopicHtml(topic);
      topicCache.set(index, html);
      return html;
    } catch {
      topicCache.set(index, '');
      return '';
    }
  }

  /**
   * Global search data: render/collect every topic (via the cache), strip
   * tags, and gather up to 3 snippet positions per matching topic
   * (legacy showGlobalResults :791-813).
   */
  async function collectGlobalMatches(term: string): Promise<GlobalSearchResult[]> {
    const results: GlobalSearchResult[] = [];
    if (!topics.value.length || !term) return results;
    const htmls = await Promise.all(topics.value.map((_topic, index) => ensureTopicCached(index)));
    htmls.forEach((html, index) => {
      const text = stripHtml(html);
      const positions = findMatchPositions(text, term);
      if (!positions.length) return;
      results.push({
        idx: index,
        title: topics.value[index]!.title,
        snippets: positions.map((position) => snippetAt(text, position)),
      });
    });
    return results;
  }

  /** Language pill handler (legacy :1016-1034). */
  async function switchLang(next: HelpLang): Promise<void> {
    if (lang.value === next) return;
    lang.value = next;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode — legacy did not guard, the API lang param still works */
    }
    topicCache = new Map();
    selected.value = 0;
    indexSeq += 1; // invalidate in-flight loads for the previous language
    topicSeq += 1;
    await loadIndex('overview');
  }

  return {
    lang,
    topics,
    selected,
    topicHtml,
    indexStatus,
    contentStatus,
    filter,
    loaded,
    currentTopic,
    prevTopic,
    nextTopic,
    filteredTopics,
    loadIndex,
    loadTopic,
    switchLang,
    collectGlobalMatches,
  };
}
