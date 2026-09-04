<script setup lang="ts">
/*
 * Help & Tutorials page — Modern documentation workspace in PBGui.
 * Formatted as a responsive 2-column workspace inside AppShell:
 * - Left column: TOC sidebar (HelpToc.vue) with instantaneous search/filter
 * - Right column: Markdown reader (#help-content) with syntax styling and bottom topic pager
 * - WorkspaceHeader #header-actions: Search bar with in-topic match navigation + global search toggle,
 *   and language switcher pills (EN / DE / 中文).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import {
  PhArrowDown,
  PhArrowUp,
  PhBookOpen,
  PhCaretLeft,
  PhCaretRight,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import HelpToc from './components/HelpToc.vue';
import { useHelpContent, type GlobalSearchResult } from './composables/useHelpContent';
import { highlightMarks, highlightSnippet } from './lib/search';

const { t } = useI18n();
const store = useHelpContent();

/* .lang-pill active-segment tint. 'active' stays as the inert state anchor the page tests assert. */
const LANG_ACTIVE_CLASS = 'active bg-border-default text-accent-soft';

/* ── bootstrap (query param keyword matching) ── */
const TOPIC = new URLSearchParams(window.location.search).get('topic') || '';

declare global {
  interface Window {
    openHelpOverlay?: (keyword?: string) => void;
    PBGUI_HELP_OPENER?: () => void;
  }
}

/* ── search state ── */
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

const searchCountText = computed(() => {
  if (globalMode.value) return globalCountText.value;
  if (searchMarksCount.value) return `${searchIndex.value + 1}/${searchMarksCount.value}`;
  return searchTermRaw.value.trim() ? t('misc.help.found0') : '';
});

/* In-topic view: sanitized html, optionally with <mark> highlights */
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

function gotoMark(index: number): void {
  if (!markEls.length) return;
  if (searchIndex.value >= 0 && searchIndex.value < markEls.length) {
    markEls[searchIndex.value]!.classList.remove('current');
  }
  searchIndex.value = ((index % markEls.length) + markEls.length) % markEls.length;
  const el = markEls[searchIndex.value]!;
  el.classList.add('current');
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

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

function openGlobalResult(index: number): void {
  globalMode.value = false;
  void store.loadTopic(index);
}

/* Debounced search input (260ms) */
watch(searchTermRaw, (value) => {
  if (searchTimer !== undefined) clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    appliedTerm.value = value.trim();
  }, 260);
});

/* Applied term → applySearch/clearSearch */
watch(appliedTerm, async () => {
  if (globalMode.value) {
    await runGlobalSearch(appliedTerm.value);
    return;
  }
  if (store.topicHtml.value === null) return;
  await refreshMarks();
  if (appliedTerm.value && markEls.length) gotoMark(0);
});

/* Global-mode checkbox */
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

/* Topic content arrived → scroll top + re-apply in-topic search */
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

function openHelp(keyword?: string): void {
  if (!store.loaded.value) {
    void store.loadIndex(keyword || 'overview');
  } else if (keyword) {
    void store.loadIndex(keyword);
  }
}

onMounted(() => {
  document.title = t('misc.help.title');
  window.openHelpOverlay = openHelp;
  window.PBGUI_HELP_OPENER = () => openHelp();
  openHelp(TOPIC || 'overview');
});

onBeforeUnmount(() => {
  if (searchTimer !== undefined) clearTimeout(searchTimer);
  delete window.openHelpOverlay;
  delete window.PBGUI_HELP_OPENER;
});
</script>

