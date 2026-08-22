<script setup lang="ts">
/*
 * Alert routing groups, ported 1:1 from the legacy renderAlertRoutingSettings +
 * collectAlertRoutingFromForm code in frontend/services_monitor.html: four boxed
 * groups (Offline Hosts / Services / System Thresholds / Instance Thresholds),
 * each with a GUI column ("Show active alarms in GUI", suffix "Active alerts
 * only") and a Telegram column of routing checkboxes (suffix "-> Telegram").
 * The 13 checkbox ids are contract-level — they key the POST /settings/api-server
 * payload exactly like the old ids array.
 *
 * Controlled component: values live in the parent; a box renders checked unless
 * its id is explicitly false (legacy `data[id] !== false`), and toggles emit
 * `update:routing` with the target's new state.
 */
import { useI18n } from 'vue-i18n';

/** Legacy groups table — order, ids and labels are contract-level. */
const ROUTING_GROUPS = [
  {
    titleKey: 'sysmon.offlineHosts',
    guiId: 'offline_gui',
    telegram: [
      { id: 'ssh_lost_telegram', labelKey: 'sysmon.sshLost' },
      { id: 'ssh_recovered_telegram', labelKey: 'sysmon.sshRecovered' },
    ],
  },
  {
    titleKey: 'sysmon.services',
    guiId: 'service_gui',
    telegram: [
      { id: 'service_down_telegram', labelKey: 'sysmon.serviceDown' },
      { id: 'service_restart_started_telegram', labelKey: 'sysmon.restartInitiated' },
      { id: 'service_recovered_telegram', labelKey: 'sysmon.serviceRecovered' },
    ],
  },
  {
    titleKey: 'sysmon.systemThresholds',
    guiId: 'system_gui',
    telegram: [
      { id: 'system_problem_telegram', labelKey: 'sysmon.systemProblem' },
      { id: 'system_recovered_telegram', labelKey: 'sysmon.systemRecovered' },
    ],
  },
  {
    titleKey: 'sysmon.instanceThresholds',
    guiId: 'instance_gui',
    telegram: [
      { id: 'instance_problem_telegram', labelKey: 'sysmon.instanceProblem' },
      { id: 'instance_recovered_telegram', labelKey: 'sysmon.instanceRecovered' },
    ],
  },
] as const;

interface Props {
  /** Routing flags keyed by the 13 legacy ids; undefined renders checked. */
  routing?: Record<string, boolean>;
}

withDefaults(defineProps<Props>(), { routing: () => ({}) });

const emit = defineEmits<{ 'update:routing': [value: Record<string, boolean>] }>();

const { t } = useI18n();

/** Legacy checked state: data[id] !== false. */
function isChecked(routing: Record<string, boolean>, id: string): boolean {
  return routing[id] !== false;
}

/** Emit the flipped box; the parent owns the map (immutable update). */
function onToggle(routing: Record<string, boolean>, id: string, event: Event): void {
  emit('update:routing', { ...routing, [id]: (event.target as HTMLInputElement).checked });
}
</script>

<template>
  <div v-for="group in ROUTING_GROUPS" :key="group.guiId" class="alert-routing-group">
    <div class="alert-routing-title">{{ t(group.titleKey) }}</div>
    <div class="alert-routing-grid">
      <div class="alert-routing-col">
        <div class="alert-routing-col-header">GUI</div>
        <label class="alert-routing-check">
          <input
            type="checkbox"
            :id="group.guiId"
            :checked="isChecked(routing, group.guiId)"
            @change="onToggle(routing, group.guiId, $event)"
          />
          <span>{{ t('sysmon.showActiveAlarmsGui') }} <span class="label-hint">{{ t('sysmon.activeAlertsOnly') }}</span></span>
        </label>
      </div>
      <div class="alert-routing-col">
        <div class="alert-routing-col-header">Telegram</div>
        <label v-for="row in group.telegram" :key="row.id" class="alert-routing-check">
          <input
            type="checkbox"
            :id="row.id"
            :checked="isChecked(routing, row.id)"
            @change="onToggle(routing, row.id, $event)"
          />
          <span>{{ t(row.labelKey) }} <span class="label-hint">{{ t('sysmon.toTelegram') }}</span></span>
        </label>
      </div>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html renderAlertRoutingSettings
     inline styles (boxed groups, two-column grid, uppercase column headers). -->
<style scoped>
.alert-routing-group {
  margin-top: 1rem;
  border: 1px solid #29262c;
  border-radius: 8px;
  background: #171619;
  overflow: hidden;
}
.alert-routing-title {
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid #29262c;
  font-size: var(--fs-sm);
  color: #93c5fd;
  font-weight: 600;
}
.alert-routing-grid {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(280px, 1fr);
  gap: 1rem;
  padding: 0.85rem;
  align-items: start;
}
.alert-routing-col { display: grid; gap: 0.35rem; }
.alert-routing-col.telegram-col { gap: 0.45rem; }
.alert-routing-col-header {
  font-size: var(--fs-xs);
  color: #4e4851;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.alert-routing-check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: #a29ca6;
  font-size: var(--fs-sm);
  cursor: pointer;
}
.alert-routing-check input {
  accent-color: #4da6ff;
  cursor: pointer;
  width: 15px;
  height: 15px;
}
.alert-routing-check .label-hint { color: #4e4851; }
</style>
