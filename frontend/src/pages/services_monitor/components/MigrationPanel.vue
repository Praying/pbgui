<script setup lang="ts">
/*
 * Systemd-migration panel, ported 1:1 from the legacy migration markup plus
 * loadMigrationStatus/renderMigrationStatus/renderMigrationUnits/Crontab/
 * StartScript/Processes/migrationStatusMeta of frontend/services_monitor.html.
 *
 * The App shell owns the page-level migration state (_migrationStatus) and the
 * fetch flows (loadMigrationStatus/testSystemdMigration/runSystemdMigration);
 * this panel is the presentational half: ctrl strip (title/meta dot/label/
 * refresh), hero + info cards, preflight warnings, the four legacy tables and
 * the Test migration / Migrate action row. busy mirrors the legacy in-flight
 * button swaps; the run button is disabled unless migration_needed.
 */
import { computed } from 'vue';
import { PhArrowClockwise } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { migrationStatusMeta, type Translate } from '../status';
import type { MigrationStatus } from '../types';

interface Props {
  /** Legacy _migrationStatus (page-level; updated by every load/test/run). */
  status: MigrationStatus | null;
  /** Legacy forced reload placeholder: shown while loadMigrationStatus(true) is in flight. */
  loading?: boolean;
  /** Legacy in-flight button state ('test' → testSystemdMigration, 'run' → runSystemdMigration). */
  busy?: 'test' | 'run' | null;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  busy: null,
});

const emit = defineEmits<{
  /** Legacy ctrl-strip refresh → loadMigrationStatus(true). */
  refresh: [];
  /** Legacy #migration-test-btn → testSystemdMigration(). */
  test: [];
  /** Legacy #migration-run-btn → runSystemdMigration(). */
  run: [];
}>();

const { t } = useI18n();
const tt: Translate = (key, named) => (named ? t(key, named) : t(key));

/** Legacy migrationStatusMeta over the page-level status. */
const meta = computed(() => migrationStatusMeta(tt, props.status));

/** Legacy renderMigrationStatus short-circuit states. */
const isRetryCard = computed(() => !!props.status?._restart_pending && !props.status.user);
const isErrorCard = computed(() => !isRetryCard.value && !!props.status?._error);
const isBody = computed(() => props.loading || !props.status || isRetryCard.value || isErrorCard.value);

/** Legacy status-card badge class: running→ok, warn→warn, anything else→err. */
const statusBadgeCls = computed(() =>
  meta.value.cls === 'running' ? 'ok' : meta.value.cls === 'warn' ? 'warn' : 'err'
);

/** Legacy preflight first line: retry-ok / needed-warn / ok, always meta.text. */
const preflightCls = computed(() =>
  props.status?._restart_pending ? 'migration-ok' : props.status?.migration_needed ? 'migration-warn' : 'migration-ok'
);

/** Legacy missing_default_units → joined unit||service list. */
const missingUnitsText = computed(() =>
  (props.status?.missing_default_units ?? [])
    .map((row) => row.unit || row.service)
    .join(', ')
);

/** Legacy not_ready_default_units → "unit (enabled|disabled, state||unknown)" joined. */
const notReadyUnitsText = computed(() =>
  (props.status?.not_ready_default_units ?? [])
    .map((row) => {
      const name = row.unit || row.service;
      const enabled = row.enabled ? t('common.enabled') : t('common.disabled');
      const state = row.state || t('sysmon.unknownState');
      return `${name} (${enabled}, ${state})`;
    })
    .join(', ')
);
</script>

