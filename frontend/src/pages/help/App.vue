<script setup lang="ts">
/*
 * Help & Tutorials page — the Vue port of frontend/help.html (1,108 lines,
 * legacy line refs below are provenance). Unlike other pages this is NOT a
 * normal page: the whole page is the page-local help overlay (#help-ovl)
 * opened on mount (legacy openHelp(TOPIC || 'overview') :1092). The nav
 * keeps a 'help' entry, and the nav Guide button re-enters this overlay via
 * window.PBGUI_HELP_OPENER (:1086-1087).
 *
 * ┌────────────────────────┬─ Legacy regions ─────────────────────────────┐
 * │ App (this shell)       │ chrome :509-545, bootstrap :547-560, open/   │
 * │                        │ close :893-971, drag :1053-1084, maximize   │
 * │                        │ :898-951, title :548                          │
 * │ HelpToc                │ toc :538-541, renderToc :816-829, filter     │
 * │                        │ :1014, loadHelpIndex :858-891                │
 * │ useHelpContent         │ topics/lang/cache :631-635, loadTopic :831-  │
 * │                        │ 856, ensureTopicCached :712-735, global data │
 * │                        │ :791-814, lang switch :1016-1034             │
 * │ lib/markdown.ts        │ marked+DOMPurify :619, :653-655              │
 * │ lib/search.ts          │ stripHtml/escapeRegExp :657-663, applySearch │
 * │                        │ :689-710, gotoMark :678-687, snippets :795-  │
 * │                        │ 807                                            │
 * │ Topnav                 │ pbgui_nav.js stays a global script loaded by │
 * │                        │ index.html (legacy :1096-1106)                │
 * └────────────────────────┴──────────────────────────────────────────────┘
 *
 * NOT PORTED (documented):
 *  - ensurePageMeta (:601-617) — the legacy static file had literal
 *    %%VERSION%%/%%SERIAL%% placeholders and back-filled them from
 *    /api/help/meta; the Vue page reads version/serial from /api/boot.js
 *    (index.html NAV_CONFIG) instead.
 *  - authHeaders (:562-566) — TOKEN was always '' on the static page, so
 *    every fetch was cookie-authenticated; the shared apiFetch adds the
 *    boot token on top (same-origin cookie still applies).
 *
 * Deliberate deviations (documented):
 *  - body.pbgui-help-open is toggled from a Vue watcher; legacy relied on
 *    pbgui_nav.js's MutationObserver, which cannot see #help-ovl because
 *    the Vue app mounts after nav init. Same visible effect (topnav above
 *    the overlay while open).
 *  - Stale-response guards and normalize stored 'help-lang' (see
 *    useHelpContent.ts).
 *  - Search-mark navigation keeps the legacy DOM approach (classList
 *    current + scrollIntoView) over the v-html-rendered marks.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import {
  PhArrowDown,
  PhArrowUp,
  PhArrowsIn,
  PhArrowsOut,
  PhBookOpen,
  PhX,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import HelpToc from './components/HelpToc.vue';
import { useHelpContent, type GlobalSearchResult } from './composables/useHelpContent';
import { highlightMarks, highlightSnippet } from './lib/search';

const { t } = useI18n();
const store = useHelpContent();

/* ── bootstrap (legacy :548, :551-557, :1086-1092) ── */

const TOPIC = new URLSearchParams(window.location.search).get('topic') || '';

declare global {
  interface Window {
    openHelpOverlay?: (keyword?: string) => void;
    PBGUI_HELP_OPENER?: () => void;
  }
}

/* ── overlay chrome (legacy :893-971) ── */

const overlayVisible = ref(false);
const maximized = ref(false);
const ovlEl = useTemplateRef<HTMLElement>('ovlEl');
let restoreBounds: Record<string, string> = {};

/* Deviation: replaces nav.js's MutationObserver on #help-ovl (see header). */
watch(
  overlayVisible,
  (visible) => {
    document.body.classList.toggle('pbgui-help-open', visible);
  },
  { immediate: true },
);

/* ── search state (legacy :637-646) ── */

const searchTermRaw = ref('');
const appliedTerm = ref('');
let searchTimer: number | undefined;
const globalMode = ref(false);
const globalStatus = ref<'idle' | 'searching' | 'done'>('idle');
const globalResults = ref<GlobalSearchResult[]>([]);
const globalMessage = ref('');
const globalCountText = ref('');
const markEls: HTMLElement[] = [];
const searchMarksCount = ref(0);
const searchIndex = ref(-1);
const contentEl = useTemplateRef<HTMLElement>('contentEl');

