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
import type { PanelStatus, ProgressState } from '../composables/useDbTools';

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

const statusText = computed(() => props.status?.text ?? '');

const progressSteps = computed(() => (props.progress?.steps || []).slice(-20));
</script>

<template>
  <div v-if="status" :id="statusId" class="status" :class="status.kind">{{ statusText }}</div>

  <div
    v-if="progress && progress.visible"
    class="progress-card visible"
    :class="{ error: progress.status === 'error' }"
  >
    <div class="progress-top">
      <div class="progress-title">{{ progress.kind || t('misc.dbtools.operation') }}</div>
      <div class="progress-meta">{{ progress.completed || 0 }} / {{ progress.total || 0 }} ({{ progress.percent || 0 }}%)</div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: (progress.percent || 0) + '%' }"></div>
    </div>
    <div class="progress-current">{{ progress.current || '' }}</div>
    <div class="progress-steps">
      <div v-for="(step, index) in progressSteps" :key="index" class="progress-step">{{ step.label || '' }}</div>
    </div>
  </div>

  <div id="confirm-ovl" :class="{ visible: confirm.active }" :aria-hidden="confirm.active ? 'false' : 'true'">
    <div id="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-head">
      <div id="confirm-head">{{ confirm.title || t('common.confirm') }}</div>
      <div id="confirm-body">
        <div id="confirm-msg">{{ confirm.message }}</div>
        <div id="confirm-detail">{{ confirm.detail }}</div>
        <div id="confirm-actions">
          <button id="confirm-cancel" class="btn pbgui-btn btn-secondary secondary" @click="emit('confirm', false)">{{ t('common.cancel') }}</button>
          <button id="confirm-ok" class="btn pbgui-btn" :class="confirm.danger ? 'danger btn-danger' : 'warning btn-warning'" @click="emit('confirm', true)">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
