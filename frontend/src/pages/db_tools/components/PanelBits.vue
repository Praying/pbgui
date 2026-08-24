<script setup lang="ts">
/*
 * Small shared panel primitives: the status box (setStatus :325-329 —
 * text or pretty JSON, ok/err coloring), the progress card (renderProgress
 * :902-915) and the confirm modal (:880-900 — closes only via its buttons).
 * The legacy setStatusHtml path is gone: the one HTML consumer (the sync
 * safety result) renders as the SyncSafetyView component instead.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PanelStatus, ProgressState, StatusKind } from '../composables/useDbTools';

const props = defineProps<{
  statusId?: string;
  status: PanelStatus | undefined;
  progress: ProgressState | undefined;
  confirm: {
    active: boolean;
    title: string;
    message: string;
    detail: string;
    danger: boolean;
  };
}>();

const emit = defineEmits<{
  (e: 'confirm', ok: boolean): void;
}>();

const { t } = useI18n();

/* Status → Tailwind utility mapping (the former db-tools.css .status.ok/.err
   tints). Returns the FULL colour set for the dynamic border+text pair. */
function statusKindClass(kind: StatusKind): string {
  if (kind === 'ok') return 'ok border-success/35 text-success-soft';
  if (kind === 'err') return 'err border-danger/42 text-danger-soft';
  return '';
}

const statusText = computed(() => props.status?.text ?? '');

const progressSteps = computed(() => (props.progress?.steps || []).slice(-20));
</script>

<template>
  <div v-if="status" :id="statusId" class="min-h-11 whitespace-pre-wrap rounded-[10px] border border-border-subtle bg-page p-3 font-mono text-sm leading-[1.45] text-secondary" :class="statusKindClass(status.kind)">{{ statusText }}</div>

  <div
    v-if="progress && progress.visible"
    class="block overflow-hidden rounded-[10px] border border-border-subtle bg-page"
    :class="progress.status === 'error' ? '' : ''"
  >
    <div class="flex items-center justify-between gap-3 border-b border-border-subtle px-[0.8rem] py-[0.7rem]">
      <div class="font-extrabold text-primary">{{ progress.kind || t('misc.dbtools.operation') }}</div>
      <div class="text-sm text-secondary">{{ progress.completed || 0 }} / {{ progress.total || 0 }} ({{ progress.percent || 0 }}%)</div>
    </div>
    <div class="h-2 overflow-hidden bg-card">
      <div class="h-full w-0 transition-[width] duration-200" :class="progress.status === 'error' ? 'bg-danger' : 'bg-[linear-gradient(90deg,#3f63ad,#96b9f4)]'" :style="{ width: (progress.percent || 0) + '%' }"></div>
    </div>
    <div class="border-b border-border-subtle px-[0.8rem] py-[0.65rem] text-sm text-secondary">{{ progress.current || '' }}</div>
    <div class="grid max-h-[170px] gap-1 overflow-auto pt-[0.45rem] pr-[0.8rem] pb-[0.7rem]">
      <div v-for="(step, index) in progressSteps" :key="index" class="progress-step text-sm text-primary">{{ step.label || '' }}</div>
    </div>
  </div>

  <div id="confirm-ovl" class="fixed inset-0 z-[8000] items-center justify-center bg-backdrop backdrop-blur-[2px]" :class="confirm.active ? 'visible flex' : 'hidden'" :aria-hidden="confirm.active ? 'false' : 'true'">
    <div id="confirm-box" class="w-[min(480px,92vw)] overflow-hidden rounded-[14px] border border-border-default bg-page shadow-[0_24px_80px_rgba(5,8,14,0.85)]" role="dialog" aria-modal="true" aria-labelledby="confirm-head">
      <div id="confirm-head" class="border-b border-border-subtle bg-card px-4 py-[0.9rem] font-extrabold">{{ confirm.title || t('common.confirm') }}</div>
      <div id="confirm-body" class="grid gap-3 p-5">
        <div id="confirm-msg" class="leading-[1.45] text-primary">{{ confirm.message }}</div>
        <div id="confirm-detail" class="text-sm leading-[1.45] text-secondary">{{ confirm.detail }}</div>
        <div id="confirm-actions" class="flex justify-end gap-2">
          <button id="confirm-cancel" class="pbgui-btn btn-secondary rounded-lg font-bold hover:opacity-90" @click="emit('confirm', false)">{{ t('common.cancel') }}</button>
          <button id="confirm-ok" class="pbgui-btn rounded-lg font-bold hover:opacity-90" :class="confirm.danger ? 'pbgui-btn btn-danger rounded-lg font-bold hover:opacity-90 border-danger-deep bg-danger-deep text-danger-soft' : 'pbgui-btn btn-warning rounded-lg font-bold hover:opacity-90 border-warning-deep bg-warning-deep text-warning-soft'" @click="emit('confirm', true)">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Step checkmark ported from styles/db-tools.css (::before pseudo-element
   cannot be expressed as a utility). */
.progress-step::before {
  content: '✓';
  margin-right: 7px;
  color: var(--success);
}
</style>