<template>
  <AppShell
    class="core-workbench-shell support-page-shell support-page-shell--help"
    page-key="help"
    :page-title="t('misc.help.title')"
  >
    <template #header-actions>
      <div class="flex items-center gap-2 max-[720px]:flex-wrap">
        <!-- Search bar -->
        <div id="help-search-wrap" class="flex items-center gap-1 bg-surface rounded-md px-2 py-0.5 border border-border-default">
          <Input
            id="help-search"
            v-model="searchTermRaw"
            type="text"
            class="h-7 w-44 max-[720px]:w-32 text-xs border-0 bg-transparent focus-visible:ring-0 shadow-none px-1"
            :placeholder="searchPlaceholder"
            autocomplete="off"
            @keydown="onSearchKeydown"
          />
          <Button
            class="help-snav-btn h-6 w-6 p-0"
            id="help-search-up"
            type="button"
            variant="ghost"
            size="sm"
            :title="t('misc.help.previousMatch')"
            :aria-label="t('misc.help.previousMatch')"
            @click="gotoMark(searchIndex - 1)"
          ><PbIcon :icon="PhArrowUp" class="w-3.5 h-3.5" /></Button>
          <Button
            class="help-snav-btn h-6 w-6 p-0"
            id="help-search-dn"
            type="button"
            variant="ghost"
            size="sm"
            :title="t('misc.help.nextMatch')"
            :aria-label="t('misc.help.nextMatch')"
            @click="gotoMark(searchIndex + 1)"
          ><PbIcon :icon="PhArrowDown" class="w-3.5 h-3.5" /></Button>
          <span id="help-search-count" class="text-xs text-muted whitespace-nowrap min-w-[36px] text-center font-mono">{{ searchCountText }}</span>
          <div class="w-px h-3.5 bg-border-subtle mx-0.5"></div>
          <label id="help-search-global-lbl" class="flex items-center gap-1 text-secondary text-xs cursor-pointer whitespace-nowrap select-none hover:text-primary" :title="t('misc.help.searchAcrossAll')">
            <Checkbox id="help-search-global" v-model="globalMode" />
            <span>{{ t('common.all') }}</span>
          </label>
        </div>

        <!-- Language Switcher Pill -->
        <div class="lang-pill flex border border-border-default rounded-md overflow-hidden shrink-0 bg-surface">
          <Button id="help-lang-en" type="button" variant="ghost" size="sm" class="h-7 px-2.5 text-xs rounded-none" :class="store.lang.value === 'EN' ? LANG_ACTIVE_CLASS : ''" @click="store.switchLang('EN')">EN</Button>
          <Button id="help-lang-de" type="button" variant="ghost" size="sm" class="h-7 px-2.5 text-xs rounded-none border-l border-border-subtle" :class="store.lang.value === 'DE' ? LANG_ACTIVE_CLASS : ''" @click="store.switchLang('DE')">DE</Button>
          <Button id="help-lang-zh" type="button" variant="ghost" size="sm" class="h-7 px-2.5 text-xs rounded-none border-l border-border-subtle" :title="t('misc.help.chineseDocs')" :class="store.lang.value === 'ZH' ? LANG_ACTIVE_CLASS : ''" @click="store.switchLang('ZH')">中文</Button>
        </div>
      </div>
    </template>

    <MigrationWatermark />

    <!-- Main Workspace -->
    <div id="help-workspace" class="flex flex-1 w-full min-w-0 h-full overflow-hidden max-[720px]:flex-col">
      <!-- Left Column: Topic List (TOC) -->
      <HelpToc
        v-model:filter="store.filter.value"
        :entries="store.filteredTopics.value"
        :selected="store.selected.value"
        :status="store.indexStatus.value"
        @select="store.loadTopic"
      />

      <!-- Right Column: Document Reader & Search View -->
      <div id="help-content-pane" class="flex-1 flex flex-col w-full h-full overflow-hidden min-w-0 bg-page">
        <div id="help-content" ref="contentEl" class="flex-1 w-full overflow-y-auto px-8 py-8 max-[720px]:px-4 max-[720px]:py-4 text-primary text-base">
          <div class="help-reader-container w-full max-w-[920px] mx-auto min-h-full flex flex-col justify-between min-w-0">
            <!-- Global Mode Search Results -->
            <template v-if="globalMode">
              <LoadingSkeleton v-if="globalStatus === 'searching'" class="p-12" :label="t('misc.help.searching')" />
              <div v-else-if="globalMessage" class="text-muted p-8 text-center bg-card/40 rounded-lg border border-border-subtle">{{ globalMessage }}</div>
              <div v-else-if="globalResults.length" class="gs-results flex flex-col gap-3 py-2 w-full">
                <div
                  v-for="result in globalResults"
                  :key="result.idx"
                  class="gs-item w-full bg-card hover:bg-elevated border border-border-default hover:border-secondary rounded-lg p-4 cursor-pointer transition-all duration-150 shadow-sm"
                  :data-idx="result.idx"
                  @click="openGlobalResult(result.idx)"
                >
                  <div class="gs-topic text-accent-soft font-semibold text-base mb-1.5 flex items-center gap-2">
                    <PbIcon :icon="PhBookOpen" class="w-4 h-4 text-accent" />
                    <span>{{ result.title }}</span>
                  </div>
                  <!-- escaped + <mark>-wrapped in lib/search.highlightSnippet (never raw server text) -->
                  <div
                    v-for="(snippet, i) in result.snippets"
                    :key="i"
                    class="gs-snip text-secondary text-sm leading-relaxed overflow-hidden text-ellipsis pl-6 mt-1"
                    v-html="highlightSnippet(snippet, appliedTerm)"
                  ></div>
                </div>
              </div>
            </template>

            <!-- Normal In-Topic Reader View -->
            <template v-else>
              <LoadingSkeleton v-if="store.contentStatus.value === 'loading'" class="p-12" :label="t('common.loading')" />
              <ErrorState
                v-else-if="store.contentStatus.value === 'error'"
                class="p-12"
                :title="t('common.error')"
                :message="t('misc.help.failedLoadContent')"
                :retry-label="t('market.retry')"
                @retry="store.loadTopic(store.selected.value)"
              />
              <EmptyState v-else-if="store.indexStatus.value === 'empty'" class="p-12" :title="t('misc.help.noHelpTopics')" />
              <template v-else-if="store.topicHtml.value !== null">
                <!-- markdown: DOMPurify-sanitized in lib/markdown.renderMarkdown before v-html -->
                <article class="help-article block w-full min-w-full flex-1" v-html="displayHtml"></article>

                <!-- Bottom Topic Pager (Previous / Next) -->
                <nav
                  id="help-pager"
                  aria-label="Topic navigation"
                  class="mt-12 pt-6 border-t border-border-subtle flex items-stretch justify-between gap-4 select-none w-full max-[600px]:flex-col"
                >
                  <div class="flex-1 min-w-0">
                    <button
                      v-if="store.prevTopic.value"
                      id="help-prev-topic"
                      type="button"
                      class="group w-full h-full flex flex-col text-left p-4 rounded-lg border border-border-subtle hover:border-accent-soft bg-card/40 hover:bg-elevated transition-colors"
                      @click="store.loadTopic(store.prevTopic.value.index)"
                    >
                      <span class="text-xs text-muted flex items-center gap-1 mb-1 group-hover:text-accent-soft">
                        <PbIcon :icon="PhCaretLeft" class="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                        {{ t('misc.help.prevTopic') }}
                      </span>
                      <span class="text-sm font-semibold text-primary group-hover:text-accent-soft truncate block">
                        {{ store.prevTopic.value.topic.title }}
                      </span>
                    </button>
                  </div>

                  <div class="flex-1 min-w-0 text-right">
                    <button
                      v-if="store.nextTopic.value"
                      id="help-next-topic"
                      type="button"
                      class="group w-full h-full flex flex-col items-end text-right p-4 rounded-lg border border-border-subtle hover:border-accent-soft bg-card/40 hover:bg-elevated transition-colors"
                      @click="store.loadTopic(store.nextTopic.value.index)"
                    >
                      <span class="text-xs text-muted flex items-center gap-1 mb-1 group-hover:text-accent-soft">
                        {{ t('misc.help.nextTopic') }}
                        <PbIcon :icon="PhCaretRight" class="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span class="text-sm font-semibold text-primary group-hover:text-accent-soft truncate block">
                        {{ store.nextTopic.value.topic.title }}
                      </span>
                    </button>
                  </div>
                </nav>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style>
