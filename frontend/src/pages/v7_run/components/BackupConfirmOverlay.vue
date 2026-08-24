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
  <div class="fixed inset-0 z-[10020] flex items-center justify-center bg-backdrop p-5" id="backup-confirm-overlay">
    <div class="w-[min(520px,92vw)] overflow-hidden rounded-[14px] border border-border-default bg-page shadow-[0_20px_70px_rgba(5,8,14,0.9)]" role="dialog" aria-modal="true" aria-labelledby="backup-confirm-title">
      <div class="flex items-center justify-between gap-2 border-b border-border-subtle bg-card px-[1.1rem] py-[0.85rem]">
        <h3 id="backup-confirm-title">{{ t('v7run.rollbackInstance') }}</h3>
        <button type="button" class="cursor-pointer rounded-[5px] border-none bg-transparent px-[0.35rem] py-[0.2rem] text-lg leading-none text-muted hover:bg-white/6 hover:text-primary" id="backup-confirm-close" :aria-label="t('common.close')" @click="$emit('cancel')">&#x2715;</button>
      </div>
      <div class="grid gap-3 p-5 text-primary">
        <p class="m-0 leading-normal">{{ t('v7run.rollbackToBackup', { name, ts }) }}</p>
        <p class="text-sm text-secondary">{{ t('v7run.rollbackDetail') }}</p>
        <p v-if="runningHosts" class="font-semibold text-warning">
          {{ t('v7run.backupRunningWarning', { hosts: runningHosts }) }}
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" class="inline-flex h-8 items-center justify-center rounded-lg border border-accent/25 bg-accent/8 px-3 text-base font-semibold text-primary hover:border-accent-soft hover:bg-accent/16" id="backup-confirm-cancel" @click="$emit('cancel')">{{ t('common.cancel') }}</button>
          <button type="button" class="inline-flex h-8 items-center justify-center rounded-lg border border-accent-soft bg-accent-soft px-3 text-base font-semibold text-page hover:bg-accent" id="backup-confirm-ok" @click="$emit('confirm')">{{ t('v7run.rollback') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
