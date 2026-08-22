<script setup lang="ts">
/*
 * Backups panel (:1018-1031 markup, :3091-3246): backup list with two-file
 * compare selection (click or vertical drag), restore with confirm, and the
 * diff modal (own component). Restore returns to the list and reloads users.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import BackButton from './BackButton.vue';
import DiffModal from './DiffModal.vue';
import { pageFetch } from '../lib/pageApi';
import { confirmDialog } from '../lib/dialogs';
import { injectToasts } from '../composables/useToasts';
import type { BackupEntry, DiffResponse } from '../types';

const emit = defineEmits<{ (e: 'back'): void; (e: 'restored'): void }>();

const { t } = useI18n();
const toasts = injectToasts();

const backups = ref<BackupEntry[]>([]);
const state = ref<'loading' | 'ready' | 'empty' | 'error'>('loading');
const errorText = ref('');
const selected = ref<string[]>([]);
const diffData = ref<DiffResponse | null>(null);
const comparing = ref(false);

interface DragState {
  row: string;
  y: number;
  selecting: boolean;
  mode: 'add' | 'remove';
}
let dragState: DragState | null = null;

async function load(): Promise<void> {
  state.value = 'loading';
  try {
    backups.value = await pageFetch<BackupEntry[]>('/backups');
    selected.value = [];
    state.value = backups.value.length === 0 ? 'empty' : 'ready';
  } catch (e) {
    state.value = 'error';
    errorText.value = serverMsg(e instanceof Error ? e.message : '');
  }
}

onMounted(load);

function toggleSelect(filename: string): void {
  filename = String(filename || '');
  if (!filename) return;
  const idx = selected.value.indexOf(filename);
  if (idx >= 0) {
    selected.value = selected.value.filter((f) => f !== filename);
  } else if (selected.value.length < 2) {
    selected.value = [...selected.value, filename];
  }
}

function applyDragRow(filename: string): void {
  if (!filename || !dragState) return;
  if (dragState.mode === 'remove') {
    selected.value = selected.value.filter((f) => f !== filename);
  } else if (!selected.value.includes(filename) && selected.value.length < 2) {
    selected.value = [...selected.value, filename];
  }
}

function onRowMousedown(event: MouseEvent, filename: string): void {
  if (event.button !== 0) return;
  dragState = {
    row: filename,
    y: event.clientY,
    selecting: false,
    mode: selected.value.includes(filename) ? 'remove' : 'add',
  };
  event.preventDefault();
}

function onDocumentMousemove(event: MouseEvent): void {
  if (!dragState) return;
  if (!dragState.selecting && Math.abs(event.clientY - dragState.y) > 5) {
    dragState.selecting = true;
  }
  if (!dragState.selecting) return;
  const target = event.target as HTMLElement | null;
  const rowEl = target?.closest?.('.backup-row[data-backup-fn]') as HTMLElement | null;
  if (!rowEl) return;
  applyDragRow(dragState.row);
  applyDragRow(rowEl.dataset.backupFn || '');
}

function onDocumentMouseup(): void {
  if (!dragState) return;
  if (!dragState.selecting) toggleSelect(dragState.row);
  dragState = null;
}

function onRowKeydown(event: KeyboardEvent, filename: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleSelect(filename);
}

document.addEventListener('mousemove', onDocumentMousemove);
document.addEventListener('mouseup', onDocumentMouseup);
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocumentMousemove);
  document.removeEventListener('mouseup', onDocumentMouseup);
});

async function restore(filename: string): Promise<void> {
  if (
    !(await confirmDialog({
      title: t('misc.apikeys.restoreBackupTitle'),
      message: t('misc.apikeys.restoreFromBackup', { filename }),
      detail: t('misc.apikeys.restoreBackupDetail'),
      confirmText: t('misc.apikeys.restore'),
    }))
  )
    return;
  try {
    await pageFetch('/backups/restore', { method: 'POST', body: JSON.stringify({ filename }) });
    toasts.showToast(t('misc.apikeys.restoredFrom', { filename }), 'success');
    emit('back');
    emit('restored');
  } catch (e) {
    toasts.showToast(t('misc.apikeys.restoreFailed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}

async function openDiffSelected(): Promise<void> {
  if (selected.value.length !== 2) return;
  comparing.value = true;
  try {
    diffData.value = await pageFetch<DiffResponse>('/backups/diff', {
      method: 'POST',
      body: JSON.stringify({ filename1: selected.value[0], filename2: selected.value[1] }),
    });
  } catch (e) {
    toasts.showToast(t('misc.apikeys.diffFailed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  } finally {
    comparing.value = false;
  }
}
</script>

<template>
  <div id="backupsPanel" class="hl-expiry-panel">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 style="margin:0;">{{ t('misc.apikeys.apiKeyBackups') }}</h3>
    </div>
    <p style="font-size:var(--fs-sm); color:#a29ca6; margin:0 0 12px;" v-html="t('misc.apikeys.backupsDesc')"></p>
    <div id="backupsList">
      <div v-if="state === 'loading'" style="text-align:center;color:#a29ca6;padding:20px;">
        <span class="spinner"></span> {{ t('common.loading') }}
      </div>
      <div v-else-if="state === 'empty'" style="text-align:center;color:#a29ca6;padding:20px;">
        {{ t('misc.apikeys.noBackupsFound') }}
      </div>
      <div v-else-if="state === 'error'" style="color:#ef4444;padding:20px;">{{ errorText }}</div>
      <template v-else>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:12px;">
          <span style="font-size:var(--fs-sm); color:#a29ca6;">{{ t('misc.apikeys.selectTwoToCompare') }}</span>
          <button
            class="btn pbgui-btn btn-sm btn-secondary"
            id="btnDiffSelected"
            :disabled="selected.length !== 2"
            :style="{ opacity: selected.length === 2 ? '1' : '0.4' }"
            @click="openDiffSelected"
          >
            <span v-if="comparing" class="spinner"></span>&#9654; {{ t('misc.apikeys.compareSelected') }}
          </button>
        </div>
        <table class="hl-expiry-table backup-compare-table">
          <thead>
            <tr>
              <th>{{ t('misc.apikeys.file') }}</th>
              <th>{{ t('misc.apikeys.dateTime') }}</th>
              <th>{{ t('misc.apikeys.target') }}</th>
              <th>{{ t('misc.apikeys.size') }}</th>
              <th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in backups"
              :key="b.filename"
              class="backup-row"
              :class="{ selected: selected.includes(b.filename) }"
              :data-backup-fn="b.filename"
              tabindex="0"
              :aria-selected="selected.includes(b.filename) ? 'true' : 'false'"
              style="cursor:pointer;"
              @mousedown="onRowMousedown($event, b.filename)"
              @keydown="onRowKeydown($event, b.filename)"
            >
              <td style="font-size:var(--fs-xs);font-family:monospace;color:#a29ca6;word-break:break-all;">{{ b.filename }}</td>
              <td>{{ b.ts.replace('T', ' ') }}</td>
              <td><span class="badge-exchange">{{ b.target }}</span></td>
              <td>{{ b.size_kb }} KB</td>
              <td>
                <button class="btn pbgui-btn btn-sm btn-warning backup-restore-btn" type="button" @click.stop="restore(b.filename)">
                  {{ t('misc.apikeys.restore') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
    <DiffModal :data="diffData" @close="diffData = null" />
  </div>
</template>
