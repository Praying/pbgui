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

/* ── Tailwind colour mappings (the former help.css state rules) ──
   Each helper returns the COMPLETE colour set per branch — including the
   neutral default — because Tailwind emits same-property utilities in its
   own fixed order (a neutral + variant pair in one class list renders
   neutral). 'active' stays as the inert state anchor the page tests
   assert. */

/* .ovl-tool[aria-pressed="true"] tint; the neutral branch doubles as the
   .ovl-close default colours. */
function ovlToolColorClass(pressed: boolean): string {
  return pressed
    ? 'border-[rgb(var(--text-secondary-rgb)/0.2)] bg-white/6 text-primary'
    : 'border-transparent bg-transparent text-muted';
}

/* .lang-pill button colours (.active tint + the :hover:not(.active) lift —
   the lift must live on the inactive branch only, exactly like the legacy
   :not(.active) selector). */
function langBtnClass(active: boolean): string {
  return [
    'cursor-pointer border-0 text-xs font-semibold tracking-[0.05em] py-[0.2rem] px-[0.55rem] transition-all duration-120',
    active
      ? 'active bg-border-default text-accent-soft'
      : 'bg-transparent text-muted hover:bg-white/4 hover:text-primary',
  ].join(' ');
}

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
    <div
      id="page-content"
      aria-hidden="true"
      class="relative h-full overflow-hidden [background:radial-gradient(circle_at_top_right,rgb(var(--accent-deep-rgb)/0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgb(var(--accent-rgb)/0.08),transparent_22%),var(--bg-page)]"
    ></div>
    <div
      id="help-backdrop"
      class="fixed inset-0 z-[150] bg-[radial-gradient(circle_at_top_right,rgb(var(--accent-deep-rgb)/0.10),transparent_35%),linear-gradient(180deg,rgb(var(--bg-page-rgb)/0.32),rgb(var(--bg-page-rgb)/0.66))] backdrop-blur-[3px]"
      :class="overlayVisible ? 'visible block' : 'hidden'"
    ></div>

  <div
    id="help-ovl"
    ref="ovlEl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-dialog-title"
    class="fixed top-1/2 left-1/2 [transform:translate(-50%,-50%)] z-[3000] w-[min(900px,95vw)] h-[min(700px,90vh)] min-w-[480px] min-h-[300px] bg-page border border-border-default rounded-[12px] shadow-[0_20px_70px_rgba(5,8,14,0.9)] flex-col overflow-hidden max-[720px]:w-[calc(100vw-14px)] max-[720px]:h-[calc(100dvh-66px)] max-[720px]:min-w-0 max-[720px]:min-h-0 max-[720px]:top-[59px] max-[720px]:left-[7px] max-[720px]:[transform:none] max-[720px]:resize-none"
    :class="[overlayVisible ? 'visible flex' : 'hidden', maximized ? 'is-maximized max-w-none max-h-none resize-none' : 'resize']"
  >
    <div class="ovl-panel flex-1 flex flex-col overflow-hidden relative">
      <div id="help-drag-handle" class="absolute top-0 left-0 right-12 h-[46px] z-[2]" :class="maximized ? 'cursor-default' : 'cursor-move'" @mousedown="onDragStart"></div>
      <div class="ovl-header flex items-center justify-between py-[0.85rem] pr-[1.1rem] pl-[1.25rem] border-b border-border-subtle shrink-0 bg-card max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-2.5">
        <div id="help-dialog-title" class="ovl-header-title flex items-center gap-1.75 text-md font-bold text-primary"><PbIcon :icon="PhBookOpen" /> <span>{{ t('misc.help.guideHelp') }}</span></div>
        <div class="ovl-header-actions flex items-center gap-1.75 relative z-[3] max-[720px]:flex-wrap max-[720px]:w-full">
          <div id="help-search-wrap" class="flex items-center gap-[3px]">
            <input
              id="help-search"
              v-model="searchTermRaw"
              type="text"
              class="w-[170px] bg-card text-primary border border-border-default rounded-[5px] py-[0.28rem] px-[0.5rem] text-sm outline-none focus:border-secondary placeholder:text-secondary max-[720px]:w-[140px]"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              @keydown="onSearchKeydown"
            >
            <button
              class="help-snav-btn bg-card border border-border-default rounded-[3px] text-secondary cursor-pointer text-xs px-[5px] py-[2px] leading-[1.4] transition-[color,border-color] duration-100 hover:text-primary hover:border-secondary"
              id="help-search-up"
              :title="t('misc.help.previousMatch')"
              :aria-label="t('misc.help.previousMatch')"
              @click="gotoMark(searchIndex - 1)"
            ><PbIcon :icon="PhArrowUp" /></button>
            <button
              class="help-snav-btn bg-card border border-border-default rounded-[3px] text-secondary cursor-pointer text-xs px-[5px] py-[2px] leading-[1.4] transition-[color,border-color] duration-100 hover:text-primary hover:border-secondary"
              id="help-search-dn"
              :title="t('misc.help.nextMatch')"
              :aria-label="t('misc.help.nextMatch')"
              @click="gotoMark(searchIndex + 1)"
            ><PbIcon :icon="PhArrowDown" /></button>
            <span id="help-search-count" class="text-xs text-muted whitespace-nowrap min-w-[44px] text-left">{{ searchCountText }}</span>
            <label id="help-search-global-lbl" class="flex items-center gap-[3px] text-secondary text-xs cursor-pointer whitespace-nowrap select-none" :title="t('misc.help.searchAcrossAll')">
              <input id="help-search-global" v-model="globalMode" type="checkbox" class="cursor-pointer"> <span>{{ t('common.all') }}</span>
            </label>
          </div>
          <div style="width:1px;height:16px;background:var(--border-default);flex-shrink:0;"></div>
          <div class="lang-pill flex border border-border-default rounded-md overflow-hidden shrink-0">
            <button id="help-lang-en" :class="langBtnClass(store.lang.value === 'EN')" @click="store.switchLang('EN')">EN</button>
            <button id="help-lang-de" :class="langBtnClass(store.lang.value === 'DE')" @click="store.switchLang('DE')">DE</button>
          </div>
          <button
            class="ovl-tool inline-flex items-center justify-center cursor-pointer text-md w-7 h-7 p-0 rounded-sm leading-none border transition-[color,background-color] duration-120 hover:text-primary hover:border-[rgb(var(--text-secondary-rgb)/0.18)] hover:bg-white/6"
            :class="ovlToolColorClass(maximized)"
            id="help-maximize"
            :title="maximized ? t('misc.help.restoreWindow') : t('misc.help.fitWindow')"
            :aria-label="maximized ? t('misc.help.restoreWindow') : t('misc.help.fitWindow')"
            :aria-pressed="maximized ? 'true' : 'false'"
            @click="setMaximized(!maximized)"
            ><PbIcon :icon="maximized ? PhArrowsIn : PhArrowsOut" /></button>
          <button class="ovl-close inline-flex items-center justify-center cursor-pointer text-md w-7 h-7 p-0 rounded-sm leading-none border border-transparent bg-transparent text-muted transition-[color,background-color] duration-120 hover:text-primary hover:border-[rgb(var(--text-secondary-rgb)/0.18)] hover:bg-white/6" id="help-close" :aria-label="t('common.close')" @click="closeLocalHelp"><PbIcon :icon="PhX" /></button>
        </div>
      </div>
      <div id="help-body" class="flex flex-1 overflow-hidden max-[720px]:flex-col">
        <HelpToc
          v-model:filter="store.filter.value"
          :entries="store.filteredTopics.value"
          :selected="store.selected.value"
          :status="store.indexStatus.value"
          @select="store.loadTopic"
        />
        <div id="help-content" ref="contentEl" class="flex-1 overflow-y-auto py-[1.5rem] px-[1.8rem] leading-[1.7] text-primary text-base">
          <template v-if="globalMode">
            <div v-if="globalStatus === 'searching'" class="help-loading text-secondary italic p-7 text-center">{{ t('misc.help.searching') }}</div>
            <p v-else-if="globalMessage" style="color:var(--text-muted);padding:8px 0;">{{ globalMessage }}</p>
            <div v-else-if="globalResults.length" class="gs-results flex flex-col gap-2 py-1">
              <div
                v-for="result in globalResults"
                :key="result.idx"
                class="gs-item bg-card border border-border-default rounded-md px-3.5 py-2.5 cursor-pointer transition-[border-color] duration-150 hover:border-secondary"
                :data-idx="result.idx"
                @click="openGlobalResult(result.idx)"
              >
                <div class="gs-topic text-accent-soft font-semibold text-sm mb-[5px]">{{ result.title }}</div>
                <!-- escaped + <mark>-wrapped in lib/search.highlightSnippet (never raw server text) -->
                <div
                  v-for="(snippet, i) in result.snippets"
                  :key="i"
                  class="gs-snip text-secondary text-xs leading-[1.55] overflow-hidden text-ellipsis"
                  v-html="highlightSnippet(snippet, appliedTerm)"
                ></div>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-if="store.contentStatus.value === 'loading'" class="help-loading text-secondary italic p-7 text-center">{{ t('common.loading') }}</div>
            <div v-else-if="store.contentStatus.value === 'error'" class="help-loading text-secondary italic p-7 text-center">{{ t('misc.help.failedLoadContent') }}</div>
            <div v-else-if="store.indexStatus.value === 'empty'" class="help-loading text-secondary italic p-7 text-center">{{ t('misc.help.noHelpTopics') }}</div>
            <!-- markdown: DOMPurify-sanitized in lib/markdown.renderMarkdown before v-html (never raw) -->
            <div v-else-if="store.topicHtml.value !== null" v-html="displayHtml"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
  </AppShell>
