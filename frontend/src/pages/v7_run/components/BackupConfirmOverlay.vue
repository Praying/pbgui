<script setup lang="ts">
/**
 * The rollback confirmation overlay (v7_run.html:1089-1119,
 * openBackupConfirm): 'Rollback {name} to backup {ts}?' with the detail
 * note, the running-hosts warning (warn class) and Cancel/Rollback actions.
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';

defineProps<{ name: string; ts: string; runningHosts: string }>();

defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="fixed inset-0 z-[10020] flex items-center justify-center bg-backdrop p-5" id="backup-confirm-overlay">
    <div class="w-[min(520px,92vw)] overflow-hidden rounded-[14px] border border-border-default bg-page shadow-[0_20px_70px_rgba(5,8,14,0.9)]" role="dialog" aria-modal="true" aria-labelledby="backup-confirm-title">
      <div class="flex items-center justify-between gap-2 border-b border-border-subtle bg-card px-[1.1rem] py-[0.85rem]">
        <h3 id="backup-confirm-title">{{ t('v7run.rollbackInstance') }}</h3>
        <Button type="button" variant="ghost" size="sm" class="text-lg leading-none" id="backup-confirm-close" :aria-label="t('common.close')" @click="$emit('cancel')">&#x2715;</Button>
      </div>
      <div class="grid gap-3 p-5 text-primary">
        <p class="m-0 leading-normal">{{ t('v7run.rollbackToBackup', { name, ts }) }}</p>
        <p class="text-sm text-secondary">{{ t('v7run.rollbackDetail') }}</p>
        <p v-if="runningHosts" class="font-semibold text-warning">
          {{ t('v7run.backupRunningWarning', { hosts: runningHosts }) }}
        </p>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="info" id="backup-confirm-cancel" @click="$emit('cancel')">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="primary" id="backup-confirm-ok" @click="$emit('confirm')">{{ t('v7run.rollback') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>
