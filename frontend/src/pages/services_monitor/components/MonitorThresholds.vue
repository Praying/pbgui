<script setup lang="ts">
/*
 * Monitor threshold grids, ported 1:1 from the legacy renderMonitorSettingsFields
 * + collectMonitorConfigFromForm code in frontend/services_monitor.html: two
 * groups (Server Monitor mem/swap/disk/cpu, V7 Monitor mem/swap/cpu/error/
 * traceback), each field rendered as a warn + err number input with the legacy
 * `mc-<field>_<severity>_<prefix>` ids (step="any", 0 for keys the payload omits).
 *
 * Controlled component: values live in the parent (ApiServerSettings seeds them
 * from GET /settings/api-server); edits emit `update:monitorConfig` with the raw
 * input string so the legacy `parseFloat(value) || 0` collection semantics stay
 * in the save handler, exactly where the old code had them.
 */
import { useI18n } from 'vue-i18n';

/** Legacy groups table: field order and prefixes are contract-level. */
const MONITOR_GROUPS = [
  { titleKey: 'sysmon.serverMonitor', prefix: 'server', fields: ['mem', 'swap', 'disk', 'cpu'] },
  { titleKey: 'sysmon.v7Monitor', prefix: 'v7', fields: ['mem', 'swap', 'cpu', 'error', 'traceback'] },
] as const;

/** One input cell: legacy id/key + label key + warn/err suffix key. */
interface MonitorCell {
  key: string;
  id: string;
  labelKey: string;
  suffixKey: string;
}

/** Legacy render order per group: warn, err for each field. */
function cellsOf(group: (typeof MONITOR_GROUPS)[number]): MonitorCell[] {
  return group.fields.flatMap((field) =>
    (['warning', 'error'] as const).map((severity) => ({
      key: `${field}_${severity}_${group.prefix}`,
      id: `mc-${field}_${severity}_${group.prefix}`,
      labelKey: `sysmon.${field}`,
      suffixKey: severity === 'warning' ? 'sysmon.warnSuffix' : 'sysmon.errSuffix',
    }))
  );
}

interface Props {
  /** Raw input values keyed by legacy field name; missing keys render 0. */
  monitorConfig?: Record<string, string>;
}

withDefaults(defineProps<Props>(), { monitorConfig: () => ({}) });

const emit = defineEmits<{ 'update:monitorConfig': [value: Record<string, string>] }>();

const { t } = useI18n();

/** Legacy render value: monitorData[key] !== undefined ? value : 0. */
function valueOf(config: Record<string, string>, key: string): string {
  return config[key] !== undefined ? config[key]! : '0';
}

/** Emit the edited cell; the parent owns the map (immutable update). */
function onInput(config: Record<string, string>, key: string, event: Event): void {
  emit('update:monitorConfig', { ...config, [key]: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <div v-for="group in MONITOR_GROUPS" :key="group.prefix" class="monitor-group">
    <div class="monitor-group-title">{{ t(group.titleKey) }}</div>
    <div class="monitor-grid">
      <div v-for="cell in cellsOf(group)" :key="cell.id" class="monitor-cell">
        <span class="monitor-label">{{ t(cell.labelKey) }} {{ t(cell.suffixKey) }}</span>
        <input
          class="form-input"
          type="number"
          step="any"
          :id="cell.id"
          :value="valueOf(monitorConfig, cell.key)"
          @input="onInput(monitorConfig, cell.key, $event)"
        />
      </div>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html renderMonitorSettingsFields
     inline styles (grid + label colors, inputs full cell width). -->
<style scoped>
.monitor-group { margin-top: 1rem; }
.monitor-group-title {
  font-size: var(--fs-sm);
  color: #93c5fd;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.monitor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}
.monitor-cell { display: flex; flex-direction: column; gap: 2px; }
.monitor-label { font-size: var(--fs-xs); color: #94a3b8; }
.form-input {
  background: #1a202c; color: #e2e8f0; border: 1px solid #2d3748; border-radius: 5px;
  padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none;
  width: 100%;
}
.form-input:focus { border-color: #4a5568; }
</style>
