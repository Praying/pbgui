<script setup lang="ts">
/**
 * The rollback confirmation overlay (v7_run.html:1089-1119,
 * openBackupConfirm): 'Rollback {name} to backup {ts}?' with the detail
 * note and the running-hosts warning. Now on the shared Modal primitive —
 * Escape, focus trap, scroll lock and z-index come from the token layer
 * (was z-[10020]).
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Modal } from '@/shared/components/ui/modal';

defineProps<{ name: string; ts: string; runningHosts: string }>();

const emit = defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <Modal
    open
    :title="t('v7run.rollbackInstance')"
    :close-label="t('common.close')"
    @cancel="emit('cancel')"
  >
    <p class="m-0 leading-normal">{{ t('v7run.rollbackToBackup', { name, ts }) }}</p>
    <p class="text-sm text-secondary">{{ t('v7run.rollbackDetail') }}</p>
    <p v-if="runningHosts" class="font-semibold text-warning">
      {{ t('v7run.backupRunningWarning', { hosts: runningHosts }) }}
    </p>
    <template #footer>
      <Button type="button" variant="info" id="backup-confirm-cancel" @click="emit('cancel')">{{ t('common.cancel') }}</Button>
      <Button type="button" variant="primary" id="backup-confirm-ok" @click="emit('confirm')">{{ t('v7run.rollback') }}</Button>
    </template>
  </Modal>
</template>
