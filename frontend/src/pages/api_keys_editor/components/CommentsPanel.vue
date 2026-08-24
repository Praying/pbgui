<script setup lang="ts">
/*
 * Comments panel (:869-900 markup, logic :2326-2429): list _comment_* fields
 * from api-keys.json with inline editing, add/update/delete via the
 * /comments/list endpoints.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import BackButton from './BackButton.vue';
import { pageFetch } from '../lib/pageApi';
import { confirmDialog } from '../lib/dialogs';
import { injectToasts } from '../composables/useToasts';
import type { CommentField } from '../types';

const emit = defineEmits<{ (e: 'back'): void }>();

const { t } = useI18n();
const toasts = injectToasts();

const comments = ref<CommentField[]>([]);
const state = ref<'loading' | 'ready' | 'empty' | 'error'>('loading');
const errorText = ref('');
const values = ref<Record<string, string>>({});
const addVisible = ref(false);
const newKey = ref('');
const newValue = ref('');

async function load(): Promise<void> {
  state.value = 'loading';
  try {
    const data = await pageFetch<CommentField[]>('/comments/list');
    comments.value = data;
    values.value = Object.fromEntries(data.map((c) => [c.key, c.value]));
    state.value = data.length === 0 ? 'empty' : 'ready';
  } catch (e) {
    state.value = 'error';
    errorText.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(load);

function showAdd(): void {
  addVisible.value = true;
  newKey.value = '';
  newValue.value = '';
}

async function create(): Promise<void> {
  const key = newKey.value.trim();
  if (!key) {
    toasts.showToast(t('misc.apikeys.keyRequired'), 'error');
    return;
  }
  try {
    await pageFetch('/comments/list', { method: 'POST', body: JSON.stringify({ key, value: newValue.value }) });
    toasts.showToast(t('misc.apikeys.commentCreated'), 'success');
    addVisible.value = false;
    await load();
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}

async function update(key: string): Promise<void> {
  try {
    await pageFetch('/comments/list/' + encodeURIComponent(key), {
      method: 'PUT',
      body: JSON.stringify({ value: values.value[key] ?? '' }),
    });
    toasts.showToast(t('misc.apikeys.commentUpdated'), 'success');
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}

async function remove(key: string): Promise<void> {
  if (
    !(await confirmDialog({
      title: t('misc.apikeys.deleteCommentTitle'),
      message: t('misc.apikeys.deleteCommentMessage', { key }),
      confirmText: t('common.delete'),
    }))
  )
    return;
  try {
    await pageFetch('/comments/list/' + encodeURIComponent(key), { method: 'DELETE' });
    toasts.showToast(t('misc.apikeys.commentDeleted'), 'success');
    await load();
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}
</script>

<template>
  <div id="commentsPanel" class="hl-expiry-panel mx-auto mb-5 w-[min(100%,1500px)] rounded-lg border border-border-subtle bg-panel p-4 max-[768px]:p-3">
    <div class="border-b border-border-subtle pb-3" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 class="text-lg tracking-tight text-primary" style="margin:0; flex:1;">{{ t('misc.apikeys.commentFields') }}</h3>
      <button class="btn pbgui-btn btn-sm btn-primary" @click="showAdd">+ {{ t('misc.apikeys.add') }}</button>
    </div>
    <div id="addCommentForm" v-show="addVisible" style="margin-bottom:12px; padding:12px; background:var(--bg-page); border-radius:4px; border:1px solid var(--border-default);">
      <div style="display:flex; gap:8px; align-items:flex-end;">
        <div class="form-group flex flex-col gap-1.5" style="flex:1;">
          <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.keyWithoutCommentPrefix') }}</label>
          <input type="text" id="newCommentKey" class="min-h-[34px] px-2.5 py-1.5" v-model="newKey" placeholder="e.g. notes" />
        </div>
        <div class="form-group flex flex-col gap-1.5" style="flex:2;">
          <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.value') }}</label>
          <input type="text" id="newCommentValue" class="min-h-[34px] px-2.5 py-1.5" v-model="newValue" placeholder="Comment text" />
        </div>
        <button class="btn pbgui-btn btn-sm btn-primary" style="margin-bottom:0;" @click="create">{{ t('common.save') }}</button>
        <button class="btn pbgui-btn btn-sm btn-secondary" style="margin-bottom:0;" @click="addVisible = false">{{ t('common.cancel') }}</button>
      </div>
    </div>
    <table class="hl-expiry-table w-full overflow-hidden rounded-md border border-border-subtle border-separate border-spacing-0" id="commentsTable">
      <thead>
        <tr>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.key') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.value') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary" style="width:120px;">{{ t('misc.apikeys.actions') }}</th>
        </tr>
      </thead>
      <tbody id="commentsBody">
        <tr v-if="state === 'loading'">
          <td colspan="3" class="border-b border-border-subtle px-2.5 py-2 text-sm" style="text-align:center;color:var(--text-secondary);">{{ t('common.loading') }}</td>
        </tr>
        <tr v-else-if="state === 'empty'">
          <td colspan="3" class="border-b border-border-subtle px-2.5 py-2 text-sm" style="text-align:center;color:var(--text-secondary);">{{ t('misc.apikeys.noCommentFields') }}</td>
        </tr>
        <tr v-else-if="state === 'error'">
          <td colspan="3" class="border-b border-border-subtle px-2.5 py-2 text-sm" style="color:var(--danger);">{{ errorText }}</td>
        </tr>
        <tr v-else v-for="c in comments" :key="c.key">
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm"><code>{{ c.key }}</code></td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">
            <input
              type="text"
              class="comment-val"
              v-model="values[c.key]"
              style="width:100%;background:var(--bg-page);border:1px solid var(--border-default);border-radius:4px;padding:6px 8px;color:var(--text-primary);font-size:var(--fs-sm);"
            />
          </td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">
            <button class="btn pbgui-btn btn-sm btn-primary" @click="update(c.key)">{{ t('common.save') }}</button>
            <button class="btn pbgui-btn btn-sm btn-danger" @click="remove(c.key)">{{ t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
