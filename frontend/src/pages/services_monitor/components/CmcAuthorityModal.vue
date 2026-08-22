<script setup lang="ts">
/*
 * CMC authority transfer modal, ported 1:1 from the legacy
 * frontend/services_monitor.html #cmc-authority-modal markup plus the
 * openCmcAuthorityModal/submitCmcAuthorityTransfer/closeCmcAuthorityModal
 * guards. Node filtering and the current-assignment text are computed by the
 * parent (legacy uses the pool/domains payloads); this modal only picks the
 * target node.
 */
import { ref, watch } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';

defineOptions({ name: 'CmcAuthorityModal' });

/** One eligible node option (legacy option element: value + label text). */
export interface CmcAuthorityOption {
  nodeId: string;
  text: string;
}

interface Props {
  open: boolean;
  /** Legacy _cmcMutationBusy: blocks close and submit. */
  busy?: boolean;
  /** Mutation error from the parent (legacy #cmc-authority-error). */
  error?: string;
  quotaDomain?: string;
  currentText?: string;
  options?: CmcAuthorityOption[];
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
  error: '',
  quotaDomain: '',
  currentText: '',
  options: () => [],
});

const emit = defineEmits<{
  submit: [targetNodeId: string];
  'update:open': [open: boolean];
}>();

const { t } = useI18n();

const selectedNodeId = ref('');
const localError = ref('');

/** Legacy openCmcAuthorityModal: the first eligible node is preselected. */
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedNodeId.value = props.options[0]?.nodeId ?? '';
    localError.value = props.error;
  },
  { immediate: true }
);

watch(
  () => props.error,
  (error) => {
    localError.value = error;
  },
  { immediate: true }
);

/** Legacy closeCmcAuthorityModal guard: closing is refused while busy. */
function requestClose(): void {
  if (props.busy) return;
  emit('update:open', false);
}

/** Legacy submitCmcAuthorityTransfer guard: no submit without a selection. */
function submit(): void {
  if (props.busy || !selectedNodeId.value) return;
  emit('submit', selectedNodeId.value);
}
</script>

<template>
  <div v-if="open" class="cmc-modal-backdrop">
    <div class="cmc-modal-card" role="dialog" aria-modal="true" aria-labelledby="cmc-authority-modal-title">
      <div class="cmc-modal-head">
        <div class="cmc-modal-title" id="cmc-authority-modal-title">{{ t('sysmon.transferCmcAuthority') }}</div>
        <button class="cmc-modal-close" type="button" :aria-label="t('common.close')" @click="requestClose"><PbIcon :icon="PhX" /></button>
      </div>
      <div class="cmc-modal-body">
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.quotaDomain') }}</span>
          <div id="cmc-authority-domain" class="form-hint">{{ quotaDomain }}</div>
        </div>
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.currentAssignment') }}</span>
          <div id="cmc-authority-current" class="form-hint">{{ currentText }}</div>
        </div>
        <div class="form-field">
          <label class="form-label" for="cmc-authority-target">{{ t('sysmon.eligibleTargetNode') }}</label>
          <select class="form-select" id="cmc-authority-target" v-model="selectedNodeId">
            <option v-for="option in options" :key="option.nodeId" :value="option.nodeId">{{ option.text }}</option>
          </select>
        </div>
        <div class="cmc-modal-error">{{ localError }}</div>
      </div>
      <div class="cmc-modal-actions">
        <button class="form-btn" type="button" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="form-btn save" id="cmc-authority-submit" type="button" :disabled="busy" @click="submit">{{ t('sysmon.transferAuthority') }}</button>
      </div>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (CMC modal + settings form). -->
<style scoped>
.form-field { display: flex; flex-direction: column; gap: 3px; }
.form-label { font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.form-hint { font-size: var(--fs-xs); color: var(--text-disabled); }
.form-select { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: 5px; padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none; cursor: pointer; }
.form-select:focus { border-color: var(--border-strong); }
.form-btn { padding: 0 1rem; height: var(--btn-h); border-radius: 5px; border: 1px solid var(--border-default); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: var(--fs-sm); font-family: inherit; transition: all 0.12s; }
.form-btn:hover { border-color: var(--border-strong); color: var(--text-primary); }
.form-btn.save { background: rgb(var(--accent-rgb) / 0.18); border-color: var(--accent); color: var(--accent-soft); }
.form-btn.save:hover { background: var(--accent-deep); color: #f2f5fb; }
.cmc-modal-backdrop { position: fixed; inset: 0; z-index: 19000; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(5, 8, 14, 0.72); backdrop-filter: blur(2px); }
.cmc-modal-card { width: min(480px, 94vw); background: var(--bg-page); border: 1px solid var(--border-default); border-radius: 14px; box-shadow: 0 20px 70px rgba(5, 8, 14, 0.9); overflow: hidden; }
.cmc-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border-subtle); background: var(--surface-workspace); }
.cmc-modal-title { color: var(--text-primary); font-size: var(--fs-md); font-weight: 700; }
.cmc-modal-close { background: transparent; border: 0; color: var(--text-muted); font-size: var(--fs-lg); cursor: pointer; padding: 0.2rem 0.35rem; border-radius: 5px; }
.cmc-modal-close:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.06); }
.cmc-modal-body { display: grid; gap: 0.8rem; padding: 1rem 1.1rem; }
.cmc-modal-error { min-height: 1rem; color: var(--danger-soft); font-size: var(--fs-xs); }
.cmc-modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0 1.1rem 1rem; }
</style>