const searchPlaceholder = computed(() =>
  globalMode.value ? t('misc.help.searchAllTopics') : t('misc.help.searchInTopic'),
);

/* Legacy updateSearchCount (:672-676). */
const searchCountText = computed(() => {
  if (globalMode.value) return globalCountText.value;
  if (searchMarksCount.value) return `${searchIndex.value + 1}/${searchMarksCount.value}`;
  return searchTermRaw.value.trim() ? t('misc.help.found0') : '';
});

/* In-topic view: sanitized html, optionally with <mark> highlights
 * (legacy applySearch innerHTML swap :701-710). */
const displayHtml = computed(() => {
  const html = store.topicHtml.value;
  if (html === null) return '';
  return appliedTerm.value && !globalMode.value ? highlightMarks(html, appliedTerm.value) : html;
});

async function refreshMarks(): Promise<void> {
  await nextTick();
  markEls.length = 0;
  markEls.push(...((Array.from(contentEl.value?.querySelectorAll('mark') ?? []) as HTMLElement[])));
  searchMarksCount.value = markEls.length;
  searchIndex.value = -1;
}

/* Legacy gotoMark (:678-687). */
function gotoMark(index: number): void {
  if (!markEls.length) return;
  if (searchIndex.value >= 0 && searchIndex.value < markEls.length) {
    markEls[searchIndex.value]!.classList.remove('current');
  }
  searchIndex.value = ((index % markEls.length) + markEls.length) % markEls.length;
  const el = markEls[searchIndex.value]!;
  el.classList.add('current');
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); // jsdom-safe optional call
}

/* Legacy showGlobalResults (:772-814) + renderGlobalResults (:737-770). */
async function runGlobalSearch(term: string): Promise<void> {
  if (!term) {
    globalStatus.value = 'done';
    globalResults.value = [];
    globalMessage.value = t('misc.help.typeSearchTerm');
    globalCountText.value = '';
    return;
  }
  globalStatus.value = 'searching';
  globalResults.value = [];
  globalMessage.value = '';
  const results = await store.collectGlobalMatches(term);
  globalStatus.value = 'done';
  globalResults.value = results;
  if (!results.length) {
    globalMessage.value = t('misc.help.noResultsFound');
    globalCountText.value = t('misc.help.found0');
  } else {
    globalCountText.value =
      results.length + (results.length === 1 ? ' ' + t('misc.help.topic') : ' ' + t('misc.help.topics'));
  }
}

/* Legacy gs-item click (:761-769). */
function openGlobalResult(index: number): void {
  globalMode.value = false;
  void store.loadTopic(index);
}

/* Debounced input (legacy :973-980, 260ms). */
watch(searchTermRaw, (value) => {
  if (searchTimer !== undefined) clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    appliedTerm.value = value.trim();
  }, 260);
});

/* Applied term → applySearch/clearSearch (legacy :689-710, :665-670). */
watch(appliedTerm, async () => {
  if (globalMode.value) {
    await runGlobalSearch(appliedTerm.value);
    return;
  }
  if (store.topicHtml.value === null) return;
  await refreshMarks();
  if (appliedTerm.value && markEls.length) gotoMark(0);
});

/* Global-mode checkbox (legacy :997-1012). */
watch(globalMode, async (on) => {
  markEls.length = 0;
  searchMarksCount.value = 0;
  searchIndex.value = -1;
  if (on) {
    await runGlobalSearch(appliedTerm.value);
  } else if (store.topicHtml.value !== null) {
    await refreshMarks();
    if (appliedTerm.value && markEls.length) gotoMark(0);
  }
});

/* Topic content arrived → scroll top + re-apply in-topic search
 * (legacy loadTopic .then :846-852). */
watch(
  () => store.topicHtml.value,
  async (html) => {
    if (globalMode.value || html === null) return;
    await nextTick();
    if (contentEl.value) contentEl.value.scrollTop = 0;
    await refreshMarks();
    if (appliedTerm.value && markEls.length) gotoMark(0);
  },
);

/* Input keyboard: Enter/Shift+Enter navigates, Escape clears immediately
 * (legacy :982-992). */
