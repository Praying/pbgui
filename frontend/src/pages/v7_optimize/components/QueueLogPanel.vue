<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue';
import { onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import type { OptimizeAdapter } from '../config';
interface Viewer { open(): void; close(): void; setHost?(host: string): void; setFile?(file: string): void }
type ViewerCtor = new (options: Record<string, unknown>) => Viewer;
const props = defineProps<{ open: boolean; filename: string; title: string; adapter: OptimizeAdapter }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
let viewer: Viewer | null = null;
function wsBase(): string { return getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'); }
function show(): void {
  viewer?.close();
  const Ctor = (window as Window & { LogViewerPanel?: ViewerCtor }).LogViewerPanel;
  if (!Ctor || !props.filename) return;
  viewer = new Ctor({ containerId: 'optimize-log-viewer-target', wsBase: wsBase(), defaultHost: 'local', defaultFile: props.adapter.queueLogPrefix + props.filename + '.log', presets: 'system', showRestart: false, height: '100%', startLocalAtEnd: false });
  viewer.open();
}
watch(() => [props.open, props.filename] as const, ([open]) => { if (open) show(); else viewer?.close(); });
onBeforeUnmount(() => viewer?.close());
</script>
<template><aside v-if="open" class="fixed bottom-0 right-0 z-[1100] flex h-[46vh] w-[420px] max-w-[90vw] flex-col border-l border-t border-border-default bg-page"><header><strong>{{ title }}</strong><Button variant="ghost" size="icon" class="h-7 w-7" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')"><PbIcon :icon="PhX" :size="18" /></Button></header><div id="optimize-log-viewer-target"></div></aside></template>
