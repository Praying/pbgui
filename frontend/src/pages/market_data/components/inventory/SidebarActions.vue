<script setup lang="ts">
/*
 * M-data-6 — the inventory sidebar blocks (legacy #inventory-subsection-nav
 * + #sidebar-inventory-build + #sidebar-inventory-delete, market_data_main
 * :2929-2945; visibility :6350-6374, labels :8339-8386). Rendered inside
 * SidebarNav after the integrity button; the store computes every flag.
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { sbSepClass } from '../../lib/uiClasses';
import type { InventorySubsection } from '../../types';

defineProps<{
  /** #inventory-subsection-nav hidden — the active-panel check (:6357). */
  navVisible: boolean;
  availableViews: readonly InventorySubsection[];
  activeView: InventorySubsection;
  /** #sidebar-inventory-build hidden (:6358 + :8352). */
  buildVisible: boolean;
  buildText: string;
  buildDisabled: boolean;
  /** #sidebar-inventory-delete hidden (:6368-6371). */
  deleteVisible: boolean;
  deleteText: string;
  deleteDisabled: boolean;
  olderDisabled: boolean;
}>();

const emit = defineEmits<{
  /** View tab click → setActiveInventoryView (:6376-6386). */
  selectView: [view: InventorySubsection];
  build: [];
  deleteSelected: [];
  deleteOlder: [];
  clearDataset: [];
}>();

const { t } = useI18n();

/** Static legacy labels (:2930-2933) — only PB7 cache is translated. */
const VIEW_LABEL: Record<InventorySubsection, string> = {
  '1m': '1m',
  '1m_api': '1m_api',
  l2Book: 'l2Book',
  pb7_cache: 'market.pb7Cache',
};

function label(view: InventorySubsection): string {
  const labelKey = VIEW_LABEL[view];
  return view === 'pb7_cache' ? t(labelKey) : labelKey;
}

/** The former block layout (:168-219 tail) — flex-wrap row, seps dropped
 *  from view (legacy #sidebar-*-build .sb-sep { display: none }). */
const blockClass = 'flex flex-wrap items-center gap-1';
</script>

<template>
  <div id="inventory-subsection-nav" :class="blockClass" :hidden="!navVisible">
    <Button
      v-for="view in availableViews"
      :key="view"
      variant="ghost"
      size="sm"
      class="inventory-subsection-btn"
      :class="{ 'active border-success/75 bg-success/14 text-success-soft shadow-[inset_0_0_0_1px_rgb(var(--success-rgb)/0.16)]': view === activeView }"
      type="button"
      @click="emit('selectView', view)"
    >{{ label(view) }}</Button>
  </div>
  <div id="sidebar-inventory-build" :class="blockClass" :hidden="!buildVisible">
    <hr :class="[sbSepClass, 'hidden']" />
    <Button
      variant="secondary"
      class="sb-btn"
      id="btn-inventory-build-best1m"
      type="button"
      :disabled="buildDisabled"
      @click="emit('build')"
    >{{ buildText }}</Button>
  </div>
  <div id="sidebar-inventory-delete" :class="blockClass" :hidden="!deleteVisible">
    <hr :class="[sbSepClass, 'hidden']" />
    <Button
      variant="secondary"
      class="sb-btn"
      id="btn-inventory-delete-selected"
      type="button"
      :disabled="deleteDisabled"
      @click="emit('deleteSelected')"
    >{{ deleteText }}</Button>
    <Button
      variant="secondary"
      class="sb-btn"
      id="btn-inventory-delete-older"
      type="button"
      :disabled="olderDisabled"
      @click="emit('deleteOlder')"
    >{{ t('market.deleteByDateTitle') }}</Button>
    <hr :class="[sbSepClass, 'hidden']" />
    <Button
      variant="secondary"
      class="sb-btn"
      id="btn-inventory-clear-dataset"
      type="button"
      @click="emit('clearDataset')"
    >{{ t('market.clearDataset') }}</Button>
  </div>
</template>
