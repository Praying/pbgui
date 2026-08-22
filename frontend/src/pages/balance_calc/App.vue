<script setup lang="ts">
/*
 * Balance Calculator page — the Vue port of frontend/balance_calc.html
 * (532 lines; legacy line refs below are provenance):
 *
 * ┌────────────────────────┬─ Legacy regions ─────────────────────────────┐
 * │ App (this shell)       │ markup :214-246, globals :249-265, init      │
 * │                        │ :505-527, title :250                          │
 * │ ResultsPanel           │ renderResults :406-483, paramRow :485-487,   │
 * │                        │ showError :489-491                            │
 * │ useBalanceCalc         │ loadInstances :296-321, loadInstanceConfig   │
 * │                        │ :324-347, calculate :360-403, draft :514-527 │
 * │ config/lib             │ %% injections :251-258, fmtPrice :499-503     │
 * └────────────────────────┴──────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 *  - fetches carry the boot Bearer token in addition to the cookie
 *    (legacy was cookie-only :291-293; apiFetch adds the header the same
 *    session accepts).
 */
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import ResultsPanel from './components/ResultsPanel.vue';
import { useBalanceCalc } from './composables/useBalanceCalc';
import { EXCHANGES, readInitParams } from './config';
import { instanceLabel } from './lib/format';

const { t } = useI18n();

const init = readInitParams();

const store = useBalanceCalc({
  t: (key, params) => t(key, params ?? {}),
  exchanges: EXCHANGES,
  initExchange: init.exchange,
});

const instanceOptions = computed(() =>
  store.instances.value.map((inst) => ({ inst, label: instanceLabel(inst), value: JSON.stringify(inst) }))
);

function onInstanceChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (!value) {
    void store.selectInstance(null);
    return;
  }
  try {
    void store.selectInstance(JSON.parse(value) as { name: string; version: string }); // :353-356
  } catch {
    /* ignore malformed option values like legacy */
  }
}

onMounted(() => {
  document.title = t('misc.balance.title'); // :250
  void store.loadInstances(init.instance, init.instanceVersion); // :506
  void store.loadDraft(init.draftId); // :514
});
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--balance-calc"
    page-key="info_balance_calc"
    :page-title="t('misc.balance.title')"
  >
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="store.calculating.value ? t('misc.balance.calculating') : t('common.ok')"
        :tone="store.calculating.value ? 'warning' : 'success'"
      />
    </template>

  <div id="page-content">
    <div class="toolbar">
      <label for="sel-instance">{{ t('misc.balance.instanceLabel') }}</label>
      <select id="sel-instance" :value="store.selectedInstance.value ? JSON.stringify(store.selectedInstance.value) : ''" @change="onInstanceChange">
        <option value="">{{ t('misc.balance.loadFromInstance') }}</option>
        <option v-for="option in instanceOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
      </select>

      <label for="sel-exchange">{{ t('misc.balance.exchange') }}</label>
      <select id="sel-exchange" v-model="store.exchange.value">
        <option v-for="exchange in EXCHANGES" :key="exchange" :value="exchange">{{ exchange }}</option>
      </select>

      <button id="btn-calc" :disabled="store.calculating.value" @click="store.calculate()">{{ t('misc.balance.calculate') }}</button>
      <span id="calc-status">
        <template v-if="store.calculating.value"><span class="spinner"></span> {{ t('misc.balance.calculating') }}</template>
      </span>
    </div>

    <div class="main-grid">
      <div>
        <textarea id="config-editor" spellcheck="false" v-model="store.configText.value"></textarea>
      </div>

      <div class="results-panel" id="results-panel">
        <ResultsPanel :results="store.results.value" :feedback="store.feedback.value" />
      </div>
    </div>
  </div>
  </AppShell>
</template>
