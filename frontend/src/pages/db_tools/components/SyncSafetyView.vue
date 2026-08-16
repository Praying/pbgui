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
  <div class="safety-summary">
    <div class="safety-title" :class="safety.ok ? 'ok' : 'err'">{{
      safety.ok ? t('misc.dbtools.safetyCheckPassed') : t('misc.dbtools.safetyCheckBlocked')
    }}</div>
    <div class="safety-muted">{{ t('misc.dbtools.safetyChecked') }}</div>

    <template v-if="targetEntries.length">
      <div class="safety-block">
        <div class="safety-target">{{ t('misc.dbtools.targets') }}</div>
        <div v-for="[target, status] in targetEntries" :key="target" class="safety-block">
          <div class="safety-target">
            {{ target }}:
            {{ (blocked[target] || []).length ? t('misc.dbtools.blocked') : t('misc.dbtools.safe') }}
            <span class="safety-muted">({{ status.running ? t('misc.dbtools.pbdataRunning') : t('misc.dbtools.pbdataNotRunning') }})</span>
          </div>
          <div class="safety-user-list">
            <template v-if="users.length">
              <span
                v-for="user in users"
                :key="user"
                class="safety-bubble"
                :class="(blocked[target] || []).includes(user) ? 'err' : 'ok'"
              >{{ user }}{{ (blocked[target] || []).includes(user) ? t('misc.dbtools.activeOnTarget') : t('misc.dbtools.safeSuffix') }}</span>
            </template>
            <span v-else class="safety-muted">{{ t('misc.dbtools.noUsersSelected') }}</span>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="safety-muted">{{ t('misc.dbtools.noTargetsSelected') }}</div>

    <div v-if="conflicts.length" class="safety-block">
      <div class="safety-target">{{ t('misc.dbtools.jobConflicts') }}</div>
      <span v-for="(item, index) in conflicts" :key="index" class="safety-bubble err">
        {{ item.job_name || item.job_id || t('misc.dbtools.existingJob') }}:
        {{ t('misc.dbtools.conflictDetail', { source: item.source || '-', users: (item.users || []).join(', ') }) }}
      </span>
    </div>
  </div>
</template>
