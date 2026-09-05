<script setup lang="ts">
/**
 * Filters + coin multiselects + tags — v7_edit.html:992-1079. The coin
 * multiselect option lists come from the symbols/tags composable; the
 * dynamic-ignore preview and the coin-overrides container land in M-v7-2.
 */
import { useI18n } from 'vue-i18n';
import FieldCheck from './FieldCheck.vue';
import FieldNumber from './FieldNumber.vue';
import MultiSelectField from './MultiSelectField.vue';
import { useEditPageContext } from '../composables/useEditPage';
import { fetchCoinsFilter } from '../lib/coinsFilter';
import { serverMsg } from '@/shared/i18n';

const { t } = useI18n();
const page = useEditPageContext();
const state = page.state;
const ms = page.symbolsTags;

/** f-apply-filters change (:3449-3480): project the filters onto the coin lists. */
async function onApplyFilters(): Promise<void> {
  if (!state.applyFilters) return;
  const exchange = page.selectedUserExchange();
  if (!exchange) {
    state.applyFilters = false;
    return;
  }
  try {
    const data = await fetchCoinsFilter(page.apiBaseOf(), state, exchange, state.tags);
    if (page.isV8 && Array.isArray(data.unresolved) && data.unresolved.length) {
      throw new Error(t('v7run.pb8CannotProjectCoins', { coins: data.unresolved.join(', ') }));
    }
    const approved = data.approved ?? [];
    const ignored = data.ignored ?? [];
    state.approvedLong = approved.slice();
    state.approvedShort = approved.slice();
    state.ignoredLong = ignored.slice();
    state.ignoredShort = ignored.slice();
    page.notify(t('v7run.filtersApplied'), 'info');
  } catch (e) {
    page.notify(t('v7run.filterError') + ': ' + (e instanceof Error ? e.message : String(e)), 'err');
  }
  state.applyFilters = false;
}
</script>

<template>
  <section class="edit-section-card overflow-hidden rounded-xl border border-border-default bg-panel">
    <header class="edit-section-card__header flex items-center gap-3 border-b border-border-default bg-elevated px-5 py-2.5 max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-2"><h3 class="text-md font-bold tracking-[0.01em] text-primary">{{ t('v7run.filters') }}</h3></header>
    <div class="edit-section-body p-5">
  <div class="form-row cols-8">
    <FieldNumber
      id="f-market-cap"
      v-model="state.marketCap"
      label="market_cap (min M$)"
      :tip="t('v7run.tip.marketCap')"
      min="0"
      step="50"
      class="col-span-2"
    />
    <FieldNumber
      id="f-vol-mcap"
      v-model="state.volMcap"
      label="vol/mcap"
      :tip="t('v7run.tip.volumeToMarketCap')"
      min="0"
      step="0.05"
      class="col-span-2"
    />
    <div class="form-group col-span-2" id="tags-container">
      <label><span :data-tip="t('v7run.tip.tags')">{{ t('v7run.tags') }}</span></label>
      <MultiSelectField id="ms-tags" v-model="state.tags" :options="ms.options.tags.value" :label="t('v7run.tags')" placeholder="Select tags..." />
    </div>
    <div class="form-group justify-end">
      <FieldCheck id="f-only-cpt" v-model="state.onlyCpt" label="only_cpt" :tip="t('v7run.tip.onlyCpt')" />
      <FieldCheck id="f-notices-ignore" v-model="state.noticesIgnore" label="notices_ignore" :tip="t('v7run.tip.noticesIgnore')" />
    </div>
    <div class="form-group justify-end">
    <FieldCheck id="f-apply-filters" v-model="state.applyFilters" label="apply_filters" :tip="t('v7run.tip.applyFilters')" @change="onApplyFilters" />
    </div>
  </div>

  <div class="form-row cols-2">
    <MultiSelectField
      id="ms-approved-long"
      v-model="state.approvedLong"
      :options="ms.options.approvedLong.value"
      label="approved_coins_long"
      allow-all-button
    />
    <MultiSelectField
      id="ms-approved-short"
      v-model="state.approvedShort"
      :options="ms.options.approvedShort.value"
      label="approved_coins_short"
      allow-all-button
    />
  </div>
  <div class="form-row cols-2">
    <MultiSelectField
      id="ms-ignored-long"
      v-model="state.ignoredLong"
      :options="ms.options.ignoredLong.value"
      label="ignored_coins_long"
      select-all-button
    />
    <MultiSelectField
      id="ms-ignored-short"
      v-model="state.ignoredShort"
      :options="ms.options.ignoredShort.value"
      label="ignored_coins_short"
      select-all-button
    />
  </div>

  <!-- Dynamic Ignore (v7-only; preview renders in App) -->
  <div class="form-row cols-4" v-show="page.fieldVisible('dynamicIgnore')">
    <div class="form-group">
      <FieldCheck
        id="f-dynamic-ignore"
        v-model="state.dynamicIgnore"
        label="dynamic_ignore"
        :tip="t('v7run.tip.dynamicIgnore')"
      />
    </div>
    <div class="form-group"></div>
    <div class="form-group"></div>
    <div class="form-group"></div>
  </div>
    </div>
  </section>
</template>
