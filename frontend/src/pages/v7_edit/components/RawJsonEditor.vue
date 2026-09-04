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
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import ExpanderGroup from './ExpanderGroup.vue';
import { useEditPageContext } from '../composables/useEditPage';
import { getJsonLineDetail } from '@/shared/jsonValidation';

const { t } = useI18n();
const page = useEditPageContext();

/* The ui/Textarea exposes only focus/blur/select, so the reveal/auto-resize
   DOM surgery resolves the element by id (useJsonSync's rawElement pattern). */
function rawEl(): HTMLTextAreaElement | null {
  return document.getElementById('cfg-raw-json') as HTMLTextAreaElement | null;
}
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
  const el = rawEl();
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
  const el = rawEl();
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
  const el = rawEl();
  if (overlay.value && el) overlay.value.scrollTop = el.scrollTop;
}

/** Error state → full utility set (the former .field-status/.error/
 *  .field-status-inline.error rules — display and tint change together). */
function fieldStatusClass(hasError: boolean): string {
  return hasError
    ? 'mt-1 block rounded-sm border border-danger/35 bg-danger-deep/35 px-2.5 py-1.5 text-danger'
    : 'hidden';
}
</script>

<template>
  <ExpanderGroup id="exp-raw" :title="t('v7run.rawJson')">
    <div class="form-group">
      <div class="relative w-full min-w-0" id="cfg-raw-json-wrap">
        <div
          id="cfg-raw-json-status"
          class="text-sm leading-[1.35]"
          :class="fieldStatusClass(!!error)"
          aria-live="polite"
        >
          <template v-if="error">
            <div class="font-semibold">{{ summary }}</div>
            <div v-if="error.message" class="mt-0.5 text-danger-soft">{{ error.message }}</div>
            <div v-if="errorLines" class="mt-2">
              <Button type="button" variant="danger" size="sm" @click="reveal()">
                {{ t('v7run.revealLineInEditor') }}
              </Button>
            </div>
          </template>
        </div>
        <pre
          v-if="error"
          id="cfg-raw-json-highlight"
          ref="rawOverlay"
          class="pointer-events-none absolute inset-0 m-0 overflow-hidden border border-transparent bg-transparent p-2 font-mono text-xs leading-[1.4] text-transparent whitespace-pre-wrap break-words [tab-size:4] z-[2]"
          aria-hidden="true"
          @scroll="onScroll"
        ><span
          v-for="(line, index) in page.state.rawJson.split('\n')"
          :key="index"
          class="block"
          :class="errorLines === index + 1 ? 'v7e-line-error' : ''"
        >{{ line }}</span></pre>
        <!-- ui-migration: Textarea + the legacy json-editor class — the
             un-layered page rules still own the geometry (the highlight
             overlay aligns to it; #cfg-raw-json keeps the transparent
             background over the overlay). DOM access resolves by id. -->
        <Textarea
          id="cfg-raw-json"
          v-model="page.state.rawJson"
          class="json-editor block w-full min-w-0"
          :class="{ 'json-invalid': !!error }"
          style="overflow: hidden; resize: vertical"
          @input="page.jsonSync.scheduleRaw()"
          @scroll="onScroll"
        />
      </div>
    </div>
  </ExpanderGroup>
</template>
