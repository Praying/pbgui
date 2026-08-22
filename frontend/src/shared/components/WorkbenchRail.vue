<script setup lang="ts">
import { PhSidebarSimple } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import type { NavigationGroup } from '@/shared/navigation';
import IconButton from './IconButton.vue';
import PbIcon from './PbIcon.vue';

const RAIL_STORAGE_KEY = 'pbgui-workbench-rail-collapsed';

interface WorkbenchRailProps {
  groups: readonly NavigationGroup[];
  activePage: string;
  collapsed: boolean;
}

const props = defineProps<WorkbenchRailProps>();

const emit = defineEmits<{
  'update:collapsed': [collapsed: boolean];
}>();

const { t } = useI18n();

function toggleCollapsed(): void {
  const nextCollapsed = !props.collapsed;

  try {
    localStorage.setItem(RAIL_STORAGE_KEY, String(nextCollapsed));
  } catch {
    // The controlled state still updates when storage is unavailable.
  }

  emit('update:collapsed', nextCollapsed);
}
</script>

<template>
  <nav
    id="workbench-rail"
    class="workbench-rail"
    :class="{ 'workbench-rail--collapsed': props.collapsed }"
    :aria-label="t('nav.primaryNavigation')"
  >
    <div class="workbench-rail__brand" aria-label="PBGui">
      <span class="workbench-rail__brand-mark" aria-hidden="true">PB</span>
      <span v-if="!props.collapsed" class="workbench-rail__brand-name">PBGui</span>
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
          :class="{ 'sr-only': props.collapsed }"
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
              :aria-label="props.collapsed ? t(item.labelKey) : undefined"
              :title="props.collapsed ? t(item.labelKey) : undefined"
            >
              <PbIcon class="pbgui-icon" :icon="item.icon" :size="18" />
              <span v-if="!props.collapsed" class="workbench-rail__item-label">
                {{ t(item.labelKey) }}
              </span>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <IconButton
      class="pbgui-icon-button workbench-rail__toggle"
      data-testid="rail-toggle"
      :icon="PhSidebarSimple"
      :label="t(props.collapsed ? 'nav.expandRail' : 'nav.collapseRail')"
      :aria-expanded="String(!props.collapsed)"
      aria-controls="workbench-nav-list"
      @click="toggleCollapsed"
      @keydown.enter.prevent="toggleCollapsed"
      @keydown.space.prevent="toggleCollapsed"
    />
  </nav>
</template>
