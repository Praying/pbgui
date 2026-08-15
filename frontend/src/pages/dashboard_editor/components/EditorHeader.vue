<script setup lang="ts">
/**
 * EditorHeader — the legacy editor header (dashboard_editor.html:460-478):
 *
 *   .hdr-left   name field (trim-on-input + .empty class, editor:2518-2523),
 *               layout picker, #status badge
 *   .hdr-right  widget palette (NOT built in view mode, editor:2690); the
 *               legacy #standalone-toolbar div was permanently empty
 *               (editor:472, 328) — not emitted.
 *
 * Name field behavior (legacy parity): the store keeps the trimmed name, but
 * the input keeps its raw DOM value while the user types — legacy only ever
 * rewrote `hdrName.value` ONCE, after the init config load (editor:2688).
 * App bumps `configRevision` after store.loadConfig so the input re-syncs at
 * exactly that moment. The whole header is hidden in view mode by
 * body.view-mode CSS (editor.css:311) — the class is applied by App.
 */
import { ref, watch } from 'vue';
import { useDashboardStore } from '../stores/dashboardStore';
import { dashT } from '../lib/i18n';
import LayoutPicker from './LayoutPicker.vue';
import PaletteBar from './PaletteBar.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  /** Legacy setStatus msg (App owns the status state). */
  msg: string;
  /** Legacy setStatus cls. */
  cls: string;
  /** Bumped by App after store.loadConfig — triggers the legacy editor:2688
   *  input rewrite. */
  configRevision: number;
}>();

const store = useDashboardStore();
const nameValue = ref(String(store.state.name ?? ''));

function onNameInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value;
  nameValue.value = value; // raw text stays in the DOM (legacy kept this.value)
  store.setName(value); // trims + schedules sync (editor:2519-2522)
}

/* editor:2688 — the init config load rewrites the input value */
watch(
  () => props.configRevision,
  () => {
    nameValue.value = String(store.state.name ?? '');
  }
);
</script>

<template>
  <div class="editor-header">
    <div class="hdr-left">
      <div class="hdr-field">
        <label>{{ dashT('dash.dashboardName', 'Dashboard Name') }}</label>
        <input
          id="hdr-name"
          type="text"
          maxlength="32"
          :value="nameValue"
          :placeholder="dashT('dash.enterName', 'Enter name...')"
          :class="{ empty: !nameValue.trim() }"
          @input="onNameInput"
        >
      </div>
      <div class="hdr-field">
        <LayoutPicker />
      </div>
      <StatusBadge :msg="props.msg" :cls="props.cls" />
    </div>
    <div class="hdr-right">
      <!-- editor:2690 — the palette is only built outside view mode -->
      <PaletteBar v-if="!store.config.viewOnly" />
    </div>
  </div>
</template>
