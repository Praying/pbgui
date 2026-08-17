<script setup lang="ts">
/*
 * Backup diff modal (:1058-1076 markup, :3270-3420): unified / side-by-side
 * rendering of the redacted structural diff with CTX=3 context collapsing.
 * Row computation lives in lib/diffRows (pure, unit-tested).
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { diffAllEqual, sideDiffRows, unifiedDiffRows } from '../lib/diffRows';
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
</script>

<template>
  <div id="diffModal" class="diff-modal" v-show="data">
    <div class="diff-modal-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="btn btn-sm btn-secondary" @click="emit('close')">&#8592; {{ t('misc.apikeys.back') }}</button>
        <span id="diffTitle" style="font-size:var(--fs-sm); color:#94a3b8; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60vw;">
          {{ data ? backupLabel(data.filename1) + '  →  ' + backupLabel(data.filename2) : '' }}
        </span>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-sm btn-secondary" id="btnDiffUnified" :class="{ active: mode === 'unified' }" @click="mode = 'unified'">{{ t('misc.apikeys.unified') }}</button>
        <button class="btn btn-sm btn-secondary" id="btnDiffSide" :class="{ active: mode === 'side' }" @click="mode = 'side'">{{ t('misc.apikeys.sideBySide') }}</button>
      </div>
    </div>
    <div class="diff-legend">
      <span style="color:#86efac;">&#9608; {{ t('misc.apikeys.added') }}</span>
      <span style="color:#fca5a5;">&#9608; {{ t('misc.apikeys.removed') }}</span>
      <span style="color:#94a3b8;">&#9608; {{ t('misc.apikeys.unchanged') }}</span>
    </div>
    <div id="diffContent" style="flex:1; overflow:auto;">
      <div v-if="identical" style="text-align:center;padding:40px 20px;color:#26a69a;font-size:var(--fs-md);">
        <span style="font-size:var(--fs-xl);">&#10003;</span><br />
        <strong>{{ t('misc.apikeys.filesIdentical') }}</strong><br />
        <span style="font-size:var(--fs-sm);color:#94a3b8;margin-top:6px;display:block;">
          {{ data ? t('misc.apikeys.identicalContent', { lines: data.lines1.length }) : '' }}
        </span>
      </div>
      <table v-else-if="mode === 'unified'" class="diff-table">
        <tbody>
          <tr v-for="(row, i) in unifiedRows" :key="i" :class="row.kind === 'sep' ? 'diff-sep' : row.kind === 'add' ? 'diff-add' : row.kind === 'del' ? 'diff-del' : 'diff-ctx'">
            <template v-if="row.kind === 'sep'">
              <td colspan="4">&#8943; {{ t('misc.apikeys.identicalLines', { count: row.count }) }} &#8943;</td>
            </template>
            <template v-else>
              <td class="ln">{{ row.ln1 ?? '' }}</td>
              <td class="ln">{{ row.ln2 ?? '' }}</td>
              <td class="diff-sign">{{ row.sign }}</td>
              <td>{{ row.text }}</td>
            </template>
          </tr>
        </tbody>
      </table>
      <div v-else class="diff-side-wrap">
        <div class="diff-side-col">
          <div class="diff-side-hdr">&#8592; {{ data ? data.filename1 : '' }}</div>
          <table class="diff-table">
            <tbody>
              <tr v-for="(row, i) in sideCols.left" :key="i" :class="row.kind === 'sep' ? 'diff-sep' : 'diff-' + row.kind">
                <template v-if="row.kind === 'sep'">
                  <td colspan="2">&#8943; {{ t('misc.apikeys.lines', { count: row.count }) }} &#8943;</td>
                </template>
                <template v-else>
                  <td class="ln">{{ row.ln1 ?? '' }}</td>
                  <td>{{ row.text }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="diff-side-col">
          <div class="diff-side-hdr">&#8594; {{ data ? data.filename2 : '' }}</div>
          <table class="diff-table">
            <tbody>
              <tr v-for="(row, i) in sideCols.right" :key="i" :class="row.kind === 'sep' ? 'diff-sep' : 'diff-' + row.kind">
                <template v-if="row.kind === 'sep'">
                  <td colspan="2">&#8943; {{ t('misc.apikeys.lines', { count: row.count }) }} &#8943;</td>
                </template>
                <template v-else>
                  <td class="ln">{{ row.ln1 ?? '' }}</td>
                  <td>{{ row.text }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