<template>
  <!-- Legacy #panel-migration markup: ctrl strip + #migration-wrap body. -->
  <div class="ctrl-strip">
    <span class="ctrl-title">{{ t('sysmon.migration') }}</span>
    <div class="ctrl-status">
      <div class="status-dot" :class="meta.cls"></div>
      <span class="status-label">{{ meta.label }}</span>
    </div>
    <span style="flex: 1"></span>
    <button class="ctrl-btn" type="button" @click="emit('refresh')"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</button>
  </div>

  <div class="settings-wrap" id="migration-wrap">
    <template v-if="isBody">
      <div v-if="props.loading || !props.status" class="migration-loading">{{ t('sysmon.loadingMigrationStatus') }}</div>
      <div v-else-if="isRetryCard" class="migration-section">
        <div class="migration-ok">{{ t('sysmon.migrationCompletedRetrying') }}</div>
      </div>
      <div v-else class="migration-section">
        <div class="migration-warn">{{ t('sysmon.failedToLoadMigrationStatus', { msg: props.status!._error }) }}</div>
      </div>
    </template>

    <template v-else>
      <div class="migration-hero">
        <div class="migration-title">{{ t('sysmon.systemdMigrationTitle') }}</div>
        <div class="migration-desc">{{ t('sysmon.systemdMigrationDesc') }}</div>
      </div>

      <div class="migration-grid">
        <div class="migration-card">
          <div class="migration-label">{{ t('sysmon.status') }}</div>
          <div class="migration-value">
            <span class="migration-badge" :class="statusBadgeCls">{{ meta.label }}</span>
          </div>
        </div>
        <div class="migration-card">
          <div class="migration-label">{{ t('sysmon.colUser') }}</div>
          <div class="migration-value">{{ props.status!.user || '' }} (uid {{ props.status!.uid || '' }})</div>
        </div>
        <div class="migration-card">
          <div class="migration-label">{{ t('sysmon.pbguiDirectory') }}</div>
          <div class="migration-value">{{ props.status!.pbgui_dir || '' }}</div>
        </div>
        <div class="migration-card">
          <div class="migration-label">Python</div>
          <div class="migration-value">{{ props.status!.pbgui_python || '' }}</div>
        </div>
        <div class="migration-card">
          <div class="migration-label">{{ t('sysmon.unitDirectory') }}</div>
          <div class="migration-value">{{ props.status!.systemd_unit_dir || '' }}</div>
        </div>
        <div class="migration-card">
          <div class="migration-label">PB7</div>
          <div class="migration-value">{{ props.status!.pb7dir || t('sysmon.notConfigured') }}</div>
        </div>
      </div>

      <div class="migration-section">
        <div class="migration-section-title"><span>{{ t('sysmon.preflightResult') }}</span></div>
        <div :class="preflightCls">
          {{ props.status!._restart_pending ? t('sysmon.migrationCompletedRetrying') : meta.text }}
        </div>
        <div v-if="missingUnitsText" class="migration-warn">{{ t('sysmon.missingRequiredUnits', { units: missingUnitsText }) }}</div>
        <div v-if="notReadyUnitsText" class="migration-warn">{{ t('sysmon.notReadyRequiredUnits', { units: notReadyUnitsText }) }}</div>
        <div v-for="warning in props.status!.warnings ?? []" :key="warning" class="migration-warn">{{ warning }}</div>
      </div>

      <div class="migration-section">
        <div class="migration-section-title"><span>{{ t('sysmon.systemdUnitsSection') }}</span></div>
        <div v-if="!(props.status!.systemd_units ?? []).length" class="migration-note">{{ t('sysmon.noUnitsReported') }}</div>
        <div v-else class="migration-table-wrap">
          <table class="migration-table">
            <thead>
              <tr>
                <th>{{ t('sysmon.colService') }}</th>
                <th>{{ t('sysmon.colUnit') }}</th>
                <th>{{ t('sysmon.colInstalled') }}</th>
                <th>{{ t('sysmon.colEnabled') }}</th>
                <th>{{ t('sysmon.colState') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in props.status!.systemd_units" :key="row.unit || row.service">
                <td>{{ row.service || '' }}</td>
                <td>{{ row.unit || '' }}</td>
                <td><span class="migration-badge" :class="row.exists ? 'ok' : 'err'">{{ row.exists ? t('sysmon.yes') : t('sysmon.missingBadge') }}</span></td>
                <td><span class="migration-badge" :class="row.enabled ? 'ok' : 'warn'">{{ row.enabled ? t('sysmon.yes') : t('sysmon.no') }}</span></td>
                <td>{{ row.state || t('sysmon.unknownState') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="migration-section">
        <div class="migration-section-title"><span>{{ t('sysmon.legacyCrontabSection') }}</span></div>
        <template v-if="(props.status!.legacy_crontab?.entries ?? []).length">
          <div class="migration-warn">{{ t('sysmon.crontabWillBeRemoved') }}</div>
          <div class="migration-table-wrap">
            <table class="migration-table">
              <thead><tr><th>{{ t('sysmon.colEntry') }}</th></tr></thead>
              <tbody>
                <tr v-for="entry in props.status!.legacy_crontab!.entries" :key="entry"><td>{{ entry }}</td></tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-else class="migration-ok">{{ t('sysmon.noCrontabEntries') }}</div>
      </div>

      <div class="migration-section">
        <div class="migration-section-title"><span>{{ t('sysmon.legacyStartScriptSection') }}</span></div>
        <div v-if="props.status!.legacy_start_sh?.exists" class="migration-warn">
          {{ t('sysmon.startScriptWillBeDeleted', { path: props.status!.legacy_start_sh?.path || '' }) }}
        </div>
        <div v-else class="migration-ok">{{ t('sysmon.noStartScript') }}</div>
      </div>

      <div class="migration-section">
        <div class="migration-section-title"><span>{{ t('sysmon.detectedProcessesSection') }}</span></div>
        <div v-if="!(props.status!.processes ?? []).length" class="migration-note">{{ t('sysmon.noProcessesDetected') }}</div>
        <div v-else class="migration-table-wrap">
          <table class="migration-table">
            <thead>
              <tr>
                <th>{{ t('sysmon.colService') }}</th>
                <th>PID</th>
                <th>{{ t('sysmon.colUser') }}</th>
                <th>{{ t('sysmon.colCurrentApi') }}</th>
                <th>{{ t('sysmon.colCommand') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="proc in props.status!.processes" :key="proc.pid">
                <td>{{ proc.service || '' }}</td>
                <td>{{ proc.pid || '' }}</td>
                <td>{{ proc.username || '' }}</td>
                <td><span class="migration-badge" :class="proc.current ? 'warn' : ''">{{ proc.current ? t('sysmon.yes') : t('sysmon.no') }}</span></td>
                <td>{{ proc.cmdline || '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="migration-section">
        <div class="migration-section-title"><span>{{ t('sysmon.action') }}</span></div>
        <div class="migration-actions">
          <button
            class="migration-primary"
            id="migration-test-btn"
            type="button"
            :disabled="props.busy === 'test'"
            @click="emit('test')"
          >{{ props.busy === 'test' ? t('sysmon.testing') : t('sysmon.testMigration') }}</button>
          <button
            class="migration-primary"
            id="migration-run-btn"
            type="button"
            :disabled="!props.status!.migration_needed || props.busy === 'run'"
            @click="emit('run')"
          >{{ props.busy === 'run' ? t('sysmon.migrating') : t('sysmon.migrateMasterToSystemd') }}</button>
          <span class="migration-note">{{ t('sysmon.apiRestartNote') }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (migration-* classes,
     page-level ctrl-strip/status-dot/settings-wrap). -->
<style scoped>
.ctrl-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--surface-workspace);
}
.ctrl-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-primary);
}
.ctrl-status {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-disabled);
  flex-shrink: 0;
}
.status-dot.running { background: var(--success); }
.status-dot.stopped { background: var(--danger); }
.status-dot.warn { background: var(--warning); }
.status-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ctrl-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 5px;
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  transition: all 0.12s;
}
.ctrl-btn:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
.settings-wrap { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
.migration-loading { color: var(--text-disabled); font-style: italic; }
.migration-hero { background: var(--bg-page); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
.migration-title { font-size: var(--fs-lg); font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem; }
.migration-desc { color: var(--text-secondary); line-height: 1.45; max-width: 860px; }
.migration-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.migration-card { background: var(--bg-page); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.75rem; min-width: 0; }
.migration-label { font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
.migration-value { color: var(--text-primary); font-size: var(--fs-sm); word-break: break-all; }
.migration-section { background: var(--bg-page); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem; }
.migration-section-title { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; color: var(--text-primary); font-weight: 700; font-size: var(--fs-md); margin-bottom: 0.55rem; }
.migration-note { color: var(--text-secondary); font-size: var(--fs-sm); line-height: 1.45; }
.migration-warn { background: color-mix(in srgb, var(--warning-deep) 28%, var(--bg-card)); border: 1px solid rgb(var(--warning-rgb) / 0.5); color: var(--warning-soft); border-radius: 7px; padding: 0.55rem 0.7rem; margin: 0.45rem 0; font-size: var(--fs-sm); }
.migration-ok { background: color-mix(in srgb, var(--success-deep) 28%, var(--bg-card)); border: 1px solid rgb(var(--success-deep-rgb) / 0.7); color: var(--success); border-radius: 7px; padding: 0.55rem 0.7rem; margin: 0.45rem 0; font-size: var(--fs-sm); }
.migration-table-wrap { overflow-x: auto; }
.migration-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.migration-table th { background: var(--surface-workspace); color: var(--text-muted); padding: 0.4rem 0.55rem; text-align: left; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
.migration-table td { padding: 0.35rem 0.55rem; border-bottom: 1px solid var(--bg-page); color: var(--text-secondary); vertical-align: top; }
.migration-table tr:hover td { background: var(--bg-page); }
.migration-badge { display: inline-flex; align-items: center; padding: 0.12rem 0.45rem; border-radius: 999px; border: 1px solid var(--border-default); color: var(--text-secondary); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.migration-badge.ok { color: var(--success); border-color: rgb(var(--success-rgb) / 0.45); background: color-mix(in srgb, var(--success-deep) 28%, var(--bg-card)); }
.migration-badge.warn { color: var(--warning-soft); border-color: rgb(var(--warning-rgb) / 0.5); background: color-mix(in srgb, var(--warning-deep) 28%, var(--bg-card)); }
.migration-badge.err { color: var(--danger-soft); border-color: var(--danger-deep); background: color-mix(in srgb, var(--danger-deep) 28%, var(--bg-card)); }
.migration-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.migration-primary { height: var(--btn-h); padding: 0 1rem; border-radius: 6px; border: 1px solid var(--accent); background: rgb(var(--accent-rgb) / 0.18); color: var(--accent-soft); cursor: pointer; font-size: var(--fs-sm); font-family: inherit; }
.migration-primary:hover:not(:disabled) { background: var(--accent-deep); color: #fff; }
.migration-primary:disabled { cursor: not-allowed; opacity: 0.55; }
</style>
