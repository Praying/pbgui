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

/** var(--success) saved / var(--warning) dirty (:1242-1247). */
const retentionColor = computed(() => (props.retention === props.retentionSaved ? 'var(--success)' : 'var(--warning)'));

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
  <div ref="panelEl" class="backup-panel fixed top-1/2 left-1/2 z-[10001] flex h-[min(580px,88vh)] w-[min(660px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border-default bg-panel shadow-[0_20px_70px_rgba(5,8,14,0.8)]" id="backup-panel">
    <div ref="dragEl" class="absolute top-0 left-0 right-10 z-[2] h-11 cursor-move" id="backup-drag" @mousedown="bindDragMove"></div>
    <div class="relative flex shrink-0 items-center justify-between rounded-t-lg border-b border-border-default bg-elevated px-3 py-2">
      <h3 class="m-0 text-lg">{{ t('v7run.instanceBackups') }}</h3>
      <button class="relative z-[3] cursor-pointer rounded-sm border-none bg-transparent px-1.5 py-0.5 text-lg leading-none text-secondary hover:bg-white/6 hover:text-primary" id="backup-close" @click="$emit('close')">&#x2715;</button>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-default px-3 py-1.5 text-sm">
      <label class="whitespace-nowrap text-secondary">{{ t('v7run.retentionLimit') }} </label>
      <div class="num-stepper flex items-center">
        <button type="button" class="flex h-[26px] w-6 shrink-0 cursor-pointer select-none items-center justify-center border border-border-default bg-elevated p-0 text-sm leading-none text-primary hover:border-accent hover:bg-accent hover:text-accent-contrast" id="ret-minus" @click="$emit('step', -1)">&#x2212;</button>
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
        <button type="button" class="flex h-[26px] w-6 shrink-0 cursor-pointer select-none items-center justify-center border border-border-default bg-elevated p-0 text-sm leading-none text-primary hover:border-accent hover:bg-accent hover:text-accent-contrast" id="ret-plus" @click="$emit('step', 1)">+</button>
      </div>
      <button id="backup-retention-save" class="flex h-[26px] cursor-pointer items-center rounded-sm border border-border-default bg-transparent px-2 text-sm text-secondary hover:bg-success/15 hover:text-success" :title="t('v7run.saveRetentionLimit')" @click="$emit('saveRetention')">&#xD83D;&#xDCBE;</button>
      <span id="backup-retention-msg" v-if="retentionMsg" :style="{ marginLeft: '6px', fontSize: '0.85em', color: retentionMsg.color }">
        {{ retentionMsg.text }}
      </span>
      <div class="ml-auto w-full min-w-[220px] max-w-[320px]">
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
    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="loadError" id="backup-content" class="p-3 text-center text-sm text-secondary">{{ loadError }}</div>
      <div v-else-if="loading && !groups.length" id="backup-content" class="p-3 text-center text-sm text-secondary">{{ t('v7run.loading') }}</div>
      <div v-else-if="!groups.length" id="backup-content" class="p-3 text-center text-sm text-secondary">
        {{ filterText ? t('v7run.noBackupsMatchFilter') : t('v7run.noBackupsAvailable') }}
      </div>
      <div v-else id="backup-content" class="text-left">
        <div v-for="group in groups" :key="group.backup.name" class="mb-2 border-b border-border-default pb-2 last:border-b-0 last:mb-0">
          <div class="mb-1 flex items-center gap-2 text-base font-bold text-primary">
            {{ group.backup.name }}
            <span v-if="group.backup.currently_exists" class="rounded-[3px] bg-elevated px-1.5 py-px text-xs text-secondary">{{ t('v7run.active') }}</span>
            <span v-if="group.backup.running_on && group.backup.running_on.length" class="rounded-[3px] border border-warning/35 bg-warning/12 px-1.5 py-px text-xs text-warning">
              {{ t('v7run.runningOn', { hosts: group.backup.running_on.join(', ') }) }}
            </span>
          </div>
          <div v-for="item in group.items" :key="item.id" class="my-0.5 flex items-center gap-2 rounded-sm bg-white/3 px-2 py-1 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(5,8,14,0.3)]">
            <span class="min-w-[68px] text-primary tabular-nums">{{ item.id }}</span>
            <span class="flex-1 text-secondary tabular-nums">{{ item.created_at || '-' }}</span>
            <button
              v-if="group.backup.can_restore !== false"
              class="cursor-pointer rounded-[3px] border border-success bg-success px-2 py-0.5 text-xs font-semibold text-[#f2f5fb] hover:opacity-85"
              :data-restore-name="group.backup.name"
              :data-restore-ts="item.id"
              @click="$emit('restore', group.backup.name, item.id)"
            >
              {{ t('v7run.loadInEditor') }}
            </button>
            <button
              class="cursor-pointer rounded-[3px] border border-danger bg-transparent px-2 py-0.5 text-xs font-semibold text-danger hover:bg-danger hover:text-[#f2f5fb]"
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
    <div ref="gripEl" class="absolute right-0 bottom-0 z-[4] h-4 w-4 cursor-nwse-resize rounded-br-lg bg-[linear-gradient(135deg,transparent_30%,#a3adc2_30%_36%,transparent_36%_56%,#a3adc2_56%_62%,transparent_62%)] opacity-50 hover:opacity-100" id="backup-grip" @mousedown="bindGripResize"></div>
  </div>
</template>

<style scoped>
/* Number stepper ported from styles/v7-run.css — hidden native spinners
   (::-webkit-* pseudo-elements) and joined first/last radii cannot be
   expressed as utilities. */
.num-stepper input {
  width: 56px;
  text-align: center;
  border-radius: 0 !important;
  background: var(--bg-panel);
  color: var(--success);
  border: 1px solid var(--border-default);
  padding: 2px 4px;
  font-size: var(--fs-sm);
  height: 26px;
  -moz-appearance: textfield;
}

.num-stepper input::-webkit-inner-spin-button,
.num-stepper input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.stepper-btn:first-child { border-radius: 4px 0 0 4px; border-right: none; }
.stepper-btn:last-child { border-radius: 0 4px 4px 0; border-left: none; }
</style>
