<script setup lang="ts">
/**
 * PositionsConfigPreviewModal — port of openConfigPreviewModal
 * (dashboard_render.js:2394-2451): the dry-run config preview overlay with
 * the note, the pretty-printed JSON and a Close action. Geometry from
 * previewModalGeometry (legacy 2402-2407 viewport math).
 */
import { computed } from 'vue';
import { dashT } from '../../lib/i18n';
import { previewModalGeometry } from '../../lib/manageLogic';

const props = defineProps<{
  title: string;
  config: unknown;
}>();

const emit = defineEmits<{ close: [] }>();

const geometry = computed(() => previewModalGeometry(window.innerWidth, window.innerHeight));

const style = computed(() => ({
  width: geometry.value.width + 'px',
  height: geometry.value.height + 'px',
  left: geometry.value.left + 'px',
  top: geometry.value.top + 'px',
}));

/* render.js:2430 — JSON.stringify(config || {}, null, 2) */
const configText = computed<string>(() => JSON.stringify(props.config ?? {}, null, 2));
</script>

<template>
  <Teleport to="body">
    <div class="dp-modal-ovl" style="z-index: 30001">
      <div class="dp-preview-modal" :style="style">
        <div class="dp-modal-head">
          <div class="dp-modal-title">{{ title }}</div>
          <button type="button" class="dp-modal-close" @click="emit('close')">&#x2715;</button>
        </div>
        <div class="dp-preview-body">
          <div class="dp-status-msg ok">
            {{ dashT('dash.previewOnly', 'Preview only. No config was saved and no SSH sync was started.') }}
          </div>
          <pre class="dp-preview">{{ configText }}</pre>
          <div class="dp-modal-actions">
            <span class="spacer"></span>
            <button type="button" @click="emit('close')">{{ dashT('common.close', 'Close') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
