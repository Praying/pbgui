<script setup lang="ts">
/**
 * The Advanced Settings expander — v7_edit.html:672-990. Subsection and
 * field visibility derive from the same metadata the legacy
 * configureFields() used (page.fieldVisible).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
        tip="Force all long positions to same mode.
n=normal  m=manual  gs=graceful_stop
p=panic  t=take_profit_only"
        style="grid-column: span 2"
      />
      <FieldSelect
        id="f-forced-short"
        v-show="page.fieldVisible('forced_mode_short')"
        v-model="state.forcedShort"
        label="forced_mode_short"
        :options="forcedOptions"
        tip="Force all short positions to the same mode.
n=normal  m=manual  gs=graceful_stop
p=panic  t=take_profit_only"
        style="grid-column: span 2"
      />
      <FieldSelect
        id="f-hsl-signal-mode"
        v-show="page.fieldVisible('hsl_signal_mode')"
        v-model="state.hslSignalMode"
        @change="page.onHslSignalModeChange()"
        label="hsl_signal_mode"
        :options="hslSignalModeOptions"
        tip="coin: each coin tracks its own HSL drawdown independently (PB8).
pside: each side tracks its own HSL drawdown independently.
unified: both sides share one account-level combined signal."
      />
      <FieldSelect
        id="f-hsl-cooldown-policy"
        v-show="page.fieldVisible('hsl_position_during_cooldown_policy')"
        v-model="state.hslCooldownPolicy"
        label="hsl_position_during_cooldown_policy"
        :options="hslCooldownOptions"
        tip="Policy for a position appearing on a halted pside during HSL RED cooldown.
panic: close again and restart cooldown
normal: treat as operator override once position appears
manual: leave in manual mode while cooldown runs
tp_only: allow only close management during cooldown
graceful_stop: manage with graceful_stop semantics during cooldown"
        style="grid-column: span 2"
      />
      <FieldSelect
        id="f-time-in-force"
        v-show="page.fieldVisible('time_in_force')"
        v-model="state.timeInForce"
        label="time_in_force"
        :options="timeInForceOptions"
        tip="Default order time-in-force. good_till_cancelled keeps orders until filled or cancelled. post_only ensures orders are maker-only."
      />
    </div>
    <!-- v8-only checkbox row (legacy data-v8-only block :738-751) -->
    <div v-if="page.isV8" class="form-row cols-8">
      <div class="form-group" v-show="page.fieldVisible('hsl_accept_incomplete_history')" style="grid-column: span 2; justify-content: flex-end">
        <FieldCheck
          id="f-hsl-accept-incomplete"
          v-model="state.hslAcceptIncomplete"
          label="hsl_accept_incomplete_history"
          tip="Allow HSL to operate when the available history is incomplete. Keep disabled unless accepting reduced HSL history confidence is intentional."
        />
      </div>
      <div class="form-group" v-show="page.fieldVisible('force_cold_startup')" style="grid-column: span 2; justify-content: flex-end">
        <FieldCheck
          id="f-force-cold-startup"
          v-model="state.forceColdStartup"
          label="force_cold_startup"
          tip="Force PB8 to ignore reusable warm runtime state and perform a cold startup."
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
        tip="Cancels up to n open orders per execution cycle. Must always be greater than max_n_creations_per_batch, and the editor keeps the two fields within a valid range automatically."
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
        tip="Creates up to n new orders per execution cycle. Must always stay below max_n_cancellations_per_batch, and the editor limits the value automatically to prevent invalid combinations."
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
        tip="If the bot crashes, restart up to n times per day before stopping completely."
        min="0"
        max="100"
        step="1"
      />
      <FieldNumber
        id="f-recv-window"
        v-show="page.fieldVisible('recv_window_ms')"
        v-model="state.recvWindow"
        label="recv_window_ms"
        tip="Millisecond tolerance for authenticated REST calls (default 10000). Increase if the exchange rejects requests with recv_window errors due to clock drift."
        min="1000"
        max="60000"
        step="1000"
      />
      <FieldNumber
        id="f-order-match-tol"
        v-show="page.fieldVisible('order_match_tolerance_pct')"
        v-model="state.orderMatchTol"
        label="order_match_tolerance_pct"
        tip="Tolerance used to match near-identical cancel/create pairs to avoid order churn. When a new order is within this % of an existing open order, the existing order may be kept."
        min="0"
        max="0.01"
        step="0.0001"
      />
      <FieldNumber
        id="f-fills-recent-overlap"
        v-show="page.fieldVisible('fills_recent_overlap_minutes')"
        v-model="state.fillsRecentOverlap"
        label="fills_recent_overlap_minutes"
        tip="How many minutes of recent fill history to overlap when fetching incremental fills. Increase if the exchange returns fills late or out of order."
        min="0"
        step="1"
      />
      <FieldNumber
        id="f-fills-confirm-overlap"
        v-show="page.fieldVisible('fills_confirmation_overlap_minutes')"
        v-model="state.fillsConfirmOverlap"
        label="fills_confirmation_overlap_minutes"
        tip="How many minutes of fill history to re-check when confirming that recent fills were fully observed. Higher values trade more API work for safer reconciliation."
        min="0"
        step="1"
      />
      <FieldNumber
        id="f-max-api-req"
        v-show="page.fieldVisible('max_concurrent_api_requests')"
        v-model="state.maxApiReq"
        label="max_concurrent_api_requests"
        tip="Optional global live REST concurrency cap. Leave 0 to use exchange/default behaviour; set a positive integer to throttle authenticated and public request fan-out more aggressively."
        min="1"
        step="1"
        placeholder="auto"
      />
    </div>

    <template v-if="page.isV8">
      <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.feesOrderChurn') }}</div>
      <div class="form-row cols-8">
        <FieldNumber id="f-fee-conversion-age" v-show="page.fieldVisible('fee_conversion_max_age_ms')" v-model="state.feeConversionAge" label="fee_conversion_max_age_ms" tip="Maximum age in milliseconds for cached fee-currency conversion prices." min="0" step="1000" />
        <FieldNumber id="f-fee-pct-fallback" v-show="page.fieldVisible('fee_pct_fallback')" v-model="state.feePctFallback" label="fee_pct_fallback" tip="Fallback trading-fee fraction used when the exchange does not provide a usable value." min="0" step="0.00001" />
        <FieldNumber id="f-fee-pct-sanity" v-show="page.fieldVisible('fee_pct_sanity_abs_max')" v-model="state.feePctSanity" label="fee_pct_sanity_abs_max" tip="Absolute upper sanity bound for an exchange-reported fee fraction." min="0" step="0.0001" />
        <FieldNumber id="f-churn-activation-count" v-show="page.fieldVisible('order_replacement_churn_gate_activation_count')" v-model="state.churnActivationCount" label="order_replacement_churn_gate_activation_count" tip="Number of replacement events required before the order-churn stability gate activates." min="0" step="1" />
        <FieldNumber id="f-churn-market-dist" v-show="page.fieldVisible('order_replacement_churn_gate_market_dist_pct')" v-model="state.churnMarketDist" label="order_replacement_churn_gate_market_dist_pct" tip="Market-distance threshold used by the PB8 order-replacement churn gate." min="0" max="0.999999" step="0.001" />
        <FieldNumber id="f-churn-stability-minutes" v-show="page.fieldVisible('order_replacement_churn_gate_stability_minutes')" v-model="state.churnStabilityMinutes" label="order_replacement_churn_gate_stability_minutes" tip="Required stable period in minutes before the churn gate permits replacement again." min="0" step="0.1" />
        <FieldNumber id="f-churn-window-minutes" v-show="page.fieldVisible('order_replacement_churn_gate_window_minutes')" v-model="state.churnWindowMinutes" label="order_replacement_churn_gate_window_minutes" tip="Rolling observation window in minutes for replacement churn." min="0" step="0.1" />
      </div>
    </template>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.warmupCandleFetch') }}</div>
    <div class="form-row cols-8">
      <FieldNumber id="f-max-warmup-min" v-show="page.fieldVisible('max_warmup_minutes')" v-model="state.maxWarmupMin" label="max_warmup_minutes" tip="Hard ceiling for the historical warm-up window (minutes). Use 0 to disable the cap; values above 0 clamp the per-symbol warmup calculated from EMA spans." min="0" step="100" />
      <FieldNumber id="f-warmup-jitter" v-show="page.fieldVisible('warmup_jitter_seconds')" v-model="state.warmupJitter" label="warmup_jitter_seconds" tip="Random startup delay spread (seconds) before warm-up begins. Helps multiple bots on the same machine avoid hitting the same files/APIs simultaneously." min="0" step="1" />
      <FieldNumber id="f-warmup-conc" v-show="page.fieldVisible('warmup_concurrency')" v-model="state.warmupConc" label="warmup_concurrency" tip="Concurrency cap for live warm-up tasks. 0 = auto-select; positive values limit how many symbols warm up in parallel." min="0" step="1" />
      <div class="form-group" v-show="page.fieldVisible('defer_broad_candle_warmup')" style="justify-content: flex-end">
        <FieldCheck id="f-defer-broad-candle-warmup" v-model="state.deferBroadCandleWarmup" label="defer_broad_candle_warmup" tip="Delay the broad multi-symbol candle warmup pass until it is actually needed. Keeps startup lighter when the bot can begin with narrower warmup data." />
      </div>
      <div class="form-group" v-show="page.fieldVisible('enable_archive_candle_fetch')" style="justify-content: flex-end">
        <FieldCheck id="f-archive-fetch" v-model="state.archiveFetch" label="enable_archive_candle_fetch" tip="Enables the archive-candle fallback path in live mode. Keep disabled unless you want the live bot to supplement its local candle state from exchange archive endpoints." />
      </div>
      <FieldNumber id="f-max-ohlcv-fetches" v-show="page.fieldVisible('max_ohlcv_fetches_per_minute')" v-model="state.maxOhlcvFetches" label="max_ohlcv_fetches_per_minute" tip="Live OHLCV/network budget for candle-backed indicators (forager ranking, warm-up). Set lower to reduce REST pressure; 0 = rely only on cached data." min="0" step="1" />
      <FieldNumber id="f-candle-lock" v-show="page.fieldVisible('candle_lock_timeout_seconds')" v-model="state.candleLock" label="candle_lock_timeout_seconds" tip="Seconds to wait for candle fetch lock when multiple bots share the same cache directory. Increase to avoid spurious timeouts." min="1" max="300" step="1" />
      <FieldSelect id="f-market-snapshot-strategy" v-show="page.fieldVisible('market_snapshot_ticker_strategy')" v-model="state.marketSnapshotStrategy" label="market_snapshot_ticker_strategy" :options="marketSnapshotOptions" tip="Choose how market snapshots fetch tickers. auto lets Passivbot choose per exchange, bulk uses multi-symbol ticker endpoints, symbols fetches one symbol at a time." />
    </div>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">Forager</div>
    <div class="form-row cols-8">
      <FieldNumber id="f-forager-hysteresis" v-show="page.fieldVisible('forager_score_hysteresis_pct')" v-model="state.foragerHysteresis" label="forager_score_hysteresis_pct" tip="Hysteresis applied to forager scores so Passivbot does not swap symbols too eagerly on tiny ranking changes." min="0" step="0.001" />
      <FieldNumber id="f-max-forager-stale" v-show="page.fieldVisible('max_forager_candle_staleness_minutes')" v-model="state.maxForagerStale" label="max_forager_candle_staleness_minutes" tip="Optional cap for how stale forager candidate candles may be before Passivbot refreshes them. Leave blank to use the runtime default." min="0" step="1" placeholder="auto" />
      <FieldNumber id="f-max-forager-refresh" v-show="page.fieldVisible('max_forager_candle_refresh_seconds')" v-model="state.maxForagerRefresh" label="max_forager_candle_refresh_seconds" tip="Refresh target for forager candles in seconds. Lower values keep rankings fresher but increase fetch pressure." min="1" step="1" />
      <div class="form-group" v-show="page.fieldVisible('enable_forager_ws_candles')" style="justify-content: flex-end">
        <FieldCheck id="f-enable-forager-ws" v-model="state.enableForagerWs" label="enable_forager_ws_candles" tip="Use completed WebSocket candles for PB8 forager updates when available." />
      </div>
      <FieldNumber id="f-forager-ws-audit" v-show="page.fieldVisible('forager_ws_candle_rest_audit_minutes')" v-model="state.foragerWsAudit" label="forager_ws_candle_rest_audit_minutes" tip="Minutes between REST audits of PB8 forager candles received over WebSocket." min="0.000001" max="60" step="1" />
    </div>

    <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.storageFreshnessRuntime') }}</div>
    <div class="form-row cols-8" style="margin-bottom: 0">
      <FieldNumber id="f-max-disk-candles" v-show="page.fieldVisible('max_disk_candles_per_symbol_per_tf')" v-model="state.maxDiskCandles" label="max_disk_candles_per_symbol_per_tf" tip="Maximum candles persisted on disk per symbol and timeframe. Oldest shards are pruned once this limit is hit. Default 2,000,000." min="0" step="10000" />
      <FieldNumber id="f-max-mem-candles" v-show="page.fieldVisible('max_memory_candles_per_symbol')" v-model="state.maxMemCandles" label="max_memory_candles_per_symbol" tip="Maximum 1m candles retained in RAM per symbol. Older entries are trimmed once this cap is exceeded. Default 200,000." min="0" step="10000" />
      <FieldNumber id="f-inactive-ttl" v-show="page.fieldVisible('inactive_coin_candle_ttl_minutes')" v-model="state.inactiveTtl" label="inactive_coin_candle_ttl_minutes" tip="How long (minutes) 1m candles for inactive symbols may stay in RAM before the live bot refreshes them. Lower values keep symbols fresher at the cost of more network/disk activity." min="0" step="1" />
      <FieldNumber id="f-max-active-tail-gap" v-show="page.fieldVisible('max_active_candle_tail_gap_minutes')" v-model="state.maxActiveTailGap" label="max_active_candle_tail_gap_minutes" tip="Maximum acceptable gap, in minutes, for the active-symbol candle tail before Passivbot refreshes or treats it as stale." min="1" step="1" />
      <FieldNumber id="f-bal-override" v-show="page.fieldVisible('balance_override')" v-model="state.balOverride" label="balance_override" tip="0 = disabled (uses exchange balance)" min="0" step="100" />
      <FieldNumber id="f-bal-hyst" v-show="page.fieldVisible('balance_hysteresis_snap_pct')" v-model="state.balHyst" label="balance_hysteresis_snap_pct" tip="Hysteresis snap percentage applied to balance updates to reduce noise from small fluctuations. Set 0.0 to disable." min="0" max="0.5" step="0.01" />
      <FieldNumber id="f-mem-snapshot" v-show="page.fieldVisible('memory_snapshot_interval_minutes')" v-model="state.memSnapshot" label="logging.memory_snapshot_interval_minutes" tip="Interval (minutes) between memory telemetry log entries (RSS, cache footprint, asyncio task counts). Default 30." min="1" step="5" />
      <FieldNumber id="f-vol-refresh" v-show="page.fieldVisible('volume_refresh_info_threshold_seconds')" v-model="state.volRefresh" label="logging.volume_refresh_info_threshold_seconds" tip="Minimum duration (seconds) a bulk volume-EMA refresh must take before it is promoted to an INFO log entry. Set 0 to log every refresh at INFO." min="0" step="5" />
    </div>

    <template v-if="page.isV8">
      <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.pb8Runtime') }}</div>
      <div class="form-row cols-8">
        <FieldNumber id="f-exchange-symbol-cooldown" v-show="page.fieldVisible('exchange_symbol_unavailable_cooldown_hours')" v-model="state.exchangeSymbolCooldown" label="exchange_symbol_unavailable_cooldown_hours" tip="Hours PB8 keeps an exchange-reported unavailable symbol in its in-memory cooldown. 0 disables the cooldown. The state resets when PB8 restarts." min="0" max="876600" step="0.1" style="grid-column: span 2" />
        <FieldText id="f-custom-endpoints-path" v-show="page.fieldVisible('custom_endpoints_path')" v-model="state.customEndpointsPath" label="custom_endpoints_path" tip="Optional path to a PB8 custom-endpoints definition. Leave blank to use built-in endpoints." placeholder="default" style="grid-column: span 2" />
        <div class="form-group" v-show="page.fieldVisible('startup_phase_budgets')" style="grid-column: span 4">
          <label><span data-tip="Expert diagnostic reporting thresholds only; these values do not gate startup or trading. Use canonical phase names with elapsed_ms and/or since_previous_ms non-negative integer values. An empty object uses runtime defaults.">startup_phase_budgets (Expert/Diagnostic)</span></label>
          <textarea id="f-startup-phase-budgets" v-model="state.startupPhaseBudgets" class="json-editor" rows="4"></textarea>
          <div id="f-startup-phase-budgets-status" class="hidden text-sm leading-[1.35]" aria-live="polite"></div>
        </div>
      </div>

      <div class="mb-2 mt-3 text-sm font-semibold text-accent">{{ t('v7run.logging') }}</div>
      <div class="form-row cols-8">
        <FieldText id="f-log-dir" v-show="page.fieldVisible('dir')" v-model="state.logDir" label="logging.dir" tip="Directory used by PB8 for its own log files." />
        <FieldNumber id="f-log-max-bytes" v-show="page.fieldVisible('max_bytes_mb')" v-model="state.logMaxBytes" label="logging.max_bytes_mb" tip="Maximum size in MiB of one PB8 log file before rotation." min="0" step="1" />
        <FieldNumber id="f-log-backup-count" v-show="page.fieldVisible('backup_count')" v-model="state.logBackupCount" label="logging.backup_count" tip="Number of rotated PB8 log files retained." min="0" step="1" />
        <div class="form-group" style="justify-content: flex-end">
          <FieldCheck id="f-log-persist" v-show="page.fieldVisible('persist_to_file')" v-model="state.logPersist" label="logging.persist_to_file" />
        </div>
        <div class="form-group" style="justify-content: flex-end">
          <FieldCheck id="f-log-rotation" v-show="page.fieldVisible('rotation')" v-model="state.logRotation" label="logging.rotation" />
        </div>
        <div class="form-group" v-show="page.fieldVisible('live_event_debug_profiles')" style="grid-column: span 3">
          <label><span data-tip="PB8 live-event debug profiles as a JSON array.">logging.live_event_debug_profiles</span></label>
          <textarea id="f-log-debug-profiles" v-model="state.logDebugProfiles" class="json-editor" rows="4"></textarea>
          <div id="f-log-debug-profiles-status" class="hidden text-sm leading-[1.35]" aria-live="polite"></div>
        </div>
      </div>

      <div class="mb-2 mt-3 text-sm font-semibold text-accent" v-show="page.fieldVisible('monitorEnabled')">{{ t('v7run.monitoring') }}</div>
      <div class="form-row cols-8" v-show="page.fieldVisible('monitorEnabled')">
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-enabled" v-show="page.fieldVisible('monitorEnabled')" v-model="state.monitorEnabled" label="monitor.enabled" /></div>
        <FieldText id="f-monitor-root-dir" v-show="page.fieldVisible('root_dir')" v-model="state.monitorRootDir" label="monitor.root_dir" />
        <FieldNumber id="f-monitor-snapshot-interval" v-show="page.fieldVisible('snapshot_interval_seconds')" v-model="state.monitorSnapshotInterval" label="monitor.snapshot_interval_seconds" min="0" step="0.1" />
        <FieldNumber id="f-monitor-checkpoint" v-show="page.fieldVisible('checkpoint_interval_minutes')" v-model="state.monitorCheckpoint" label="monitor.checkpoint_interval_minutes" min="0" step="0.1" />
        <FieldNumber id="f-monitor-rotation-mb" v-show="page.fieldVisible('event_rotation_mb')" v-model="state.monitorRotationMb" label="monitor.event_rotation_mb" min="0" step="1" />
        <FieldNumber id="f-monitor-rotation-minutes" v-show="page.fieldVisible('event_rotation_minutes')" v-model="state.monitorRotationMinutes" label="monitor.event_rotation_minutes" min="0" step="1" />
        <FieldNumber id="f-monitor-max-bytes" v-show="page.fieldVisible('max_total_bytes')" v-model="state.monitorMaxBytes" label="monitor.max_total_bytes" min="0" step="1" />
        <FieldNumber id="f-monitor-price-interval" v-show="page.fieldVisible('price_tick_min_interval_ms')" v-model="state.monitorPriceInterval" label="monitor.price_tick_min_interval_ms" min="0" step="1" />
        <FieldNumber id="f-monitor-retain-days" v-show="page.fieldVisible('retain_days')" v-model="state.monitorRetainDays" label="monitor.retain_days" min="0" step="0.1" />
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-compress" v-show="page.fieldVisible('compress_rotated_segments')" v-model="state.monitorCompress" label="monitor.compress_rotated_segments" /></div>
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-emit-candles" v-show="page.fieldVisible('emit_completed_candles')" v-model="state.monitorEmitCandles" label="monitor.emit_completed_candles" /></div>
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-raw-fills" v-show="page.fieldVisible('include_raw_fill_payloads')" v-model="state.monitorRawFills" label="monitor.include_raw_fill_payloads" /></div>
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-retain-candles" v-show="page.fieldVisible('retain_candles')" v-model="state.monitorRetainCandles" label="monitor.retain_candles" /></div>
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-retain-fills" v-show="page.fieldVisible('retain_fills')" v-model="state.monitorRetainFills" label="monitor.retain_fills" /></div>
        <div class="form-group" style="justify-content: flex-end"><FieldCheck id="f-monitor-retain-ticks" v-show="page.fieldVisible('retain_price_ticks')" v-model="state.monitorRetainTicks" label="monitor.retain_price_ticks" /></div>
      </div>
    </template>
  </ExpanderGroup>
</template>
