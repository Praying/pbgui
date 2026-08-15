<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Legacy #new-dash-dialog (dashboard_main.html openNewDashDialog + OK/cancel/
 * Enter/Escape handlers): the name is required (dash.pleaseEnterName), must be
 * unique among the dashboards (dash.nameExists), and the input resets on every
 * open. Errors stay visible until the dialog is reopened (legacy behavior).
 */
const props = withDefaults(
  defineProps<{
    visible: boolean;
    existingNames?: string[];
  }>(),
  { existingNames: () => [] }
);

const emit = defineEmits<{
  close: [];
  create: [name: string];
}>();

const { t } = useI18n();
const name = ref('');
const error = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
let focusTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    name.value = '';
    error.value = '';
    // Legacy openNewDashDialog: focus lands 50ms after showing the dialog.
    focusTimer = setTimeout(() => {
      nameInput.value?.focus();
    }, 50);
  }
);

function submit(): void {
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = t('dash.pleaseEnterName');
    return;
  }
  if (props.existingNames.includes(trimmed)) {
    error.value = t('dash.nameExists');
    return;
  }
  emit('create', trimmed);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') submit();
  if (event.key === 'Escape') emit('close');
}

onUnmounted(() => {
  clearTimeout(focusTimer);
});
</script>

<template>
  <div id="new-dash-dialog" v-show="visible">
    <div class="dlg-box">
      <div class="dlg-title">+ {{ t('dash.newDashboard') }}</div>
      <div class="dlg-field">
        <label>{{ t('dash.dashboardName') }}</label>
        <input
          id="new-dash-name"
          ref="nameInput"
          v-model="name"
          type="text"
          maxlength="32"
          :placeholder="t('dash.dashboardNamePlaceholder')"
          :class="{ err: error }"
          autocomplete="off"
          @keydown="onKeydown"
        >
        <div class="dlg-err" v-show="error">{{ error }}</div>
      </div>
      <div class="dlg-actions">
        <button class="dlg-btn secondary" id="new-dash-cancel" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button class="dlg-btn primary" id="new-dash-ok" @click="submit">
          {{ t('dash.createEdit') }}
        </button>
      </div>
    </div>
  </div>
</template>
