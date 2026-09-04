<script setup lang="ts">
/*
 * Backup diff modal (:1058-1076 markup, :3270-3420): unified / side-by-side
 * rendering of the redacted structural diff with CTX=3 context collapsing.
 * Row computation lives in lib/diffRows (pure, unit-tested).
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { diffAllEqual, sideDiffRows, unifiedDiffRows, type DiffRow } from '../lib/diffRows';
import type { DiffResponse } from '../types';

const props = defineProps<{ data: DiffResponse | null }>();

const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();

const mode = ref<'unified' | 'side'>('unified');

// Reset to unified on every new diff (legacy openDiffSelected :3285)
watch(
  () => props.data,
  () => {
    mode.value = 'unified';
  }
);

const identical = computed(() => (props.data ? diffAllEqual(props.data.opcodes) : false));

const unifiedRows = computed(() =>
  props.data ? unifiedDiffRows(props.data.lines1, props.data.lines2, props.data.opcodes) : []
);

const sideCols = computed(() =>
  props.data ? sideDiffRows(props.data.lines1, props.data.lines2, props.data.opcodes) : { left: [], right: [] }
);

function backupLabel(fn: string): string {
  if (fn === '_current_pb7') return t('misc.apikeys.currentLivePb7');
  return fn;
}

/* Row kind → complete Tailwind colour set (the former .diff-add/.diff-del/
   .diff-ctx/.diff-empty tints in styles/api_keys_editor.css). .diff-sep rows
   carry their utilities on the td instead; the class names remain as anchors
   for the parity-test selectors. */
function rowClass(kind: DiffRow['kind']): string {
  switch (kind) {
    case 'sep': return 'diff-sep';
    case 'add': return 'diff-add bg-success/13 text-success-soft';
    case 'del': return 'diff-del bg-danger/13 text-danger-soft';
    case 'empty': return 'diff-empty bg-card';
    default: return 'diff-ctx text-secondary';
  }
}
</script>

<template>
  <div id="diffModal" class="diff-modal fixed inset-0 z-[calc(var(--z-modal)-1)] flex flex-col overflow-hidden bg-page" v-show="data">
    <div class="diff-modal-header flex shrink-0 items-center justify-between border-b border-border-subtle bg-panel px-4 py-2.5">
      <div style="display:flex; align-items:center; gap:12px;">
        <Button type="button" variant="secondary" size="sm" @click="emit('close')">&#8592; {{ t('misc.apikeys.back') }}</Button>
        <span id="diffTitle" style="font-size:var(--fs-sm); color:var(--text-secondary); font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60vw;">
          {{ data ? backupLabel(data.filename1) + '  →  ' + backupLabel(data.filename2) : '' }}
        </span>
      </div>
      <div style="display:flex; gap:6px;">
        <Button type="button" :variant="mode === 'unified' ? 'info' : 'secondary'" size="sm" id="btnDiffUnified" @click="mode = 'unified'">{{ t('misc.apikeys.unified') }}</Button>
        <Button type="button" :variant="mode === 'side' ? 'info' : 'secondary'" size="sm" id="btnDiffSide" @click="mode = 'side'">{{ t('misc.apikeys.sideBySide') }}</Button>
      </div>
    </div>
    <div class="diff-legend flex shrink-0 gap-3 border-b border-border-subtle bg-card px-3.5 py-1.25 text-xs">
      <span style="color:var(--success-soft);">&#9608; {{ t('misc.apikeys.added') }}</span>
      <span style="color:var(--danger-soft);">&#9608; {{ t('misc.apikeys.removed') }}</span>
      <span style="color:var(--text-secondary);">&#9608; {{ t('misc.apikeys.unchanged') }}</span>
    </div>
    <div id="diffContent" style="flex:1; overflow:auto;">
      <div v-if="identical" style="text-align:center;padding:40px 20px;color:var(--success);font-size:var(--fs-md);">
        <span style="font-size:var(--fs-xl);">&#10003;</span><br />
        <strong>{{ t('misc.apikeys.filesIdentical') }}</strong><br />
        <span style="font-size:var(--fs-sm);color:var(--text-secondary);margin-top:6px;display:block;">
          {{ data ? t('misc.apikeys.identicalContent', { lines: data.lines1.length }) : '' }}
        </span>
      </div>
      <table v-else-if="mode === 'unified'" class="diff-table w-full border-collapse font-mono text-sm whitespace-pre">
        <tbody>
          <tr v-for="(row, i) in unifiedRows" :key="i" :class="rowClass(row.kind)">
            <template v-if="row.kind === 'sep'">
              <td colspan="4" class="bg-elevated px-2 py-0.75 text-center text-muted italic">&#8943; {{ t('misc.apikeys.identicalLines', { count: row.count }) }} &#8943;</td>
            </template>
            <template v-else>
              <td class="ln min-w-[36px] select-none border-r border-border-default py-px pl-2 pr-2.5 text-right align-top text-muted">{{ row.ln1 ?? '' }}</td>
              <td class="ln min-w-[36px] select-none border-r border-border-default py-px pl-2 pr-2.5 text-right align-top text-muted">{{ row.ln2 ?? '' }}</td>
              <td class="diff-sign w-3.5 select-none px-2 py-px text-center align-top">{{ row.sign }}</td>
              <td class="px-2 py-px align-top">{{ row.text }}</td>
            </template>
          </tr>
        </tbody>
      </table>
      <div v-else class="diff-side-wrap grid w-full grid-cols-2">
        <div class="diff-side-col overflow-x-auto border-r border-border-subtle last:border-r-0">
          <div class="diff-side-hdr sticky top-0 truncate border-b border-border-default bg-card px-2.5 py-1.25 font-mono text-xs text-secondary">&#8592; {{ data ? data.filename1 : '' }}</div>
          <table class="diff-table w-full border-collapse font-mono text-sm whitespace-pre">
            <tbody>
              <tr v-for="(row, i) in sideCols.left" :key="i" :class="rowClass(row.kind)">
                <template v-if="row.kind === 'sep'">
                  <td colspan="2" class="bg-elevated px-2 py-0.75 text-center text-muted italic">&#8943; {{ t('misc.apikeys.lines', { count: row.count }) }} &#8943;</td>
                </template>
                <template v-else>
                  <td class="ln min-w-[36px] select-none border-r border-border-default py-px pl-2 pr-2.5 text-right align-top text-muted">{{ row.ln1 ?? '' }}</td>
                  <td class="px-2 py-px align-top">{{ row.text }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="diff-side-col overflow-x-auto border-r border-border-subtle last:border-r-0">
          <div class="diff-side-hdr sticky top-0 truncate border-b border-border-default bg-card px-2.5 py-1.25 font-mono text-xs text-secondary">&#8594; {{ data ? data.filename2 : '' }}</div>
          <table class="diff-table w-full border-collapse font-mono text-sm whitespace-pre">
            <tbody>
              <tr v-for="(row, i) in sideCols.right" :key="i" :class="rowClass(row.kind)">
                <template v-if="row.kind === 'sep'">
                  <td colspan="2" class="bg-elevated px-2 py-0.75 text-center text-muted italic">&#8943; {{ t('misc.apikeys.lines', { count: row.count }) }} &#8943;</td>
                </template>
                <template v-else>
                  <td class="ln min-w-[36px] select-none border-r border-border-default py-px pl-2 pr-2.5 text-right align-top text-muted">{{ row.ln1 ?? '' }}</td>
                  <td class="px-2 py-px align-top">{{ row.text }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
