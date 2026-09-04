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
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
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
  store.instances.value.map((inst) => ({ label: instanceLabel(inst), value: JSON.stringify(inst) }))
);

/* The instance Select carries the JSON-encoded {name, version} as the item
   value (legacy parsed the same payload out of the native option, :353-356).
   The legacy empty option ("load from instance…") is the listbox placeholder
   now — reka reserves "" for the cleared state, so there is no selectable
   reset row; once picked, switching instances stays possible. */
const selectedInstanceValue = computed(() =>
  store.selectedInstance.value ? JSON.stringify(store.selectedInstance.value) : '',
);

const instanceTriggerLabel = computed(() => {
  if (!selectedInstanceValue.value) return '';
  return instanceOptions.value.find((option) => option.value === selectedInstanceValue.value)?.label ?? '';
});

function onInstanceSelect(value: unknown): void {
  if (typeof value !== 'string' || !value) return;
  try {
    void store.selectInstance(JSON.parse(value) as { name: string; version: string });
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
    <template v-if="store.calculating.value" #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="t('misc.balance.calculating')"
        tone="warning"
      />
    </template>

  <div id="page-content" class="h-[calc(100dvh-var(--header-height))] overflow-y-auto p-[var(--page-padding)]">
    <div class="toolbar flex flex-wrap items-center gap-3 border-b border-border-default pb-3 mb-5">
      <span id="sel-instance-label" class="text-sm font-semibold text-secondary">{{ t('misc.balance.instanceLabel') }}</span>
      <SelectRoot :model-value="selectedInstanceValue" @update:model-value="onInstanceSelect">
        <SelectTrigger id="sel-instance" class="w-auto min-w-[140px]" aria-labelledby="sel-instance-label">
          <span :class="instanceTriggerLabel ? undefined : 'text-placeholder'">{{ instanceTriggerLabel || t('misc.balance.loadFromInstance') }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="option in instanceOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem>
        </SelectContent>
      </SelectRoot>

      <span id="sel-exchange-label" class="text-sm font-semibold text-secondary">{{ t('misc.balance.exchange') }}</span>
      <SelectRoot v-model="store.exchange.value">
        <SelectTrigger id="sel-exchange" class="w-auto min-w-[140px]" aria-labelledby="sel-exchange-label">
          <span>{{ store.exchange.value }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="exchange in EXCHANGES" :key="exchange" :value="exchange">{{ exchange }}</SelectItem>
        </SelectContent>
      </SelectRoot>

      <Button id="btn-calc" variant="primary" :loading="store.calculating.value" @click="store.calculate()">{{ t('misc.balance.calculate') }}</Button>
    </div>

    <div class="grid grid-cols-[1fr_1fr] gap-5 max-[900px]:grid-cols-1">
      <div>
        <Textarea id="config-editor" class="min-h-[420px] tab-4" spellcheck="false" v-model="store.configText.value" />
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
