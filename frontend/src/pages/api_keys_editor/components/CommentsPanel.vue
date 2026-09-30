<script setup lang="ts">
/*
 * Comments panel (:869-900 markup, logic :2326-2429): list _comment_* fields
 * from api-keys.json with inline editing, add/update/delete via the
 * /comments/list endpoints.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
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
    <div class="mb-3 flex items-center gap-3 border-b border-border-subtle pb-3">
      <BackButton @back="emit('back')" />
      <h3 class="m-0 flex-1 text-lg tracking-tight text-primary">{{ t('misc.apikeys.commentFields') }}</h3>
      <Button type="button" variant="primary" size="sm" id="btnCommentAdd" @click="showAdd">+ {{ t('misc.apikeys.add') }}</Button>
    </div>
    <div id="addCommentForm" v-show="addVisible" class="mb-3 rounded-md border border-border-default bg-page p-3">
      <div class="flex items-end gap-2">
        <div class="form-group flex flex-1 flex-col gap-1.5">
          <Label for="newCommentKey">{{ t('misc.apikeys.keyWithoutCommentPrefix') }}</Label>
          <Input type="text" id="newCommentKey" v-model="newKey" placeholder="e.g. notes" />
        </div>
        <div class="form-group flex flex-[2] flex-col gap-1.5">
          <Label for="newCommentValue">{{ t('misc.apikeys.value') }}</Label>
          <Input type="text" id="newCommentValue" v-model="newValue" placeholder="Comment text" />
        </div>
        <Button type="button" variant="primary" size="sm" id="btnCommentSave" @click="create">{{ t('common.save') }}</Button>
        <Button type="button" variant="secondary" size="sm" @click="addVisible = false">{{ t('common.cancel') }}</Button>
      </div>
    </div>
    <table class="hl-expiry-table w-full overflow-hidden rounded-md border border-border-subtle border-separate border-spacing-0" id="commentsTable">
      <thead>
        <tr>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.key') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.value') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.actions') }}</th>
        </tr>
      </thead>
      <tbody id="commentsBody">
        <tr v-if="state === 'loading'">
          <td colspan="3" class="border-b border-border-subtle px-2.5 py-2 text-center text-sm text-secondary">{{ t('common.loading') }}</td>
        </tr>
        <tr v-else-if="state === 'empty'">
          <td colspan="3" class="border-b border-border-subtle px-2.5 py-2 text-center text-sm text-secondary">{{ t('misc.apikeys.noCommentFields') }}</td>
        </tr>
        <tr v-else-if="state === 'error'">
          <td colspan="3" class="border-b border-border-subtle px-2.5 py-2 text-sm text-danger">{{ errorText }}</td>
        </tr>
        <tr v-else v-for="c in comments" :key="c.key">
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm"><code>{{ c.key }}</code></td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">
            <Input
              type="text"
              class="comment-val"
              v-model="values[c.key]"
            />
          </td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">
            <Button type="button" variant="primary" size="sm" @click="update(c.key)">{{ t('common.save') }}</Button>
            <Button type="button" variant="danger" size="sm" @click="remove(c.key)">{{ t('common.delete') }}</Button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
