<script setup lang="ts">
/**
 * Raw JSON expander — v7_edit.html:1126-1140 + the M-v7-2 validation
 * surface: the status line with reveal action (setRawJsonValidationError
 * :1411-1449), the error-line highlight overlay (syncRawJsonHighlightOverlay
 * :1392-1398 + buildLineHighlightHtml editor_shared :354-364) and the raw
 * sync scheduling (:1136 oninput → scheduleRawJsonEditorSync).
 */
import { computed, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ExpanderGroup from './ExpanderGroup.vue';
import { useEditPageContext } from '../composables/useEditPage';
import { getJsonLineDetail } from '@/shared/jsonValidation';

const { t } = useI18n();
const page = useEditPageContext();

const textarea = useTemplateRef<HTMLTextAreaElement>('rawTextarea');
const overlay = useTemplateRef<HTMLElement>('rawOverlay');
const open = ref(false);

const error = computed(() => page.rawError.value);

const summary = computed(() => {
  if (!error.value) return '';
  let message = t('v7run.rawJsonInvalid');
  if (error.value.line != null && error.value.column != null) {
    message += t('v7run.atLineColumn', { line: error.value.line, column: error.value.column });
  }
  return message;
});

const errorLines = computed(() => {
  if (!error.value?.line) return null;
  return error.value.line;
});

/** focusJsonErrorLocation (editor_shared :503-523). */
function reveal(): void {
  const el = textarea.value;
  if (!el || !error.value) return;
  const detail = getJsonLineDetail(el.value || '', error.value.line, error.value.column);
  el.focus();
  if (detail) {
    try {
      el.setSelectionRange(detail.selectionStart, detail.selectionEnd);
    } catch {
      /* legacy ignored selection failures */
    }
    const lineHeight = 20;
    const targetTop = window.scrollY + el.getBoundingClientRect().top + Math.max(0, detail.line - 2) * lineHeight - 120;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }
}

/** autoResizeTextarea (editor_shared :45-52). */
function autoResize(): void {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  const pre = overlay.value;
  if (pre) pre.scrollTop = el.scrollTop;
}

watch(
  () => page.state.rawJson,
  () => {
    // validate live like applyRaw (:2512-2513) so the status tracks typing
    const validation = page.validateRawText(page.state.rawJson);
    page.rawError.value = validation.error;
    requestAnimationFrame(autoResize);
  }
);

function onScroll(): void {
  if (overlay.value && textarea.value) overlay.value.scrollTop = textarea.value.scrollTop;
}
</script>

<template>
  <ExpanderGroup id="exp-raw" :title="t('v7run.rawJson')">
    <div class="form-group">
      <div class="raw-json-wrap" id="cfg-raw-json-wrap">
        <div
          id="cfg-raw-json-status"
          class="field-status"
          :class="{ error: !!error, 'field-status-inline': true }"
          aria-live="polite"
        >
          <template v-if="error">
            <div class="field-status-main">{{ summary }}</div>
            <div v-if="error.message" class="field-status-meta">{{ error.message }}</div>
            <div v-if="errorLines" class="field-status-actions">
              <button type="button" class="field-status-btn" @click="reveal()">
                {{ t('v7run.revealLineInEditor') }}
              </button>
            </div>
          </template>
        </div>
        <pre
          v-if="error"
          id="cfg-raw-json-highlight"
          ref="rawOverlay"
          class="raw-json-highlight visible"
          aria-hidden="true"
          @scroll="onScroll"
        ><span
          v-for="(line, index) in page.state.rawJson.split('\n')"
          :key="index"
          class="raw-json-highlight-line"
          :class="{ 'raw-json-highlight-error': errorLines === index + 1 }"
        >{{ line }}</span></pre>
        <textarea
          id="cfg-raw-json"
          ref="rawTextarea"
          v-model="page.state.rawJson"
          class="json-editor"
          :class="{ 'json-invalid': !!error }"
          style="overflow: hidden; resize: vertical"
          @input="page.jsonSync.scheduleRaw()"
          @scroll="onScroll"
        ></textarea>
      </div>
    </div>
  </ExpanderGroup>
</template>
