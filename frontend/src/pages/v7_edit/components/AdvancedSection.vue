<script setup lang="ts">
/**
 * The Advanced Settings expander — v7_edit.html:672-990. Subsection and
 * field visibility derive from the same metadata the legacy
 * configureFields() used (page.fieldVisible).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Textarea } from '@/shared/components/ui/textarea';
import ExpanderGroup from './ExpanderGroup.vue';
import FieldCheck from './FieldCheck.vue';
import FieldNumber from './FieldNumber.vue';
import FieldSelect from './FieldSelect.vue';
import FieldText from './FieldText.vue';
import { useEditPageContext } from '../composables/useEditPage';
import { executionSyncBounds } from '../lib/formModel';

const { t } = useI18n();
const page = useEditPageContext();
const state = page.state;

const forcedModeOptionsV7 = [
  { value: '' }, { value: 'n', label: 'normal' }, { value: 'm', label: 'manual' },
  { value: 'gs', label: 'graceful_stop' }, { value: 'p', label: 'panic' }, { value: 't', label: 'take_profit_only' },
];
const forcedModeOptionsV8 = [
  { value: '' }, { value: 'normal' }, { value: 'manual' }, { value: 'graceful_stop' },
  { value: 'panic' }, { value: 'take_profit_only' },
];
const forcedOptions = computed(() => (page.isV8 ? forcedModeOptionsV8 : forcedModeOptionsV7));
const hslSignalModeOptions = computed(() => {
  const base = [{ value: 'unified' }, { value: 'pside' }];
  return page.isV8 ? [{ value: 'coin' }, ...base] : base;
});
const hslCooldownOptions = [
  { value: 'panic' }, { value: 'normal' }, { value: 'manual' }, { value: 'tp_only' }, { value: 'graceful_stop' },
];
const timeInForceOptions = [{ value: 'good_till_cancelled' }, { value: 'post_only' }];
const marketSnapshotOptions = [{ value: 'auto' }, { value: 'bulk' }, { value: 'symbols' }];

const syncBounds = computed(() => executionSyncBounds(state));
</script>

<template>
  <ExpanderGroup
    id="exp-advanced"
    v-show="page.fieldVisible('advanced')"
    :title="t('v7run.advancedSettings')"
  >
    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.modesPolicies') }}</div>
    <div class="form-row cols-8">
      <FieldSelect
        id="f-forced-long"
        v-show="page.fieldVisible('forced_mode_long')"
        v-model="state.forcedLong"
        label="forced_mode_long"
        :options="forcedOptions"
        :tip="t('v7run.tip.forcedModeLong')"
        class="col-span-2"
      />
      <FieldSelect
        id="f-forced-short"
        v-show="page.fieldVisible('forced_mode_short')"
        v-model="state.forcedShort"
        label="forced_mode_short"
        :options="forcedOptions"
        :tip="t('v7run.tip.forcedModeShort')"
        class="col-span-2"
      />
      <FieldSelect
        id="f-hsl-signal-mode"
        v-show="page.fieldVisible('hsl_signal_mode')"
        v-model="state.hslSignalMode"
        @change="page.onHslSignalModeChange()"
        label="hsl_signal_mode"
        :options="hslSignalModeOptions"
        :tip="t('v7run.tip.hslSignalMode')"
      />
      <FieldSelect
        id="f-hsl-cooldown-policy"
        v-show="page.fieldVisible('hsl_position_during_cooldown_policy')"
        v-model="state.hslCooldownPolicy"
        label="hsl_position_during_cooldown_policy"
        :options="hslCooldownOptions"
        :tip="t('v7run.tip.hslCooldownPolicy')"
        class="col-span-2"
      />
      <FieldSelect
        id="f-time-in-force"
        v-show="page.fieldVisible('time_in_force')"
        v-model="state.timeInForce"
        label="time_in_force"
        :options="timeInForceOptions"
        :tip="t('v7run.tip.timeInForce')"
      />
    </div>
    <!-- v8-only checkbox row (legacy data-v8-only block :738-751) -->
    <div v-if="page.isV8" class="form-row cols-8">
      <div class="form-group col-span-2 justify-end" v-show="page.fieldVisible('hsl_accept_incomplete_history')">
        <FieldCheck
          id="f-hsl-accept-incomplete"
          v-model="state.hslAcceptIncomplete"
          label="hsl_accept_incomplete_history"
          :tip="t('v7run.tip.hslAcceptIncomplete')"
        />
      </div>
      <div class="form-group col-span-2 justify-end" v-show="page.fieldVisible('force_cold_startup')">
        <FieldCheck
          id="f-force-cold-startup"
          v-model="state.forceColdStartup"
          label="force_cold_startup"
          :tip="t('v7run.tip.forceColdStartup')"
        />
      </div>
    </div>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.executionExchangeSync') }}</div>
    <div class="form-row cols-8">
      <FieldNumber
        id="f-max-cancel"
        v-show="page.fieldVisible('max_n_cancellations_per_batch')"
        v-model="state.maxCancel"
        label="max_n_cancellations_per_batch"
        :tip="t('v7run.tip.maxCancellations')"
        :min="syncBounds.cancelMin"
        max="100"
        step="1"
        @change="page.onExecutionSyncChange('maxCancel')"
      />
      <FieldNumber
        id="f-max-create"
        v-show="page.fieldVisible('max_n_creations_per_batch')"
        v-model="state.maxCreate"
        label="max_n_creations_per_batch"
        :tip="t('v7run.tip.maxCreations')"
        min="0"
        :max="syncBounds.createMax"
        step="1"
        @change="page.onExecutionSyncChange('maxCreate')"
      />
      <FieldNumber
        id="f-max-restarts"
        v-show="page.fieldVisible('max_n_restarts_per_day')"
        v-model="state.maxRestarts"
        label="max_n_restarts_per_day"
        :tip="t('v7run.tip.maxRestarts')"
        min="0"
        max="100"
        step="1"
      />
      <FieldNumber
        id="f-recv-window"
        v-show="page.fieldVisible('recv_window_ms')"
        v-model="state.recvWindow"
        label="recv_window_ms"
        :tip="t('v7run.tip.recvWindow')"
        min="1000"
        max="60000"
        step="1000"
      />
      <FieldNumber
        id="f-order-match-tol"
        v-show="page.fieldVisible('order_match_tolerance_pct')"
        v-model="state.orderMatchTol"
        label="order_match_tolerance_pct"
        :tip="t('v7run.tip.orderMatchTolerance')"
        min="0"
        max="0.01"
        step="0.0001"
      />
      <FieldNumber
        id="f-fills-recent-overlap"
        v-show="page.fieldVisible('fills_recent_overlap_minutes')"
        v-model="state.fillsRecentOverlap"
        label="fills_recent_overlap_minutes"
        :tip="t('v7run.tip.fillsRecentOverlap')"
        min="0"
        step="1"
      />
      <FieldNumber
        id="f-fills-confirm-overlap"
        v-show="page.fieldVisible('fills_confirmation_overlap_minutes')"
        v-model="state.fillsConfirmOverlap"
        label="fills_confirmation_overlap_minutes"
        :tip="t('v7run.tip.fillsConfirmationOverlap')"
        min="0"
        step="1"
      />
      <FieldNumber
        id="f-max-api-req"
        v-show="page.fieldVisible('max_concurrent_api_requests')"
        v-model="state.maxApiReq"
        label="max_concurrent_api_requests"
        :tip="t('v7run.tip.maxConcurrentApiRequests')"
        min="1"
        step="1"
        placeholder="auto"
      />
    </div>

    <template v-if="page.isV8">
      <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.feesOrderChurn') }}</div>
      <div class="form-row cols-8">
        <FieldNumber id="f-fee-conversion-age" v-show="page.fieldVisible('fee_conversion_max_age_ms')" v-model="state.feeConversionAge" label="fee_conversion_max_age_ms" :tip="t('v7run.tip.feeConversionAge')" min="0" step="1000" />
        <FieldNumber id="f-fee-pct-fallback" v-show="page.fieldVisible('fee_pct_fallback')" v-model="state.feePctFallback" label="fee_pct_fallback" :tip="t('v7run.tip.feeFallback')" min="0" step="0.00001" />
        <FieldNumber id="f-fee-pct-sanity" v-show="page.fieldVisible('fee_pct_sanity_abs_max')" v-model="state.feePctSanity" label="fee_pct_sanity_abs_max" :tip="t('v7run.tip.feeSanityLimit')" min="0" step="0.0001" />
        <FieldNumber id="f-churn-activation-count" v-show="page.fieldVisible('order_replacement_churn_gate_activation_count')" v-model="state.churnActivationCount" label="order_replacement_churn_gate_activation_count" :tip="t('v7run.tip.churnActivationCount')" min="0" step="1" />
        <FieldNumber id="f-churn-market-dist" v-show="page.fieldVisible('order_replacement_churn_gate_market_dist_pct')" v-model="state.churnMarketDist" label="order_replacement_churn_gate_market_dist_pct" :tip="t('v7run.tip.churnMarketDistance')" min="0" max="0.999999" step="0.001" />
        <FieldNumber id="f-churn-stability-minutes" v-show="page.fieldVisible('order_replacement_churn_gate_stability_minutes')" v-model="state.churnStabilityMinutes" label="order_replacement_churn_gate_stability_minutes" :tip="t('v7run.tip.churnStability')" min="0" step="0.1" />
        <FieldNumber id="f-churn-window-minutes" v-show="page.fieldVisible('order_replacement_churn_gate_window_minutes')" v-model="state.churnWindowMinutes" label="order_replacement_churn_gate_window_minutes" :tip="t('v7run.tip.churnWindow')" min="0" step="0.1" />
      </div>
    </template>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.warmupCandleFetch') }}</div>
    <div class="form-row cols-8">
      <FieldNumber id="f-max-warmup-min" v-show="page.fieldVisible('max_warmup_minutes')" v-model="state.maxWarmupMin" label="max_warmup_minutes" :tip="t('v7run.tip.maxWarmup')" min="0" step="100" />
      <FieldNumber id="f-warmup-jitter" v-show="page.fieldVisible('warmup_jitter_seconds')" v-model="state.warmupJitter" label="warmup_jitter_seconds" :tip="t('v7run.tip.warmupJitter')" min="0" step="1" />
      <FieldNumber id="f-warmup-conc" v-show="page.fieldVisible('warmup_concurrency')" v-model="state.warmupConc" label="warmup_concurrency" :tip="t('v7run.tip.warmupConcurrency')" min="0" step="1" />
      <div class="form-group justify-end" v-show="page.fieldVisible('defer_broad_candle_warmup')">
        <FieldCheck id="f-defer-broad-candle-warmup" v-model="state.deferBroadCandleWarmup" label="defer_broad_candle_warmup" :tip="t('v7run.tip.deferBroadWarmup')" />
      </div>
      <div class="form-group justify-end" v-show="page.fieldVisible('enable_archive_candle_fetch')">
        <FieldCheck id="f-archive-fetch" v-model="state.archiveFetch" label="enable_archive_candle_fetch" :tip="t('v7run.tip.archiveCandleFetch')" />
      </div>
      <FieldNumber id="f-max-ohlcv-fetches" v-show="page.fieldVisible('max_ohlcv_fetches_per_minute')" v-model="state.maxOhlcvFetches" label="max_ohlcv_fetches_per_minute" :tip="t('v7run.tip.maxOhlcvFetches')" min="0" step="1" />
      <FieldNumber id="f-candle-lock" v-show="page.fieldVisible('candle_lock_timeout_seconds')" v-model="state.candleLock" label="candle_lock_timeout_seconds" :tip="t('v7run.tip.candleLock')" min="1" max="300" step="1" />
      <FieldSelect id="f-market-snapshot-strategy" v-show="page.fieldVisible('market_snapshot_ticker_strategy')" v-model="state.marketSnapshotStrategy" label="market_snapshot_ticker_strategy" :options="marketSnapshotOptions" :tip="t('v7run.tip.marketSnapshotStrategy')" />
    </div>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.forager') }}</div>
    <div class="form-row cols-8">
      <FieldNumber id="f-forager-hysteresis" v-show="page.fieldVisible('forager_score_hysteresis_pct')" v-model="state.foragerHysteresis" label="forager_score_hysteresis_pct" :tip="t('v7run.tip.foragerHysteresis')" min="0" step="0.001" />
      <FieldNumber id="f-max-forager-stale" v-show="page.fieldVisible('max_forager_candle_staleness_minutes')" v-model="state.maxForagerStale" label="max_forager_candle_staleness_minutes" :tip="t('v7run.tip.foragerStaleness')" min="0" step="1" placeholder="auto" />
      <FieldNumber id="f-max-forager-refresh" v-show="page.fieldVisible('max_forager_candle_refresh_seconds')" v-model="state.maxForagerRefresh" label="max_forager_candle_refresh_seconds" :tip="t('v7run.tip.foragerRefresh')" min="1" step="1" />
      <div class="form-group justify-end" v-show="page.fieldVisible('enable_forager_ws_candles')">
        <FieldCheck id="f-enable-forager-ws" v-model="state.enableForagerWs" label="enable_forager_ws_candles" :tip="t('v7run.tip.foragerWebSocket')" />
      </div>
      <FieldNumber id="f-forager-ws-audit" v-show="page.fieldVisible('forager_ws_candle_rest_audit_minutes')" v-model="state.foragerWsAudit" label="forager_ws_candle_rest_audit_minutes" :tip="t('v7run.tip.foragerWebSocketAudit')" min="0.000001" max="60" step="1" />
    </div>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.storageFreshnessRuntime') }}</div>
    <div class="form-row cols-8 mb-0">
      <FieldNumber id="f-max-disk-candles" v-show="page.fieldVisible('max_disk_candles_per_symbol_per_tf')" v-model="state.maxDiskCandles" label="max_disk_candles_per_symbol_per_tf" :tip="t('v7run.tip.maxDiskCandles')" min="0" step="10000" />
      <FieldNumber id="f-max-mem-candles" v-show="page.fieldVisible('max_memory_candles_per_symbol')" v-model="state.maxMemCandles" label="max_memory_candles_per_symbol" :tip="t('v7run.tip.maxMemoryCandles')" min="0" step="10000" />
      <FieldNumber id="f-inactive-ttl" v-show="page.fieldVisible('inactive_coin_candle_ttl_minutes')" v-model="state.inactiveTtl" label="inactive_coin_candle_ttl_minutes" :tip="t('v7run.tip.inactiveCandleTtl')" min="0" step="1" />
      <FieldNumber id="f-max-active-tail-gap" v-show="page.fieldVisible('max_active_candle_tail_gap_minutes')" v-model="state.maxActiveTailGap" label="max_active_candle_tail_gap_minutes" :tip="t('v7run.tip.activeCandleTailGap')" min="1" step="1" />
      <FieldNumber id="f-bal-override" v-show="page.fieldVisible('balance_override')" v-model="state.balOverride" label="balance_override" :tip="t('v7run.tip.balanceOverride')" min="0" step="100" />
      <FieldNumber id="f-bal-hyst" v-show="page.fieldVisible('balance_hysteresis_snap_pct')" v-model="state.balHyst" label="balance_hysteresis_snap_pct" :tip="t('v7run.tip.balanceHysteresis')" min="0" max="0.5" step="0.01" />
      <FieldNumber id="f-mem-snapshot" v-show="page.fieldVisible('memory_snapshot_interval_minutes')" v-model="state.memSnapshot" label="logging.memory_snapshot_interval_minutes" :tip="t('v7run.tip.memorySnapshot')" min="1" step="5" />
      <FieldNumber id="f-vol-refresh" v-show="page.fieldVisible('volume_refresh_info_threshold_seconds')" v-model="state.volRefresh" label="logging.volume_refresh_info_threshold_seconds" :tip="t('v7run.tip.volumeRefresh')" min="0" step="5" />
    </div>

    <template v-if="page.isV8">
      <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.pb8Runtime') }}</div>
      <div class="form-row cols-8">
        <FieldNumber id="f-exchange-symbol-cooldown" v-show="page.fieldVisible('exchange_symbol_unavailable_cooldown_hours')" v-model="state.exchangeSymbolCooldown" label="exchange_symbol_unavailable_cooldown_hours" :tip="t('v7run.tip.exchangeSymbolCooldown')" min="0" max="876600" step="0.1" class="col-span-2" />
        <FieldText id="f-custom-endpoints-path" v-show="page.fieldVisible('custom_endpoints_path')" v-model="state.customEndpointsPath" label="custom_endpoints_path" :tip="t('v7run.tip.customEndpointsPath')" placeholder="default" class="col-span-2" />
        <div class="form-group col-span-4" v-show="page.fieldVisible('startup_phase_budgets')">
          <label><span :data-tip="t('v7run.tip.startupPhaseBudgets')">startup_phase_budgets (Expert/Diagnostic)</span></label>
          <!-- ui-migration: Textarea + the legacy json-editor class — the
               un-layered page rules still own the geometry (shared with
               CoinOverridesPanel's .json-editor textareas). -->
          <Textarea id="f-startup-phase-budgets" v-model="state.startupPhaseBudgets" class="json-editor" rows="4" />
          <div id="f-startup-phase-budgets-status" class="hidden text-sm leading-[1.35]" aria-live="polite"></div>
        </div>
      </div>

      <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.logging') }}</div>
      <div class="form-row cols-8">
        <FieldText id="f-log-dir" v-show="page.fieldVisible('dir')" v-model="state.logDir" label="logging.dir" :tip="t('v7run.tip.logDirectory')" />
        <FieldNumber id="f-log-max-bytes" v-show="page.fieldVisible('max_bytes_mb')" v-model="state.logMaxBytes" label="logging.max_bytes_mb" :tip="t('v7run.tip.logMaxBytes')" min="0" step="1" />
        <FieldNumber id="f-log-backup-count" v-show="page.fieldVisible('backup_count')" v-model="state.logBackupCount" label="logging.backup_count" :tip="t('v7run.tip.logBackupCount')" min="0" step="1" />
        <div class="form-group justify-end">
          <FieldCheck id="f-log-persist" v-show="page.fieldVisible('persist_to_file')" v-model="state.logPersist" label="logging.persist_to_file" />
        </div>
        <div class="form-group justify-end">
          <FieldCheck id="f-log-rotation" v-show="page.fieldVisible('rotation')" v-model="state.logRotation" label="logging.rotation" />
        </div>
        <div class="form-group col-span-3" v-show="page.fieldVisible('live_event_debug_profiles')">
          <label><span :data-tip="t('v7run.tip.liveEventDebugProfiles')">logging.live_event_debug_profiles</span></label>
          <Textarea id="f-log-debug-profiles" v-model="state.logDebugProfiles" class="json-editor" rows="4" />
          <div id="f-log-debug-profiles-status" class="hidden text-sm leading-[1.35]" aria-live="polite"></div>
        </div>
      </div>

      <div class="mb-2 mt-3 text-sm font-semibold text-accent" v-show="page.fieldVisible('monitorEnabled')">{{ t('v7run.monitoring') }}</div>
      <div class="form-row cols-8" v-show="page.fieldVisible('monitorEnabled')">
        <div class="form-group justify-end"><FieldCheck id="f-monitor-enabled" v-show="page.fieldVisible('monitorEnabled')" v-model="state.monitorEnabled" label="monitor.enabled" /></div>
        <FieldText id="f-monitor-root-dir" v-show="page.fieldVisible('root_dir')" v-model="state.monitorRootDir" label="monitor.root_dir" />
        <FieldNumber id="f-monitor-snapshot-interval" v-show="page.fieldVisible('snapshot_interval_seconds')" v-model="state.monitorSnapshotInterval" label="monitor.snapshot_interval_seconds" min="0" step="0.1" />
        <FieldNumber id="f-monitor-checkpoint" v-show="page.fieldVisible('checkpoint_interval_minutes')" v-model="state.monitorCheckpoint" label="monitor.checkpoint_interval_minutes" min="0" step="0.1" />
        <FieldNumber id="f-monitor-rotation-mb" v-show="page.fieldVisible('event_rotation_mb')" v-model="state.monitorRotationMb" label="monitor.event_rotation_mb" min="0" step="1" />
        <FieldNumber id="f-monitor-rotation-minutes" v-show="page.fieldVisible('event_rotation_minutes')" v-model="state.monitorRotationMinutes" label="monitor.event_rotation_minutes" min="0" step="1" />
        <FieldNumber id="f-monitor-max-bytes" v-show="page.fieldVisible('max_total_bytes')" v-model="state.monitorMaxBytes" label="monitor.max_total_bytes" min="0" step="1" />
        <FieldNumber id="f-monitor-price-interval" v-show="page.fieldVisible('price_tick_min_interval_ms')" v-model="state.monitorPriceInterval" label="monitor.price_tick_min_interval_ms" min="0" step="1" />
        <FieldNumber id="f-monitor-retain-days" v-show="page.fieldVisible('retain_days')" v-model="state.monitorRetainDays" label="monitor.retain_days" min="0" step="0.1" />
        <div class="form-group justify-end"><FieldCheck id="f-monitor-compress" v-show="page.fieldVisible('compress_rotated_segments')" v-model="state.monitorCompress" label="monitor.compress_rotated_segments" /></div>
        <div class="form-group justify-end"><FieldCheck id="f-monitor-emit-candles" v-show="page.fieldVisible('emit_completed_candles')" v-model="state.monitorEmitCandles" label="monitor.emit_completed_candles" /></div>
        <div class="form-group justify-end"><FieldCheck id="f-monitor-raw-fills" v-show="page.fieldVisible('include_raw_fill_payloads')" v-model="state.monitorRawFills" label="monitor.include_raw_fill_payloads" /></div>
        <div class="form-group justify-end"><FieldCheck id="f-monitor-retain-candles" v-show="page.fieldVisible('retain_candles')" v-model="state.monitorRetainCandles" label="monitor.retain_candles" /></div>
        <div class="form-group justify-end"><FieldCheck id="f-monitor-retain-fills" v-show="page.fieldVisible('retain_fills')" v-model="state.monitorRetainFills" label="monitor.retain_fills" /></div>
        <div class="form-group justify-end"><FieldCheck id="f-monitor-retain-ticks" v-show="page.fieldVisible('retain_price_ticks')" v-model="state.monitorRetainTicks" label="monitor.retain_price_ticks" /></div>
      </div>
    </template>
  </ExpanderGroup>
</template>
