<script setup lang="ts">
/*
 * The sync safety result — formatSyncSafetyResult (:562-603) as a template.
 * The legacy assembled escaped HTML; the Vue port renders the same structure
 * through interpolation (no markup strings anywhere).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SyncSafety } from '../composables/useDbTools';

const props = defineProps<{
  safety: SyncSafety;
  users: string[];
}>();

const { t } = useI18n();

const targetEntries = computed(() => Object.entries(props.safety.targets || {}));
const blocked = computed(() => props.safety.blocked || {});
const conflicts = computed(() => props.safety.conflicts || []);
</script>

<template>
  <div class="grid gap-3 text-primary">
    <div class="text-md font-black text-primary" :class="safety.ok ? 'text-success-soft' : 'text-danger-soft'">{{
      safety.ok ? t('misc.dbtools.safetyCheckPassed') : t('misc.dbtools.safetyCheckBlocked')
    }}</div>
    <div class="text-sm text-secondary">{{ t('misc.dbtools.safetyChecked') }}</div>

    <template v-if="targetEntries.length">
      <div class="grid gap-[7px]">
        <div class="font-black text-primary">{{ t('misc.dbtools.targets') }}</div>
        <div v-for="[target, status] in targetEntries" :key="target" class="grid gap-[7px]">
          <div class="font-black text-primary">
            {{ target }}:
            {{ (blocked[target] || []).length ? t('misc.dbtools.blocked') : t('misc.dbtools.safe') }}
            <span class="text-sm text-secondary">({{ status.running ? t('misc.dbtools.pbdataRunning') : t('misc.dbtools.pbdataNotRunning') }})</span>
          </div>
          <div class="flex flex-col items-start gap-[5px]">
            <template v-if="users.length">
              <span
                v-for="user in users"
                :key="user"
                class="safety-bubble inline-flex items-center gap-[7px] rounded-full px-2.5 py-[3px] text-sm font-extrabold"
                :class="(blocked[target] || []).includes(user) ? 'border-danger/35 bg-danger/12 text-danger-soft' : 'border-success/30 bg-success/12 text-success-soft'"
              >{{ user }}{{ (blocked[target] || []).includes(user) ? t('misc.dbtools.activeOnTarget') : t('misc.dbtools.safeSuffix') }}</span>
            </template>
            <span v-else class="text-sm text-secondary">{{ t('misc.dbtools.noUsersSelected') }}</span>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="text-sm text-secondary">{{ t('misc.dbtools.noTargetsSelected') }}</div>

    <div v-if="conflicts.length" class="grid gap-[7px]">
      <div class="font-black text-primary">{{ t('misc.dbtools.jobConflicts') }}</div>
      <span v-for="(item, index) in conflicts" :key="index" class="safety-bubble inline-flex items-center gap-[7px] rounded-full border border-danger/35 bg-danger/12 px-2.5 py-[3px] text-sm font-extrabold text-danger-soft">
        {{ item.job_name || item.job_id || t('misc.dbtools.existingJob') }}:
        {{ t('misc.dbtools.conflictDetail', { source: item.source || '-', users: (item.users || []).join(', ') }) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Status dot ported from styles/db-tools.css (::before pseudo-element). */
.safety-bubble::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}
</style>
