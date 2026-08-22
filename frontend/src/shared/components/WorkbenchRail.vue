<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { PhSidebarSimple } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import type { NavigationGroup, NavigationItem, PageSection } from '@/shared/navigation';
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
      props.sections &&
      props.sections.length > 0 &&
      !visuallyCollapsed.value,
  );
}

function onItemClick(event: MouseEvent, item: NavigationItem): void {
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
      <span class="workbench-rail__brand-mark" aria-hidden="true">PB</span>
      <span v-if="!visuallyCollapsed" class="workbench-rail__brand-name">PBGui</span>
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
              :class="{ 'workbench-rail__item--active': item.pageKey === props.activePage }"
              :href="item.href"
              :aria-current="item.pageKey === props.activePage ? 'page' : undefined"
              :aria-label="visuallyCollapsed ? t(item.labelKey) : undefined"
              :title="visuallyCollapsed ? t(item.labelKey) : undefined"
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
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </section>
    </div>

    <IconButton
      class="pbgui-icon-button workbench-rail__toggle"
      data-testid="rail-toggle"
      :icon="PhSidebarSimple"
      :label="t(props.collapsed ? 'nav.expandRail' : 'nav.collapseRail')"
      :aria-expanded="String(!visuallyCollapsed)"
      aria-controls="workbench-nav-list"
      @click="toggleCollapsed"
      @keydown.enter.prevent="toggleCollapsed"
      @keydown.space.prevent="toggleCollapsed"
    />
  </nav>
</template>
