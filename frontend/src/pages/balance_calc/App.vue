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
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import ResultsPanel from './components/ResultsPanel.vue';
import { useBalanceCalc } from './composables/useBalanceCalc';
import { EXCHANGES, readInitParams } from './config';
import { instanceLabel } from './lib/format';

const { t } = useI18n();

const init = readInitParams();

/* AI drawer page context — Vue port of the legacy balance-calculator
   registration (selected instance + exchange as entities). */
useAiPageContext({
  id: 'balance-calculator',
  getContext: () => ({
    section: 'Calculator',
    entities: [
      ...(store.selectedInstance.value ? [{ kind: 'run_config', version: store.selectedInstance.value.version || 'v7', name: store.selectedInstance.value.name }] : []),
      ...(store.exchange.value ? [{ kind: 'exchange', name: store.exchange.value }] : []),
    ],
  }),
});

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

  <div id="page-content" class="h-[calc(100dvh-112px)] overflow-y-auto p-5">
    <div class="toolbar flex flex-wrap items-center gap-3 border-b border-border-default pb-3 mb-5">
      <label class="text-sm font-semibold text-secondary" for="sel-instance">{{ t('misc.balance.instanceLabel') }}</label>
      <select id="sel-instance" class="h-8 cursor-pointer rounded-md border border-border-default bg-panel px-2 text-base text-primary min-w-[140px]" :value="store.selectedInstance.value ? JSON.stringify(store.selectedInstance.value) : ''" @change="onInstanceChange">
        <option value="">{{ t('misc.balance.loadFromInstance') }}</option>
        <option v-for="option in instanceOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
      </select>

      <label class="text-sm font-semibold text-secondary" for="sel-exchange">{{ t('misc.balance.exchange') }}</label>
      <select id="sel-exchange" class="h-8 cursor-pointer rounded-md border border-border-default bg-panel px-2 text-base text-primary min-w-[140px]" v-model="store.exchange.value">
        <option v-for="exchange in EXCHANGES" :key="exchange" :value="exchange">{{ exchange }}</option>
      </select>

      <button id="btn-calc" class="h-8 cursor-pointer rounded-md border-none bg-accent px-5 text-base font-bold text-[#0b1526] transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50" :disabled="store.calculating.value" @click="store.calculate()">{{ t('misc.balance.calculate') }}</button>
      <span id="calc-status">
        <template v-if="store.calculating.value"><span class="mr-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-accent align-middle"></span> {{ t('misc.balance.calculating') }}</template>
      </span>
    </div>

    <div class="grid grid-cols-[1fr_1fr] gap-5 max-[900px]:grid-cols-1">
      <div>
        <textarea id="config-editor" class="w-full min-h-[420px] resize-y rounded-md border border-border-default bg-panel p-2 text-sm leading-normal text-primary focus:border-accent focus:outline-none font-[Fira_Code,Consolas,monospace] tab-4" spellcheck="false" v-model="store.configText.value"></textarea>
      </div>

      <div class="flex flex-col gap-3" id="results-panel">
        <ResultsPanel :results="store.results.value" :feedback="store.feedback.value" />
      </div>
    </div>
  </div>
  </AppShell>
</template>

<style scoped>
/* Page-level AppShell overrides — ported from styles/balance-calc.css. */
.data-page-shell :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.data-page-shell :deep(.app-shell__primary) {
  min-height: 0;
}
</style>
