<script setup lang="ts">
/**
 * The rollback confirmation overlay (v7_run.html:1089-1119,
 * openBackupConfirm): 'Rollback {name} to backup {ts}?' with the detail
 * note, the running-hosts warning (warn class) and Cancel/Rollback actions.
 */
import { useI18n } from 'vue-i18n';

defineProps<{ name: string; ts: string; runningHosts: string }>();

defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="backup-confirm-overlay" id="backup-confirm-overlay">
    <div class="backup-confirm-box" role="dialog" aria-modal="true" aria-labelledby="backup-confirm-title">
      <div class="backup-confirm-header">
        <h3 id="backup-confirm-title">{{ t('v7run.rollbackInstance') }}</h3>
        <button type="button" class="backup-confirm-close" id="backup-confirm-close" :aria-label="t('common.close')" @click="$emit('cancel')">&#x2715;</button>
      </div>
      <div class="backup-confirm-body">
        <p>{{ t('v7run.rollbackToBackup', { name, ts }) }}</p>
        <p class="backup-confirm-detail">{{ t('v7run.rollbackDetail') }}</p>
        <p v-if="runningHosts" class="backup-confirm-detail warn">
          {{ t('v7run.backupRunningWarning', { hosts: runningHosts }) }}
        </p>
        <div class="backup-confirm-actions">
          <button type="button" class="btn-cancel" id="backup-confirm-cancel" @click="$emit('cancel')">{{ t('common.cancel') }}</button>
          <button type="button" class="btn-confirm" id="backup-confirm-ok" @click="$emit('confirm')">{{ t('v7run.rollback') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
