<script setup lang="ts">
/**
 * Rows 1-3 of the shared 8-column grid — v7_edit.html:571-669. Field
 * visibility via the page store (data-v7-only/data-v8-only parity).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/shared/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import FieldCheck from './FieldCheck.vue';
import FieldNumber from './FieldNumber.vue';
import FieldSelect from './FieldSelect.vue';
import { useEditPageContext } from '../composables/useEditPage';

const { t } = useI18n();
const page = useEditPageContext();
const state = page.state;

const marginModeOptions = [
  { value: 'auto' }, { value: 'cross' }, { value: 'isolated' }, { value: 'auto_cross' }, { value: 'auto_isolated' },
];
const loggingLevelOptions = [
  { value: '0', label: 'warning' }, { value: '1', label: 'info' }, { value: '2', label: 'debug' }, { value: '3', label: 'trace' },
];

/** Trigger label for the enabled_on listbox — the gate's decorated label. */
const enabledOnLabel = computed(() => page.hosts.gate.label(state.enabledOn, page.hosts.capabilities.value));
</script>

<template>
  <section class="edit-section-card overflow-hidden rounded-xl border border-border-default bg-panel">
    <header class="edit-section-card__header flex items-center gap-3 border-b border-border-default bg-elevated px-5 py-2.5 max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-2"><h3 class="text-md font-bold tracking-[0.01em] text-primary">{{ t('v7run.basicSettings') }}</h3></header>
    <div class="edit-section-body p-5">
      <div class="form-row cols-8">
    <!-- Row 1: Configuration & Identity -->
    <div class="form-group col-span-2">
      <label id="f-user-label"><span :data-tip="t('v7run.tip.userApiCredentials')">{{ t('v7run.user') }}</span></label>
      <SelectRoot v-model="state.user" @update:model-value="page.onUserChange()">
        <SelectTrigger id="f-user" aria-labelledby="f-user-label">
          <span>{{ state.user }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="user in page.users.value" :key="user.name" :value="user.name">{{ user.name }}</SelectItem>
        </SelectContent>
      </SelectRoot>
    </div>
    <div class="form-group col-span-2">
      <label id="f-enabled-on-label">{{ t('v7run.enabledOn') }}</label>
      <SelectRoot v-model="state.enabledOn" @update:model-value="page.onEnabledOnChange()">
        <SelectTrigger
          id="f-enabled-on"
          aria-labelledby="f-enabled-on-label"
          @focus="page.hosts.refresh()"
        >
          <span>{{ enabledOnLabel }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="host in page.renderedHostOptions.value"
            :key="host"
            :value="host"
            :disabled="page.hosts.gate.isDisabled(host, page.hosts.capabilities.value)"
          >{{ page.hosts.gate.label(host, page.hosts.capabilities.value) }}</SelectItem>
        </SelectContent>
      </SelectRoot>
    </div>
    <FieldNumber
      id="f-version"
      v-show="page.fieldVisible('version')"
      v-model="state.version"
      :label="t('v7run.configVersion')"
      :tip="t('v7run.tip.configVersion')"
      min="0"
      step="1"
      :readonly="page.isV8"
    />
    <FieldNumber
      id="f-leverage"
      v-show="page.fieldVisible('leverage')"
      v-model="state.leverage"
      label="Leverage"
      :tip="t('v7run.tip.leverage')"
      min="0"
      max="100"
      step="1"
    />
    <FieldSelect
      id="f-margin-mode"
      v-show="page.fieldVisible('margin_mode_preference')"
      v-model="state.marginMode"
      label="margin_mode_preference"
      :options="marginModeOptions"
      :tip="t('v7run.tip.marginModePreference')"
    />
    <FieldSelect
      id="f-logging-level"
      v-show="page.fieldVisible('level')"
      v-model="state.loggingLevel"
      :label="t('v7run.loggingLevel')"
      :options="loggingLevelOptions"
      :tip="t('v7run.tip.loggingLevel')"
    />

    <!-- Row 2: Timing & Risk -->
    <FieldNumber
      id="f-min-coin-age"
      v-show="page.fieldVisible('minimum_coin_age_days')"
      v-model="state.minCoinAge"
      label="minimum_coin_age_days"
      :tip="t('v7run.tip.minimumCoinAge')"
      min="0"
      step="1"
    />
    <FieldNumber
      id="f-pnls-lookback"
      v-show="page.fieldVisible('pnls_max_lookback_days')"
      v-model="state.pnlsLookback"
      label="pnls_max_lookback_days"
      :tip="t('v7run.tip.pnlLookback')"
      min="0"
      max="365"
      step="1"
    />
    <FieldNumber
      id="f-warmup-ratio"
      v-show="page.fieldVisible('warmup_ratio')"
      v-model="state.warmupRatio"
      label="warmup_ratio"
      :tip="t('v7run.tip.warmupRatio')"
      min="0"
      max="1"
      step="0.1"
    />
    <FieldNumber
      id="f-max-loss-pct"
      v-show="page.fieldVisible('max_realized_loss_pct')"
      v-model="state.maxLossPct"
      label="max_realized_loss_pct"
      :tip="t('v7run.tip.maxRealizedLoss')"
      min="0"
      max="2"
      step="0.01"
    />
    <div class="form-group span-4">
      <label for="f-note"><span :data-tip="t('v7run.tip.note')">{{ t('v7run.note') }}</span></label>
      <Input id="f-note" v-model="state.note" type="text" placeholder="" />
    </div>

    <!-- Row 3: Execution & Flags -->
    <FieldNumber
      id="f-price-dist"
      v-show="page.fieldVisible('initial_entry_exec_max_market_dist_pct')"
      v-model="state.priceDist"
      :label="page.priceDistLabel.value"
      :tip="t('v7run.tip.initialEntryDistance')"
      min="0"
      max="1"
      step="0.001"
    />
    <FieldNumber
      id="f-exec-delay"
      v-show="page.fieldVisible('execution_delay_seconds')"
      v-model="state.execDelay"
      label="execution_delay_seconds"
      :tip="t('v7run.tip.executionDelay')"
      min="1"
      max="60"
      step="1"
    />
    <FieldNumber
      id="f-market-order-threshold"
      v-show="page.fieldVisible('market_order_near_touch_threshold')"
      v-model="state.marketOrderThreshold"
      label="market_order_near_touch_threshold"
      :tip="t('v7run.tip.marketOrderThreshold')"
      min="0"
      max="0.1"
      step="0.0001"
    />
    <div class="form-group"></div>
    <div class="form-group col-span-2 justify-end" v-show="page.fieldVisible('filter_by_min_effective_cost')">
      <FieldCheck
        id="f-filter-min-cost"
        v-model="state.filterMinCost"
        label="filter_by_min_effective_cost"
        :tip="t('v7run.tip.filterMinEffectiveCost')"
      />
      <FieldCheck
        id="f-market-orders"
        v-model="state.marketOrders"
        label="market_orders_allowed"
        :tip="t('v7run.tip.marketOrdersAllowed')"
      />
    </div>
    <div class="form-group col-span-2 justify-end" v-show="page.fieldVisible('hedge_mode')">
      <FieldCheck
        id="f-hedge-mode"
        v-model="state.hedgeMode"
        label="hedge_mode"
        :tip="t('v7run.tip.hedgeMode')"
      />
      <FieldCheck
        id="f-auto-gs"
        v-model="state.autoGs"
        label="auto_gs"
        :tip="t('v7run.tip.autoGracefulStop')"
      />
    </div>
      </div>
    </div>
  </section>
</template>
