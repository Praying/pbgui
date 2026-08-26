<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { PhSidebarSimple, PhSparkle } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import type { NavigationGroup, NavigationItem, PageSection } from '@/shared/navigation';
import { markAiUserInteraction, openAiDrawer, useAiDrawerAvailable } from '@/shared/ai/drawer';
import IconButton from './IconButton.vue';
import PbIcon from './PbIcon.vue';

const RAIL_STORAGE_KEY = 'pbgui-workbench-rail-collapsed';

interface WorkbenchRailProps {
  groups: readonly NavigationGroup[];
  activePage: string;
  collapsed: boolean;
  sections?: readonly PageSection[];
  activeSection?: string;
}

const props = defineProps<WorkbenchRailProps>();

const emit = defineEmits<{
  'update:collapsed': [collapsed: boolean];
  'update:section': [sectionKey: string];
}>();

const { t } = useI18n();

/* AI assistant drawer: same lazy-load contract as the legacy topnav —
   js/ai_drawer.js (+css) is fetched on the first open and only shown for
   token-authenticated sessions. A real user click also cancels the
   preference-based auto-open (legacy isTrusted gate). */
const { available: aiAvailable } = useAiDrawerAvailable();

function onAiButtonClick(): void {
  markAiUserInteraction();
  openAiDrawer();
}

const railEl = useTemplateRef<HTMLElement>('rail');

/* Collapsed-rail reveal: clicking the active page's icon temporarily expands
   the whole rail as an overlay so its section children become reachable.
   Selecting a section, Escape (while focus is in the rail), or a click
   outside collapses it back — the collapsed preference itself is never
   touched. Other icons keep navigating directly: cross-page jumps stay
   one click. */
const tempExpanded = ref(false);

const visuallyCollapsed = computed(() => props.collapsed && !tempExpanded.value);

function toggleCollapsed(): void {
  const nextCollapsed = !props.collapsed;

  try {
    localStorage.setItem(RAIL_STORAGE_KEY, String(nextCollapsed));
  } catch {
    // The controlled state still updates when storage is unavailable.
  }

  if (!nextCollapsed) tempExpanded.value = false;
  emit('update:collapsed', nextCollapsed);
}

function hasChildren(item: NavigationItem): boolean {
  return Boolean(
    item.pageKey === props.activePage &&
      !item.disabled &&
      props.sections &&
      props.sections.length > 0 &&
      !visuallyCollapsed.value,
  );
}

/** Collapsed-rail tooltips carry the unavailable note for disabled items. */
function itemTitle(item: NavigationItem): string {
  const label = t(item.labelKey);
  return item.disabled ? `${label} — ${t('nav.itemDisabled')}` : label;
}

function onItemClick(event: MouseEvent, item: NavigationItem): void {
  if (item.disabled) return;
  if (!props.collapsed || tempExpanded.value) return;
  if (item.pageKey !== props.activePage || !props.sections?.length) return;
  event.preventDefault();
  tempExpanded.value = true;
}

function selectSection(sectionKey: string): void {
  tempExpanded.value = false;
  emit('update:section', sectionKey);
}

function onDocumentPointerdown(event: PointerEvent): void {
  if (!tempExpanded.value) return;
  const el = railEl.value;
  if (!el || !event.target || !el.contains(event.target as Node)) tempExpanded.value = false;
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !tempExpanded.value) return;
  // Only claim Escape while focus lives in the rail; otherwise let the
  // page's own dialogs (file browser etc.) handle it.
  const el = railEl.value;
  if (el && el.contains(document.activeElement)) tempExpanded.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerdown);
  document.addEventListener('keydown', onDocumentKeydown);
  scrollActiveIntoView();
});

/* The rail groups overflow scroll; the pbv7/pbv8 groups sit below the fold
   on shorter viewports, so the active page (and its section children) must
   be scrolled into view on load and on cross-page navigation. Instant on
   purpose — a smooth scroll on every page load reads as lag. */
function scrollActiveIntoView(): void {
  void nextTick(() => {
    railEl.value
      ?.querySelector('.workbench-rail__item--active')
      /* jsdom lacks scrollIntoView — optional call keeps tests quiet. */
      ?.scrollIntoView?.({ block: 'nearest' });
  });
}

