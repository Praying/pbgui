<script setup lang="ts">
/**
 * Dynamic-ignore preview — v7_edit.html:1075-1079 markup,
 * updateDynamicIgnorePreview/fetchDynamicIgnorePreview (:3386-3415) and the
 * 600 ms debounced auto-refresh on filter changes (:3427-3446). v7-only.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditPageContext } from '../composables/useEditPage';
import { fetchCoinsFilter } from '../lib/coinsFilter';

const { t } = useI18n();
const page = useEditPageContext();

const approved = ref('');
const ignored = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;

async function refresh(): Promise<void> {
  if (!page.state.dynamicIgnore) return;
  const exchange = page.selectedUserExchange();
  if (!exchange) return;
  try {
    const data = await fetchCoinsFilter(page.apiBaseOf(), page.state, exchange, page.state.tags);
    approved.value = 'approved_symbols: [' + (data.approved ?? []).join(', ') + ']';
    ignored.value = 'ignored_symbols: [' + (data.ignored ?? []).join(', ') + ']';
  } catch (e) {
    approved.value = t('common.error') + ': ' + (e instanceof Error ? e.message : String(e));
  }
}

/** _scheduleIgnoreRefresh (:3429-3433) — debounce 600 ms. */
function schedule(): void {
  if (!page.state.dynamicIgnore) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refresh();
  }, 600);
}

/* Checkbox flip → immediate refresh (updateDynamicIgnorePreview :3386-3391). */
watch(
  () => page.state.dynamicIgnore,
  (show) => {
    if (show) void refresh();
  }
);

/* Filter changes → the 600 ms debounce (_scheduleIgnoreRefresh :3429-3446);
 * schedule() itself early-returns while the checkbox is off. */
watch(
  () => [
    page.state.marketCap,
    page.state.volMcap,
    page.state.onlyCpt,
    page.state.noticesIgnore,
    page.state.tags.length,
    page.state.tags.slice(),
  ],
  () => schedule()
);

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer);
});
</script>

<template>
  <div v-if="page.state.dynamicIgnore" id="dynamic-ignore-preview">
    <div class="text-sm text-secondary mb-1">
      {{ t('v7run.dynamicIgnorePreview') }}
    </div>
    <pre id="di-approved" class="text-xs text-success mb-1 whitespace-pre-wrap">{{ approved }}</pre>
    <pre id="di-ignored" class="text-xs text-warning whitespace-pre-wrap">{{ ignored }}</pre>
  </div>
</template>
