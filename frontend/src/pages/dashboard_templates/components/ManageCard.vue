<script setup lang="ts">
/**
 * Legacy Card 2 (dashboard_templates.html): template multi-select +
 * rename/delete management.
 *
 * - Rename/delete buttons follow updateTplButtons: rename iff exactly one
 *   template selected, delete iff at least one; the rename row hides when
 *   the selection stops being exactly one.
 * - Delete: confirm via PBGuiDialogs (label “name” for one, nTemplates
 *   otherwise), then sequential DELETEs — legacy ignored every response
 *   (including failures) and refreshed the local list regardless.
 * - Rename: PATCH {new_name}; ok → map+sort in the parent, keep [newName]
 *   selected (legacy render()); empty/unchanged → just hide the row.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { PhCheck, PhNotePencil, PhTrash, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { dialogsConfirm } from '../dialogs';
import { templatesUrl } from '../config';
import type { StatusResponse } from '../types';
import MultiSelect from './MultiSelect.vue';

const props = defineProps<{ templates: string[] }>();

const emit = defineEmits<{
  deleted: [names: string[]];
  renamed: [oldName: string, newName: string];
}>();

const { t } = useI18n();

const selTpl = ref<string[]>([]);
const renameOpen = ref(false);
const renameValue = ref('');
const renameInput = ref<HTMLInputElement | null>(null);
const msg = ref('');
const msgType = ref<'ok' | 'err' | ''>('');
let msgTimer: number | undefined;

/** Legacy updateTplButtons + rename-wrap visibility rule. */
const renameVisible = computed(() => selTpl.value.length === 1);
const delVisible = computed(() => selTpl.value.length > 0);
const renameRowVisible = computed(() => renameOpen.value && selTpl.value.length === 1);

/**
 * Legacy updateTplButtons forced the rename row closed whenever the selection
 * left exactly one template, and render() (after delete) rebuilt it hidden —
 * the row only ever opens via the 📝 click. Resetting here keeps the row
 * closed across selection changes and deletes instead of leaking open state.
 */
watch(selTpl, (next) => {
  if (next.length !== 1) {
    renameOpen.value = false;
    renameValue.value = '';
  }
});

/** Legacy showMsg: set text + ok/err class, auto-clear after 3500 ms. */
function showMsg(text: string, type: 'ok' | 'err'): void {
  msg.value = text;
  msgType.value = type;
  window.clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => {
    msg.value = '';
    msgType.value = '';
  }, 3500);
}

async function deleteTemplates(): Promise<void> {
  if (!selTpl.value.length) return;
  const label =
    selTpl.value.length === 1
      ? `“${selTpl.value[0] ?? ''}”`
      : t('dash.nTemplates', { count: selTpl.value.length });
  const confirmed = await dialogsConfirm({
    title: t('dash.deleteTemplates'),
    message: t('dash.deleteTemplatesConfirm', { label }),
    confirmText: t('common.delete'),
  });
  if (!confirmed) return;
  const toDelete = [...selTpl.value];
  // Legacy deleteNext chain: sequential DELETEs, responses ignored.
  for (const name of [...toDelete]) {
    try {
      await apiFetch<StatusResponse>(`${templatesUrl()}/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
    } catch {
      /* legacy ignored failures */
    }
  }
  selTpl.value = [];
  emit('deleted', toDelete);
}

function openRename(): void {
  if (selTpl.value.length !== 1) return;
  renameValue.value = selTpl.value[0] ?? '';
  renameOpen.value = true;
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
}

function cancelRename(): void {
  renameOpen.value = false;
}

async function confirmRename(): Promise<void> {
  const oldName = selTpl.value.length === 1 ? (selTpl.value[0] ?? '') : '';
  const newName = renameValue.value.trim();
  if (!oldName || !newName || newName === oldName) {
    renameOpen.value = false;
    return;
  }
  try {
    const res = await apiFetch<StatusResponse>(`${templatesUrl()}/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      body: JSON.stringify({ new_name: newName }),
    });
    if (res.status === 'ok') {
      renameOpen.value = false;
      selTpl.value = [newName];
      emit('renamed', oldName, newName);
    } else {
      showMsg(res.detail ? serverMsg(res.detail) : t('dash.errorRenamingTemplate'), 'err');
    }
  } catch (error) {
    if (error instanceof ApiError) showMsg(serverMsg(error.detail), 'err');
    else showMsg(t('dash.networkError'), 'err');
  }
}

onUnmounted(() => window.clearTimeout(msgTimer));
</script>

<template>
  <div class="tpl-card">
    <div class="tpl-card-title">{{ t('dash.myTemplates') }}</div>
    <div v-if="templates.length === 0" class="tpl-empty">{{ t('dash.noTemplatesSaved') }}</div>
    <template v-else>
      <div class="tpl-mgmt-row">
        <div id="tpl-manage-msel" style="flex:1">
          <MultiSelect uid="msel1" :options="templates" v-model:selected="selTpl" />
        </div>
        <button
          v-show="renameVisible"
          id="btn-rename-tpl"
          class="btn pbgui-action"
          :title="t('dash.rename')"
          :aria-label="t('dash.rename')"
          @click="openRename"
        ><PbIcon :icon="PhNotePencil" /></button>
        <button
          v-show="delVisible"
          id="btn-del-tpl"
          class="btn pbgui-action danger"
          :title="t('common.delete')"
          :aria-label="t('common.delete')"
          @click="deleteTemplates"
        ><PbIcon :icon="PhTrash" /></button>
      </div>
      <div id="rename-wrap" v-show="renameRowVisible" style="margin-top:0.5rem">
        <div class="input-row">
          <input
            ref="renameInput"
            id="rename-input"
            v-model="renameValue"
            class="tpl-input"
            type="text"
            autocomplete="off"
          >
          <button id="btn-rename-confirm" class="btn pbgui-action primary" @click="confirmRename">
            <PbIcon :icon="PhCheck" /> {{ t('dash.rename') }}
          </button>
          <button id="btn-rename-cancel" class="btn pbgui-action" :title="t('common.cancel')" :aria-label="t('common.cancel')" @click="cancelRename"><PbIcon :icon="PhX" /></button>
        </div>
      </div>
    </template>
    <div id="manage-msg" class="msg" :class="msgType">{{ msg }}</div>
  </div>
</template>