function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !globalMode.value) {
    event.preventDefault();
    gotoMark(searchIndex.value + (event.shiftKey ? -1 : 1));
  }
  if (event.key === 'Escape') {
    if (searchTimer !== undefined) clearTimeout(searchTimer);
    searchTermRaw.value = '';
    appliedTerm.value = '';
  }
}

/* ── maximize (legacy :898-951, syncMaximizeButton is reactive here) ── */

function setMaximized(nextValue: boolean): void {
  const ovl = ovlEl.value;
  if (!ovl) return;
  const shouldMaximize = Boolean(nextValue);
  if (shouldMaximize === maximized.value) return;
  if (shouldMaximize) {
    restoreBounds = {
      left: ovl.style.left || '',
      top: ovl.style.top || '',
      right: ovl.style.right || '',
      bottom: ovl.style.bottom || '',
      width: ovl.style.width || '',
      height: ovl.style.height || '',
      transform: ovl.style.transform || '',
    };
    maximized.value = true;
    if (window.innerWidth <= 720) {
      ovl.style.left = '7px';
      ovl.style.top = '59px';
      ovl.style.right = '7px';
      ovl.style.bottom = '7px';
    } else {
      ovl.style.left = '12px';
      ovl.style.top = '64px';
      ovl.style.right = '12px';
      ovl.style.bottom = '12px';
    }
    ovl.style.width = 'auto';
    ovl.style.height = 'auto';
    ovl.style.transform = 'none';
  } else {
    maximized.value = false;
    const saved = restoreBounds;
    ovl.style.left = saved.left || '';
    ovl.style.top = saved.top || '';
    ovl.style.right = saved.right || '';
    ovl.style.bottom = saved.bottom || '';
    ovl.style.width = saved.width || '';
    ovl.style.height = saved.height || '';
    ovl.style.transform = saved.transform || '';
  }
}

/* ── drag handle (legacy :1053-1084) ── */