/* ── Markdown content (#help-content) ────────────────────────── */
#help-content {
  display: block;
  width: 100%;
  box-sizing: border-box;
}

.help-reader-container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  max-width: 920px;
  min-width: 0;
  min-height: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

#help-content article,
.help-article {
  display: block;
  width: 100% !important;
  min-width: 100% !important;
  box-sizing: border-box;
  text-wrap: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
}

#help-content h1,
#help-content h2,
#help-content h3 {
  display: block;
  width: 100% !important;
  text-wrap: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
}

#help-content h1 {
  font-size: var(--fs-xl);
  color: var(--text-primary);
  margin: 0 0 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 700;
}

#help-content h2 {
  font-size: var(--fs-lg);
  color: var(--text-primary);
  margin: 2rem 0 0.75rem;
  font-weight: 600;
}

#help-content h3 {
  font-size: var(--fs-md);
  color: var(--text-primary);
  margin: 1.5rem 0 0.5rem;
  font-weight: 600;
}

#help-content p {
  display: block;
  width: 100% !important;
  margin: 0.75rem 0;
  line-height: 1.75;
  text-wrap: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
}

#help-content a { color: var(--accent-soft); text-decoration: none; }
#help-content a:hover { text-decoration: underline; }
#help-content strong { color: var(--text-primary); font-weight: 600; }
#help-content em { color: var(--text-secondary); font-style: italic; }
#help-content code {
  background: var(--bg-card);
  color: var(--warning-soft);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.88em;
  font-family: 'Fira Code', 'Consolas', monospace;
  border: 1px solid var(--border-subtle);
}

#help-content pre {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 1rem 1.2rem;
  overflow-x: auto;
  margin: 1rem 0;
  width: 100% !important;
  box-sizing: border-box;
}

#help-content pre code {
  background: none;
  padding: 0;
  border: none;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

#help-content ul,
#help-content ol {
  padding-left: 1.6rem;
  margin: 0.75rem 0;
  width: 100% !important;
  box-sizing: border-box;
}

#help-content li {
  margin: 0.35rem 0;
  text-wrap: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
}

#help-content blockquote {
  border-left: 3px solid var(--accent-soft);
  margin: 1rem 0;
  padding: 0.6rem 1rem;
  background: rgb(var(--accent-rgb) / 0.06);
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
  text-wrap: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  width: 100% !important;
  box-sizing: border-box;
}

#help-content table {
  border-collapse: collapse;
  width: 100% !important;
  margin: 1.25rem 0;
}

#help-content th,
#help-content td {
  border: 1px solid var(--border-default);
  padding: 0.6rem 0.9rem;
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
  margin: 1.5rem 0;
}

#help-content img {
  max-width: 100%;
  border-radius: 8px;
  margin: 1rem 0;
}

#help-content mark {
  background: rgb(var(--warning-rgb) / 0.25);
  color: var(--warning-soft);
  border-radius: 2px;
  padding: 0 2px;
}

#help-content mark.current {
  background: rgb(var(--warning-rgb) / 0.5);
  color: var(--warning-soft);
  outline: 1px solid var(--warning);
}
</style>

<style scoped>
.support-page-shell :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.support-page-shell :deep(.app-shell__primary) {
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
</style>
