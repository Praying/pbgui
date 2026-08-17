<script setup lang="ts">
/**
 * The draggable backup panel (v7_run.html:283-399 CSS, :1122-1213 markup
 * and handlers): header drag to move (:1159-1180), the resize grip with the
 * legacy center-preserving math and 420x260 minimum (:1182-1207), the
 * retention stepper with wheel support and the green/orange dirty color
 * (:1215-1271), the filter input, and the backup list with the
 * active/running badges (:1309-1331). The list body keeps the legacy
 * #backup-content ids and classes.
 */
import { computed, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BackupGroup } from '../composables/useBackups';

const props = defineProps<{
  retention: number;
  retentionSaved: number;
  retentionMsg: { text: string; color: string } | null;
  filterText: string;
  groups: BackupGroup[];
  loading: boolean;
  loadError: string;
}>();

const emit = defineEmits<{
  close: [];
  step: [dir: number];
  saveRetention: [];
  'update:retention': [value: number];
  'update:filterText': [value: string];
  restore: [name: string, ts: string];
  deleteBackup: [name: string, ts: string];
}>();

const { t } = useI18n();

const panel = useTemplateRef<HTMLElement>('panelEl');

/** '#4caf50' saved / '#ff9800' dirty (:1242-1247). */
const retentionColor = computed(() => (props.retention === props.retentionSaved ? '#4caf50' : '#ff9800'));

/* ── drag to move (:1159-1180) ── */

function bindDragMove(event: MouseEvent): void {
  event.preventDefault();
  const node = panel.value;
  if (!node) return;
  const rect = node.getBoundingClientRect();
  node.style.transform = 'none';
  node.style.left = rect.left + 'px';
  node.style.top = rect.top + 'px';
  const startX = event.clientX;
  const startY = event.clientY;
  const boxL = rect.left;
  const boxT = rect.top;
  const onMove = (ev: MouseEvent): void => {
    node.style.left = boxL + ev.clientX - startX + 'px';
    node.style.top = boxT + ev.clientY - startY + 'px';
  };
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── resize grip (:1182-1207) ── */

function bindGripResize(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const node = panel.value;
  if (!node) return;
  const rect = node.getBoundingClientRect();
  node.style.transform = 'none';
  node.style.left = rect.left + 'px';
  node.style.top = rect.top + 'px';
  const sX = event.clientX;
  const sY = event.clientY;
  const sW = rect.width;
  const sH = rect.height;
  const sL = rect.left;
  const sT = rect.top;
  const onMove = (ev: MouseEvent): void => {
    const nW = Math.max(420, sW + ev.clientX - sX);
    const nH = Math.max(260, sH + ev.clientY - sY);
    node.style.width = nW + 'px';
    node.style.height = nH + 'px';
    node.style.left = sL - (nW - sW) / 2 + 'px';
    node.style.top = sT - (nH - sH) / 2 + 'px';
  };
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── retention wheel (:1155-1157) — scroll up increases ── */

function onRetentionWheel(event: WheelEvent): void {
  event.preventDefault();
  emit('step', event.deltaY < 0 ? 1 : -1);
}
</script>

<template>
  <div ref="panelEl" class="backup-panel visible" id="backup-panel">
    <div ref="dragEl" class="backup-panel-drag" id="backup-drag" @mousedown="bindDragMove"></div>
    <div class="backup-panel-header">
      <h3>{{ t('v7run.instanceBackups') }}</h3>
      <button class="backup-panel-close" id="backup-close" @click="$emit('close')">&#x2715;</button>
    </div>
    <div class="backup-settings-row">
      <label>{{ t('v7run.retentionLimit') }} </label>
      <div class="num-stepper">
        <button type="button" class="stepper-btn" id="ret-minus" @click="$emit('step', -1)">&#x2212;</button>
        <input
          ref="retentionInput"
          type="number"
          id="backup-retention"
          min="1"
          step="1"
          :value="retention"
          :style="{ color: retentionColor }"
          @input="$emit('update:retention', Number(($event.target as HTMLInputElement).value))"
          @wheel="onRetentionWheel"
        />
        <button type="button" class="stepper-btn" id="ret-plus" @click="$emit('step', 1)">+</button>
      </div>
      <button id="backup-retention-save" class="btn-save-retention" :title="t('v7run.saveRetentionLimit')" @click="$emit('saveRetention')">&#xD83D;&#xDCBE;</button>
      <span id="backup-retention-msg" v-if="retentionMsg" :style="{ marginLeft: '6px', fontSize: '0.85em', color: retentionMsg.color }">
        {{ retentionMsg.text }}
      </span>
      <div class="backup-filter">
        <input
          type="search"
          id="backup-filter"
          :placeholder="t('v7run.filterInstancesOrBackups')"
          autocomplete="off"
          :value="filterText"
          @input="$emit('update:filterText', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
    <div class="backup-panel-body">
      <div v-if="loadError" id="backup-content" class="backup-empty">{{ loadError }}</div>
      <div v-else-if="loading && !groups.length" id="backup-content" class="backup-empty">{{ t('v7run.loading') }}</div>
      <div v-else-if="!groups.length" id="backup-content" class="backup-empty">
        {{ filterText ? t('v7run.noBackupsMatchFilter') : t('v7run.noBackupsAvailable') }}
      </div>
      <div v-else id="backup-content" class="backup-list">
        <div v-for="group in groups" :key="group.backup.name" class="backup-instance">
          <div class="backup-instance-name">
            {{ group.backup.name }}
            <span v-if="group.backup.currently_exists" class="badge-exists">{{ t('v7run.active') }}</span>
            <span v-if="group.backup.running_on && group.backup.running_on.length" class="badge-running">
              {{ t('v7run.runningOn', { hosts: group.backup.running_on.join(', ') }) }}
            </span>
          </div>
          <div v-for="item in group.items" :key="item.id" class="backup-ts-row">
            <span class="ts">{{ item.id }}</span>
            <span class="created-at">{{ item.created_at || '-' }}</span>
            <button
              v-if="group.backup.can_restore !== false"
              class="btn-restore"
              :data-restore-name="group.backup.name"
              :data-restore-ts="item.id"
              @click="$emit('restore', group.backup.name, item.id)"
            >
              {{ t('v7run.loadInEditor') }}
            </button>
            <button
              class="btn-del-backup"
              :data-del-name="group.backup.name"
              :data-del-ts="item.id"
              @click="$emit('deleteBackup', group.backup.name, item.id)"
            >
              &#x2716;
            </button>
          </div>
        </div>
      </div>
    </div>
    <div ref="gripEl" class="backup-panel-grip" id="backup-grip" @mousedown="bindGripResize"></div>
  </div>
</template>
