<script setup lang="ts">
/**
 * Import-config modal — v7_edit.html:1172-1191 markup, the user combobox
 * (:3115-3203) and doImport (:3228-3280): paste a full config, pick a
 * configured user, POST /draft to normalize, then populate the editor
 * (keeping the current version for v8 / next-version for v7).
 */
import { computed, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditPageContext } from '../composables/useEditPage';
import { validateJsonText } from '@/shared/jsonValidation';

const { t } = useI18n();
const page = useEditPageContext();

const open = defineModel<boolean>({ required: true });
const json = ref('');
const user = ref('');
const error = ref<{ summary: string; message: string } | null>(null);
const optionsOpen = ref(false);
const activeIndex = ref(-1);
const userEl = useTemplateRef<HTMLInputElement>('userEl');
const jsonEl = useTemplateRef<HTMLTextAreaElement>('jsonEl');

const validation = computed(() =>
  validateJsonText(json.value, {
    expectObject: true,
    emptyMessage: t('v7run.configCannotBeEmpty'),
    messages: { cannotBeEmpty: t('v7run.configCannotBeEmpty'), topLevelObject: t('editor.json.topLevelObject') },
  })
);

const matches = computed(() => {
  const query = user.value.trim().toLowerCase();
  return page.users.value.filter((u) => String(u.name || '').toLowerCase().includes(query));
});

function show(): void {
  json.value = '';
  user.value = page.state.user;
  error.value = null;
  optionsOpen.value = false;
  activeIndex.value = -1;
  open.value = true;
  requestAnimationFrame(() => userEl.value?.focus());
}

function close(): void {
  open.value = false;
  error.value = null;
  optionsOpen.value = false;
}

function closeSoon(): void {
  window.setTimeout(() => {
    optionsOpen.value = false;
  }, 0);
}

function pick(name: string): void {
  user.value = name;
  optionsOpen.value = false;
  userEl.value?.focus();
}

function move(delta: number): void {
  if (!matches.value.length) return;
  activeIndex.value = (activeIndex.value + delta + matches.value.length) % matches.value.length;
}

async function fetchJson(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const resp = await fetch(page.apiBaseOf() + path, { credentials: 'same-origin', ...init });
  const body: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = (body as { detail?: unknown }).detail;
    throw new Error(typeof detail === 'string' ? detail : 'HTTP ' + resp.status);
  }
  return body as Record<string, unknown>;
}

async function doImport(): Promise<void> {
  error.value = null;
  if (validation.value.error || !validation.value.parsed) {
    error.value = { summary: t('v7run.fieldIsInvalid', { label: t('v7run.importJson') }), message: validation.value.error?.message ?? '' };
    return;
  }
  const parsed = validation.value.parsed as Record<string, unknown>;
  const matched = page.users.value.find(
    (u) => String(u.name || '').toLowerCase() === String(user.value || '').trim().toLowerCase()
  );
  if (!matched) {
    error.value = { summary: t('v7run.importFailed'), message: t('v7run.selectConfiguredUser') };
    return;
  }
  const live = { ...((parsed.live as Record<string, unknown>) ?? {}) };
  live.user = matched.name;
  const withUser = { ...parsed, live };

  try {
    // prepareConfigForRunEditor (:1352-1361): POST /draft then read it back
    const created = await fetchJson('/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: withUser }),
    });
    if (!created.draft_id) throw new Error(t('v7run.draftCreationFailed'));
    const draft = await fetchJson('/draft/' + encodeURIComponent(String(created.draft_id)), {
      headers: { 'Content-Type': 'application/json' },
    });
    const prepared = (draft.config ?? {}) as Record<string, unknown>;
    if (!page.isNew.value) {
      const pbgui = { ...((prepared.pbgui as Record<string, unknown>) ?? {}) };
      if (page.isV8) {
        pbgui.version = parseInt(page.state.version, 10) || 0;
      } else {
        const next = await fetchJson('/instances/' + encodeURIComponent(page.instanceName.value) + '/next-version', {
          headers: { 'Content-Type': 'application/json' },
        });
        pbgui.version = parseInt(String(next.next_version ?? 0), 10) || 1;
      }
      prepared.pbgui = pbgui;
    }
    page.applyImportedConfig(prepared, draft.param_status as Record<string, Record<string, string>>);
    close();
    page.notify(t('v7run.configImported'), 'ok');
  } catch (e) {
    error.value = {
      summary: t('v7run.importFailed'),
      message: e instanceof Error ? e.message : t('v7run.unableToPrepareImport'),
    };
  }
}

defineExpose({ show, jsonEl });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay open" id="import-modal" @mousedown.self="close">
      <div class="modal-box">
        <h3>{{ t('v7run.pasteConfig') }}</h3>
        <div class="form-group">
          <label>{{ t('v7run.user') }}</label>
          <div class="user-combobox">
            <input
              id="import-user"
              ref="userEl"
              v-model="user"
              type="text"
              :placeholder="t('v7run.typeToSearchUsers')"
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="optionsOpen ? 'true' : 'false'"
              aria-controls="import-user-options"
              @input="activeIndex = -1"
              @click="optionsOpen = true"
              @blur="closeSoon()"
              @keydown.down.prevent="optionsOpen = true; move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="matches[activeIndex] ? pick(matches[activeIndex]!.name) : undefined"
              @keydown.esc.prevent="optionsOpen = false"
            />
            <button
              class="user-combobox-toggle"
              id="import-user-toggle"
              type="button"
              :aria-label="t('v7run.showConfiguredUsers')"
              aria-controls="import-user-options"
              @mousedown.prevent
              @click="optionsOpen ? (optionsOpen = false) : ((optionsOpen = true), userEl?.focus())"
            >&#x25BE;</button>
            <div
              v-if="optionsOpen"
              class="user-combobox-options"
              id="import-user-options"
              role="listbox"
              @mousedown.prevent
            >
              <div v-if="!matches.length" class="user-combobox-empty">{{ t('v7run.noMatchingUsers') }}</div>
              <button
                v-for="(match, index) in matches"
                :key="match.name"
                type="button"
                class="user-combobox-option"
                role="option"
                :class="{ active: index === activeIndex }"
                :aria-selected="index === activeIndex ? 'true' : 'false'"
                @click="pick(match.name)"
              >{{ match.name }}</button>
            </div>
          </div>
        </div>
        <textarea
          id="import-json"
          ref="jsonEl"
          v-model="json"
          class="json-editor"
          :class="{ 'json-invalid': !!validation.error }"
          rows="18"
          :placeholder="t('v7run.pasteFullJsonConfig')"
        ></textarea>
        <div v-if="error || validation.error" class="field-status field-status-inline error" aria-live="polite">
          <div class="field-status-main">{{ error?.summary ?? t('v7run.fieldIsInvalid', { label: t('v7run.importJson') }) }}</div>
          <div v-if="error?.message || validation.error?.message" class="field-status-meta">{{ error?.message ?? validation.error?.message }}</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ok" @click="doImport()">{{ t('common.ok') }}</button>
          <button class="btn btn-cancel" @click="close()">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
