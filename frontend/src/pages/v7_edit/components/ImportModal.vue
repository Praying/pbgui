<script setup lang="ts">
/**
 * Import-config modal — v7_edit.html:1172-1191 markup, the user combobox
 * (:3115-3203) and doImport (:3228-3280): paste a full config, pick a
 * configured user, POST /draft to normalize, then populate the editor
 * (keeping the current version for v8 / next-version for v7).
 */
import { computed, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
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

/** Combobox option state → full utility colour set (the former
 *  .user-combobox-option/.active rules; hover is handled by the static
 *  hover: utilities on the button). */
function userOptionClass(active: boolean): string {
  return active ? 'bg-accent/14 text-[#f2f5fb]' : 'text-primary';
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop" id="import-modal" @mousedown.self="close">
      <div class="flex w-[90%] max-w-[800px] max-h-[80vh] flex-col gap-3 rounded-lg border border-border-default bg-panel p-5">
        <h3 class="text-lg">{{ t('v7run.pasteConfig') }}</h3>
        <div class="form-group">
          <label>{{ t('v7run.user') }}</label>
          <div class="user-combobox relative">
            <!-- the un-layered .user-combobox input rule (padding-right for the
                 toggle) stays in App.vue — a utility cannot outrank it next to
                 the un-layered .form-group input padding shorthand. -->
            <Input
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
            <Button
              class="absolute top-0 right-0 z-[2] w-8 rounded-l-none border-l-0 px-0"
              id="import-user-toggle"
              type="button"
              :aria-label="t('v7run.showConfiguredUsers')"
              aria-controls="import-user-options"
              @mousedown.prevent
              @click="optionsOpen ? (optionsOpen = false) : ((optionsOpen = true), userEl?.focus())"
            >&#x25BE;</Button>
            <div
              v-if="optionsOpen"
              class="absolute top-[calc(100%+4px)] left-0 right-0 z-30 max-h-[220px] overflow-y-auto rounded-md border border-border-default bg-panel p-1 shadow-[0_12px_30px_rgba(5,8,14,0.48)]"
              id="import-user-options"
              role="listbox"
              @mousedown.prevent
            >
              <div v-if="!matches.length" class="px-[9px] py-2 text-xs text-secondary">{{ t('v7run.noMatchingUsers') }}</div>
              <!-- ui-migration: blocked — listbox option rows of the custom
                   user combobox (full-bleed, left-aligned, role="option");
                   ui/Button chrome cannot express option rows. -->
              <button
                v-for="(match, index) in matches"
                :key="match.name"
                type="button"
                class="block w-full cursor-pointer rounded-sm border-0 bg-transparent px-[7px] py-[9px] text-left hover:bg-accent/14 hover:text-[#f2f5fb]"
                role="option"
                :class="userOptionClass(index === activeIndex)"
                :aria-selected="index === activeIndex ? 'true' : 'false'"
                @click="pick(match.name)"
              >{{ match.name }}</button>
            </div>
          </div>
        </div>
        <Textarea
          id="import-json"
          ref="jsonEl"
          v-model="json"
          class="json-editor"
          :class="{ 'json-invalid': !!validation.error }"
          rows="18"
          :placeholder="t('v7run.pasteFullJsonConfig')"
        />
        <div v-if="error || validation.error" class="mt-1 block rounded-sm border border-danger/35 bg-danger-deep/35 px-2.5 py-1.5 text-sm leading-[1.35] text-danger" aria-live="polite">
          <div class="font-semibold">{{ error?.summary ?? t('v7run.fieldIsInvalid', { label: t('v7run.importJson') }) }}</div>
          <div v-if="error?.message || validation.error?.message" class="mt-0.5 text-danger-soft">{{ error?.message ?? validation.error?.message }}</div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="success" type="button" @click="doImport()">{{ t('common.ok') }}</Button>
          <Button type="button" @click="close()">{{ t('common.cancel') }}</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