</template>

<style>
/* ═══════════════════════════════════════════════════════════════
   Ported from styles/help.css (deleted at the Tailwind migration).
   Everything expressible as utilities moved onto the templates
   (App.vue + HelpToc.vue); the rules below stay as CSS for the
   documented reasons. This block is unscoped on purpose — the old
   stylesheet was page-global, and the html/body and injected-markdown
   rules have no component root to scope to.

   Dropped outright: the * reset and the html/body height/width/
   font-size/background/colour defaults — preflight and the base layer
   in src/styles/tailwind.css already provide them identically — plus
   #help-search-global-lbl input[type="checkbox"] accent-color/margin
   (base layer + preflight provide those too). Only the html/body
   declarations that differ from the shared base stay: the legacy
   CJK-first font stack (the shared stack is Space Grotesk-led) and the
   page's overflow lock.
   ═══════════════════════════════════════════════════════════════ */

/* ── Page root chrome ────────────────────────────────────────── */
html,
body {
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif;
}

/* ── Markdown content (#help-content) ──────────────────────────
   The topic body is markdown rendered via v-html (lib/markdown.ts) and
   the global-search snippets carry <mark> highlights from lib/search.ts
   — none of that DOM carries this component's scope attribute, so
   utilities cannot reach it. Every descendant selector stays right
   here, anchored on the #help-content id exactly like the legacy
   stylesheet. */
