<script setup lang="ts">
/*
 * CMC key add/rotate/edit modal, ported 1:1 from the legacy
 * frontend/services_monitor.html #cmc-key-modal markup plus the
 * openCmcKeyModal/submitCmcKey/closeCmcKeyModal field logic. The parent
 * (CmcPoolPanel) owns the operation id and the mutation engine; this modal
 * only collects the payload and enforces the secret-required guard.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { useEscapeClose } from '@/shared/composables/useEscapeClose';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import type { CmcKey } from '../types';

defineOptions({ name: 'CmcKeyModal' });

/** Payload emitted on submit - the legacy submitCmcKey form snapshot. */
export interface CmcKeyPayload {
  secret: string;
  label: string;
  imported: boolean;
  shared: boolean;
  active: boolean;
}

interface Props {
  open: boolean;
  mode: 'add' | 'rotate' | 'edit';
  /** Key whose fields are prefilled in edit mode (legacy selectedCmcKey()). */
  selected?: CmcKey | null;
  /** Legacy _cmcMutationBusy: blocks close and submit. */
  busy?: boolean;
  /** Mutation error from the parent (legacy #cmc-key-modal-error). */
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  selected: null,
  busy: false,
  error: '',
});

const emit = defineEmits<{
  submit: [payload: CmcKeyPayload];
  'update:open': [open: boolean];
}>();

const { t } = useI18n();

const secret = ref('');
const label = ref('');
const imported = ref(false);
const shared = ref(false);
const active = ref(true);
/** Single error slot shared by validation and mutation failures (legacy element). */
const localError = ref('');

const secretInput = ref<{ focus: () => void } | null>(null);
const labelInput = ref<{ focus: () => void } | null>(null);

const title = computed(() => {
  if (props.mode === 'rotate') return t('sysmon.rotateTitled', { label: props.selected?.label || props.selected?.id });
  if (props.mode === 'edit') return t('sysmon.editTitled', { label: props.selected?.label || props.selected?.id });
  return t('sysmon.addCmcKey');
});

const submitLabel = computed(() => {
  if (props.mode === 'rotate') return t('sysmon.rotate');
  if (props.mode === 'edit') return t('common.save');
  return t('sysmon.addKey');
});

/** Legacy openCmcKeyModal: every open re-initialises the fields from the mode. */
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localError.value = '';
    secret.value = '';
    const edit = props.mode === 'edit';
    label.value = edit ? props.selected?.label || '' : '';
    imported.value = edit ? !!props.selected?.imported : false;
    shared.value = edit ? !!props.selected?.shared : false;
    active.value = edit ? props.selected?.active !== false : true;
    void nextTick(() => {
      (edit ? labelInput.value : secretInput.value)?.focus();
    });
  },
  { immediate: true }
);

/** The parent mirrors the mutation error into the shared error element. */
watch(
  () => props.error,
  (error) => {
    localError.value = error;
  },
  { immediate: true }
);

/** Legacy clearCmcMutationContext(clearSecret=true): wipe an unchanged secret. */
function clearSecretIfUnchanged(value: string): void {
  // v-model keeps the element and the ref in sync, so clearing the ref clears
  // the input (legacy cleared the DOM input directly).
  if (secret.value === value) secret.value = '';
}

/** Legacy closeCmcKeyModal guard: closing is refused while a mutation runs. */
function requestClose(): void {
  if (props.busy) return;
  emit('update:open', false);
}

/* Escape parity with the shared Modal (keeps cmc-modal-* chrome). */
const dialogOpen = computed(() => props.open);
useEscapeClose(dialogOpen, requestClose);

/** Legacy submitCmcKey: validate, then hand the payload to the parent. */
function submit(): void {
  if (props.busy) return;
  if (props.mode !== 'edit' && !secret.value.trim()) {
    localError.value = t('sysmon.secretRequired');
    return;
  }
  localError.value = '';
  emit('submit', {
    secret: secret.value,
    label: label.value,
    imported: imported.value,
    shared: shared.value,
    active: active.value,
  });
}

defineExpose({ clearSecretIfUnchanged });
</script>

<template>
  <div v-if="open" class="cmc-modal-backdrop">
    <div class="cmc-modal-card" role="dialog" aria-modal="true" aria-labelledby="cmc-key-modal-title">
      <div class="cmc-modal-head">
        <div class="cmc-modal-title" id="cmc-key-modal-title">{{ title }}</div>
        <Button class="cmc-modal-close" variant="ghost" size="icon" type="button" :aria-label="t('common.close')" @click="requestClose"><PbIcon :icon="PhX" /></Button>
      </div>
      <div class="cmc-modal-body">
        <div class="form-field" id="cmc-key-label-field" v-show="mode !== 'rotate'">
          <label class="form-label" for="cmc-key-label">{{ t('sysmon.label') }}</label>
          <Input
            ref="labelInput"
            id="cmc-key-label"
            type="text"
            maxlength="120"
            autocomplete="off"
            :placeholder="t('sysmon.primaryCmcKey')"
            v-model="label"
          />
        </div>
        <div class="form-field" id="cmc-key-secret-field" v-show="mode !== 'edit'">
          <label class="form-label" for="cmc-key-secret">{{ t('sysmon.secret') }}</label>
          <Input
            ref="secretInput"
            id="cmc-key-secret"
            type="password"
            autocomplete="new-password"
            :placeholder="t('sysmon.pasteCmcKey')"
            v-model="secret"
          />
        </div>
        <div class="cmc-modal-options" id="cmc-key-options" v-show="mode !== 'rotate'">
          <label><Checkbox id="cmc-key-imported" v-model="imported" /> <span>{{ t('sysmon.importedExternal') }}</span></label>
          <label><Checkbox id="cmc-key-shared" v-model="shared" /> <span>{{ t('sysmon.sharedQuota') }}</span></label>
          <label><Checkbox id="cmc-key-active" v-model="active" /> <span>{{ t('sysmon.active') }}</span></label>
        </div>
        <div class="cmc-modal-error">{{ localError }}</div>
      </div>
      <div class="cmc-modal-actions">
        <Button type="button" @click="requestClose">{{ t('common.cancel') }}</Button>
        <Button class="save" id="cmc-key-submit" variant="primary" type="button" :disabled="busy" @click="submit">{{ submitLabel }}</Button>
      </div>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (CMC modal + settings form). -->
<style scoped>
.form-field { display: flex; flex-direction: column; gap: 3px; }
.form-label { font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.cmc-modal-backdrop { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: center; justify-content: center; padding: 1rem; background: var(--bg-backdrop); backdrop-filter: blur(2px); }
.cmc-modal-card { width: min(480px, 94vw); background: var(--bg-page); border: 1px solid var(--border-default); border-radius: 14px; box-shadow: var(--shadow-modal); overflow: hidden; }
.cmc-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border-subtle); background: var(--surface-workspace); }
.cmc-modal-title { color: var(--text-primary); font-size: var(--fs-md); font-weight: 700; }
.cmc-modal-body { display: grid; gap: 0.8rem; padding: 1rem 1.1rem; }
.cmc-modal-options { display: flex; gap: 1rem; flex-wrap: wrap; color: var(--text-secondary); font-size: var(--fs-sm); }
.cmc-modal-options label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; }
.cmc-modal-error { min-height: 1rem; color: var(--danger-soft); font-size: var(--fs-xs); }
.cmc-modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0 1.1rem 1rem; }
</style>
