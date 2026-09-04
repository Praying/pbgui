<script setup lang="ts">
/**
 * PositionsConfigPreviewModal — port of openConfigPreviewModal
 * (dashboard_render.js:2394-2451): the dry-run config preview overlay with
 * the note, the pretty-printed JSON and a Close action. Geometry from
 * previewModalGeometry (legacy 2402-2407 viewport math).
 *
 * The shared modal chrome utilities live in ./uiClasses (dpModalChrome);
 * the buttons use the shared ui/Button like PositionsManageModal.
 */
import { computed , ref } from 'vue';
import JsonViewer from '@/shared/components/JsonViewer.vue';
import { PhX } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { dashT } from '../../lib/i18n';
import { previewModalGeometry } from '../../lib/manageLogic';
import { useEscapeClose } from '@/shared/composables/useEscapeClose';
import { dpModalChrome } from './uiClasses';

const props = defineProps<{
  title: string;
  config: unknown;
}>();

const emit = defineEmits<{ close: [] }>();

/* Escape-close parity with the shared Modal (mounted means open). */
const dialogOpen = ref(true);
useEscapeClose(dialogOpen, () => emit('close'));

const geometry = computed(() => previewModalGeometry(window.innerWidth, window.innerHeight));

const style = computed(() => ({
  width: geometry.value.width + 'px',
  height: geometry.value.height + 'px',
  left: geometry.value.left + 'px',
  top: geometry.value.top + 'px',
}));
</script>

<template>
  <Teleport to="body">
    <div :class="dpModalChrome.ovl">
      <div
        class="dp-preview-modal fixed flex h-[min(760px,calc(100dvh-72px))] w-[min(1200px,calc(100vw-48px))] min-h-[320px] min-w-[560px] max-h-[calc(100dvh-24px)] max-w-[calc(100vw-16px)] flex-col overflow-visible rounded-[12px] border border-border-default bg-page font-sans text-primary shadow-[var(--shadow-modal)]"
        :style="style"
      >
        <div :class="dpModalChrome.head">
          <div :class="dpModalChrome.title">{{ title }}</div>
          <Button type="button" variant="ghost" :class="dpModalChrome.close" :aria-label="dashT('common.close', 'Close')" @click="emit('close')"><PbIcon :icon="PhX" :size="16" /></Button>
        </div>
        <div class="dp-preview-body flex min-h-0 flex-1 flex-col gap-[0.55rem] overflow-hidden p-[0.85rem]">
          <div :class="[dpModalChrome.statusMsg, 'ok text-success-soft']">
            {{ dashT('dash.previewOnly', 'Preview only. No config was saved and no SSH sync was started.') }}
          </div>
          <JsonViewer class="dp-preview min-h-0 flex-auto" fill :data="props.config ?? {}" />
          <div :class="dpModalChrome.actions">
            <span class="spacer flex-1"></span>
            <Button type="button" size="sm" @click="emit('close')">{{ dashT('common.close', 'Close') }}</Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