#help-content h1 {
  font-size: var(--fs-xl);
  color: var(--text-primary);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
}

#help-content h2 {
  font-size: var(--fs-lg);
  color: var(--text-primary);
  margin: 1.5rem 0 0.5rem;
}

#help-content h3 {
  font-size: var(--fs-md);
  color: var(--text-primary);
  margin: 1.1rem 0 0.35rem;
}

#help-content p { margin: 0.5rem 0; }
#help-content a { color: var(--accent-soft); text-decoration: none; }
#help-content a:hover { text-decoration: underline; }
#help-content strong { color: var(--text-primary); }
#help-content em { color: var(--text-secondary); font-style: italic; }
#help-content code {
  background: var(--bg-card);
  color: var(--warning-soft);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  font-size: var(--fs-xs);
  font-family: 'Fira Code', 'Consolas', monospace;
}

#help-content pre {
  background: var(--bg-page);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}

#help-content pre code {
  background: none;
  padding: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

#help-content ul,
#help-content ol {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

#help-content li { margin: 0.2rem 0; }

#help-content blockquote {
  border-left: 3px solid var(--accent-soft);
  margin: 0.75rem 0;
  padding: 0.4rem 0.9rem;
  background: rgb(var(--accent-rgb) / 0.05);
  border-radius: 0 5px 5px 0;
  color: var(--text-secondary);
}

#help-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
}

#help-content th,
#help-content td {
  border: 1px solid var(--border-default);
  padding: 0.4rem 0.7rem;
  text-align: left;
  font-size: var(--fs-sm);
  vertical-align: top;
}

#help-content th {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
}

#help-content hr {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 1rem 0;
}

#help-content img {
  max-width: 100%;
  border-radius: 6px;
  margin: 0.5rem 0;
}

#help-content mark {
  background: rgb(var(--warning-rgb) / 0.2);
  color: var(--warning-soft);
  border-radius: 2px;
}

/* gotoMark() toggles .current on the injected <mark> nodes via
   classList — utilities cannot reach that DOM either. */
#help-content mark.current {
  background: rgb(var(--warning-rgb) / 0.45);
  color: var(--warning-soft);
  outline: 1px solid var(--warning);
}
</style>

<style scoped>
/* Page-level AppShell overrides — ported from styles/help.css at the
   Tailwind migration. The :deep() rules target AppShell internals (the
   classes live on elements the shared component renders), so they stay
   as CSS instead of utilities. */
.support-page-shell :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.support-page-shell :deep(.app-shell__primary) {
  min-height: 0;
}
</style>