function onDragStart(event: MouseEvent): void {
  if (window.innerWidth <= 720 || maximized.value) return;
  const ovl: HTMLElement | null = ovlEl.value;
  if (!ovl) return;
  event.preventDefault();
  const rect = ovl.getBoundingClientRect();
  ovl.style.transform = 'none';
  ovl.style.left = rect.left + 'px';
  ovl.style.top = rect.top + 'px';
  const startX = event.clientX;
  const startY = event.clientY;
  const boxLeft = rect.left;
  const boxTop = rect.top;

  function onMove(moveEvent: MouseEvent): void {
    ovl!.style.left = boxLeft + moveEvent.clientX - startX + 'px';
    ovl!.style.top = boxTop + moveEvent.clientY - startY + 'px';
  }

  function onUp(): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── open/close (legacy :953-971) ── */

function openHelp(keyword?: string): void {
  overlayVisible.value = true;
  if (!store.loaded.value) {
    void store.loadIndex(keyword || 'overview');
  } else if (keyword) {
    void store.loadIndex(keyword);
  }
}

function closeLocalHelp(): void {
  overlayVisible.value = false;
  try {
    const previous = document.referrer ? new URL(document.referrer) : null;
    if (previous && previous.origin === window.location.origin && previous.pathname !== window.location.pathname) {
      window.history.back();
    }
  } catch {
    /* legacy swallowed referrer parse errors */
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeLocalHelp(); // legacy :1049-1051
}

/* ── lifecycle ── */

onMounted(() => {
  document.title = t('misc.help.title'); // legacy :548
  window.openHelpOverlay = openHelp; // legacy :1086
  window.PBGUI_HELP_OPENER = () => openHelp(); // legacy :1087
  document.addEventListener('keydown', onDocumentKeydown);
  openHelp(TOPIC || 'overview'); // legacy :1092
});

onBeforeUnmount(() => {
  if (searchTimer !== undefined) clearTimeout(searchTimer); // deviation: legacy leaked the timer
  document.removeEventListener('keydown', onDocumentKeydown);
  document.body.classList.remove('pbgui-help-open');
  delete window.openHelpOverlay;
  delete window.PBGUI_HELP_OPENER;
});
</script>

<template>
  <AppShell
    class="support-page-shell support-page-shell--help"
    page-key="help"
    :page-title="t('misc.help.title')"
  >
    <MigrationWatermark />
    <div id="page-content" aria-hidden="true"></div>
    <div id="help-backdrop" :class="{ visible: overlayVisible }"></div>

  <div
    id="help-ovl"
    ref="ovlEl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-dialog-title"
    :class="{ visible: overlayVisible, 'is-maximized': maximized }"
  >
    <div class="ovl-panel">
      <div id="help-drag-handle" @mousedown="onDragStart"></div>
      <div class="ovl-header">
        <div id="help-dialog-title" class="ovl-header-title"><PbIcon :icon="PhBookOpen" /> <span>{{ t('misc.help.guideHelp') }}</span></div>
        <div class="ovl-header-actions">
          <div id="help-search-wrap">
            <input
              id="help-search"
              v-model="searchTermRaw"
              type="text"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              @keydown="onSearchKeydown"
            >
            <button
              class="help-snav-btn"
              id="help-search-up"
              :title="t('misc.help.previousMatch')"
              :aria-label="t('misc.help.previousMatch')"
              @click="gotoMark(searchIndex - 1)"
            ><PbIcon :icon="PhArrowUp" /></button>
            <button
              class="help-snav-btn"
              id="help-search-dn"
              :title="t('misc.help.nextMatch')"
              :aria-label="t('misc.help.nextMatch')"
              @click="gotoMark(searchIndex + 1)"
            ><PbIcon :icon="PhArrowDown" /></button>
            <span id="help-search-count">{{ searchCountText }}</span>
            <label id="help-search-global-lbl" :title="t('misc.help.searchAcrossAll')">
              <input id="help-search-global" v-model="globalMode" type="checkbox"> <span>{{ t('common.all') }}</span>
            </label>
          </div>
          <div style="width:1px;height:16px;background:#37333a;flex-shrink:0;"></div>
          <div class="lang-pill">
            <button id="help-lang-en" :class="{ active: store.lang.value === 'EN' }" @click="store.switchLang('EN')">EN</button>
            <button id="help-lang-de" :class="{ active: store.lang.value === 'DE' }" @click="store.switchLang('DE')">DE</button>
          </div>
          <button
            class="ovl-tool"
            id="help-maximize"
            :title="maximized ? t('misc.help.restoreWindow') : t('misc.help.fitWindow')"
            :aria-label="maximized ? t('misc.help.restoreWindow') : t('misc.help.fitWindow')"
            :aria-pressed="maximized ? 'true' : 'false'"
            @click="setMaximized(!maximized)"
            ><PbIcon :icon="maximized ? PhArrowsIn : PhArrowsOut" /></button>
          <button class="ovl-close" id="help-close" :aria-label="t('common.close')" @click="closeLocalHelp"><PbIcon :icon="PhX" /></button>
        </div>
      </div>
      <div id="help-body">
        <HelpToc
          v-model:filter="store.filter.value"
          :entries="store.filteredTopics.value"
          :selected="store.selected.value"
          :status="store.indexStatus.value"
          @select="store.loadTopic"
        />
        <div id="help-content" ref="contentEl">
          <template v-if="globalMode">
            <div v-if="globalStatus === 'searching'" class="help-loading">{{ t('misc.help.searching') }}</div>
            <p v-else-if="globalMessage" style="color:#716b75;padding:8px 0;">{{ globalMessage }}</p>
            <div v-else-if="globalResults.length" class="gs-results">
              <div
                v-for="result in globalResults"
                :key="result.idx"
                class="gs-item"
                :data-idx="result.idx"
                @click="openGlobalResult(result.idx)"
              >
                <div class="gs-topic">{{ result.title }}</div>
                <!-- escaped + <mark>-wrapped in lib/search.highlightSnippet (never raw server text) -->
                <div
                  v-for="(snippet, i) in result.snippets"
                  :key="i"
                  class="gs-snip"
                  v-html="highlightSnippet(snippet, appliedTerm)"
                ></div>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-if="store.contentStatus.value === 'loading'" class="help-loading">{{ t('common.loading') }}</div>
            <div v-else-if="store.contentStatus.value === 'error'" class="help-loading">{{ t('misc.help.failedLoadContent') }}</div>
            <div v-else-if="store.indexStatus.value === 'empty'" class="help-loading">{{ t('misc.help.noHelpTopics') }}</div>
            <!-- markdown: DOMPurify-sanitized in lib/markdown.renderMarkdown before v-html (never raw) -->
            <div v-else-if="store.topicHtml.value !== null" v-html="displayHtml"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
  </AppShell>
</template>
