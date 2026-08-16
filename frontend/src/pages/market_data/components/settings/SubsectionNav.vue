<script setup lang="ts">
/*
 * Settings subsection nav — legacy #settings-subsection-nav
 * (market_data_main.html:2953-2957; registry settingsSubsectionButtons
 * :3683-3687; visibility syncSettingsSubsectionVisibility :6161-6167).
 *
 * Rendered inside the sidebar context block (SidebarNav). The click does two
 * things in legacy (:9605-9608): switch to the settings panel AND set the
 * subsection — the parent wires both on the `select` event.
 */
import { useI18n } from 'vue-i18n';
import { SETTINGS_SUBSECTION_BUTTONS } from '../../composables/usePanels';
import type { SettingsSubsection } from '../../types';

defineProps<{
  /** getAvailableSettingsSubsections (:6146-6150). */
  available: readonly SettingsSubsection[];
  /** getResolvedSettingsSubsection (:6152-6155). */
  active: SettingsSubsection;
}>();

const emit = defineEmits<{
  select: [key: SettingsSubsection];
}>();

const { t } = useI18n();
</script>

<template>
  <div id="settings-subsection-nav">
    <button
      v-for="item in SETTINGS_SUBSECTION_BUTTONS"
      :id="item.buttonId"
      :key="item.key"
      class="sb-btn settings-subsection-btn"
      type="button"
      :hidden="!available.includes(item.key)"
      :class="{ active: available.includes(item.key) && item.key === active }"
      @click="emit('select', item.key)"
    >{{ t(item.labelKey) }}</button>
  </div>
</template>