watch(() => [props.activePage, visuallyCollapsed.value], () => {
  if (!visuallyCollapsed.value) scrollActiveIntoView();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerdown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <nav
    ref="rail"
    id="workbench-rail"
    class="workbench-rail"
    :class="{
      'workbench-rail--collapsed': visuallyCollapsed,
      'workbench-rail--temp-expanded': tempExpanded,
    }"
    :aria-label="t('nav.primaryNavigation')"
  >
    <div class="workbench-rail__brand" aria-label="PBGui">
      <span v-if="!visuallyCollapsed" class="workbench-rail__brand-mark" aria-hidden="true">PB</span>
      <span v-if="!visuallyCollapsed" class="workbench-rail__brand-name">PBGui</span>
      <IconButton
        class="pbgui-icon-button workbench-rail__toggle"
        data-testid="rail-toggle"
        :icon="PhSidebarSimple"
        :label="t(visuallyCollapsed ? 'nav.expandRail' : 'nav.collapseRail')"
        :aria-expanded="String(!visuallyCollapsed)"
        aria-controls="workbench-nav-list"
        @click="toggleCollapsed"
        @keydown.enter.prevent="toggleCollapsed"
        @keydown.space.prevent="toggleCollapsed"
      />
    </div>

    <div id="workbench-nav-list" class="workbench-rail__groups">
      <section
        v-for="group in props.groups"
        :key="group.id"
        class="workbench-rail__group"
        :aria-labelledby="`workbench-group-${group.id}`"
      >
        <h2
          :id="`workbench-group-${group.id}`"
          class="workbench-rail__group-label"
          :class="{ 'sr-only': visuallyCollapsed }"
        >
          {{ t(group.labelKey) }}
        </h2>

        <ul class="workbench-rail__items">
          <li v-for="item in group.items" :key="item.pageKey">
            <a
              class="workbench-rail__item"
              :class="{
                'workbench-rail__item--active': item.pageKey === props.activePage && !item.disabled,
                'workbench-rail__item--disabled': item.disabled,
              }"
              :href="item.disabled ? undefined : item.href"
              :aria-current="item.pageKey === props.activePage && !item.disabled ? 'page' : undefined"
              :aria-disabled="item.disabled ? 'true' : undefined"
              :aria-label="visuallyCollapsed ? itemTitle(item) : undefined"
              :title="visuallyCollapsed ? itemTitle(item) : item.disabled ? itemTitle(item) : undefined"
              @click="onItemClick($event, item)"
            >
              <PbIcon class="pbgui-icon" :icon="item.icon" :size="18" />
              <span v-if="!visuallyCollapsed" class="workbench-rail__item-label">
                {{ t(item.labelKey) }}
              </span>
            </a>

            <!-- Accordion: section children render only under the active
                 page and only while the rail is visually expanded. -->
            <ul
              v-if="hasChildren(item)"
              class="workbench-rail__subitems"
              :aria-label="t('nav.pageSections')"
            >
              <li v-for="section in props.sections" :key="section.key">
                <button
                  type="button"
                  class="workbench-rail__subitem"
                  :data-testid="`rail-section-${section.key}`"
                  :class="{ 'workbench-rail__subitem--active': section.key === props.activeSection }"
                  :disabled="section.disabled === true"
                  :aria-current="section.key === props.activeSection ? 'location' : undefined"
                  @click="selectSection(section.key)"
                >
                  <span
                    v-if="section.tone"
                    class="workbench-rail__subitem-dot"
                    :data-tone="section.tone"
                    aria-hidden="true"
                  ></span>
                  <span class="workbench-rail__subitem-label">{{ section.label }}</span>
                  <span
                    v-if="section.badge"
                    class="workbench-rail__subitem-badge"
                    :data-testid="`rail-section-badge-${section.key}`"
                  >{{ section.badge }}</span>
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </section>
    </div>

    <div v-if="aiAvailable" class="workbench-rail__ai">
      <button
        type="button"
        id="pbgui-ai-btn"
        class="workbench-rail__ai-btn"
        :title="t('nav.open_ai_assistant')"
        :aria-label="t('nav.open_ai_assistant')"
        aria-expanded="false"
        aria-controls="pbgui-ai-drawer"
        @click="onAiButtonClick"
      >
        <PbIcon :icon="PhSparkle" :size="18" />
        <span v-if="!visuallyCollapsed" class="workbench-rail__ai-label">{{ t('nav.ai') }}</span>
      </button>
    </div>
  </nav>
</template>
