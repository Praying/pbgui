<script setup lang="ts">
import { PhTerminalWindow, PhX } from '@phosphor-icons/vue';
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

<template>
  <div v-if="open" class="optimize-log-overlay">
    <section
      class="optimize-log-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optimize-log-title"
    >
      <header class="optimize-log-dialog__header">
        <div class="optimize-log-dialog__heading">
          <span class="optimize-log-dialog__icon" aria-hidden="true">
            <PbIcon :icon="PhTerminalWindow" :size="19" weight="duotone" />
          </span>
          <div class="optimize-log-dialog__title-group">
            <h2 id="optimize-log-title">{{ title }}</h2>
            <code :title="filename">{{ filename }}</code>
          </div>
          <span class="optimize-log-dialog__live" aria-hidden="true">
            <span class="optimize-log-dialog__live-dot"></span>
            {{ t('v7optimize.connected') }}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="optimize-log-dialog__close"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <PbIcon :icon="PhX" :size="18" />
        </Button>
      </header>
      <div class="optimize-log-dialog__content">
        <div id="optimize-log-viewer-target"></div>
      </div>
    </section>
  </div>
</template>

<style>
.optimize-log-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 15 15 / 0.78);
}

.optimize-log-dialog {
  display: flex;
  width: min(1180px, 100%);
  height: min(760px, calc(100dvh - 48px));
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface-panel);
  box-shadow: var(--shadow-modal), 0 0 0 1px rgb(var(--accent-rgb) / 0.06);
}

.optimize-log-dialog__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 10px 14px 10px 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-panel);
}

.optimize-log-dialog__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.optimize-log-dialog__icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(var(--accent-rgb) / 0.28);
  border-radius: var(--radius-md);
  background: rgb(var(--accent-rgb) / 0.1);
  color: var(--accent-soft);
}

.optimize-log-dialog__title-group {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.optimize-log-dialog__title-group h2 {
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-log-dialog__title-group code {
  max-width: min(640px, 60vw);
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-log-dialog__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  padding: 4px 8px;
  border: 1px solid rgb(var(--success-rgb) / 0.22);
  border-radius: var(--radius-full);
  background: rgb(var(--success-rgb) / 0.08);
  color: var(--success-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.optimize-log-dialog__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 8px rgb(var(--success-rgb) / 0.65);
}

.optimize-log-dialog__close {
  flex: 0 0 auto;
  border-color: var(--border-default);
}

.optimize-log-dialog__content {
  min-height: 0;
  flex: 1;
  padding: 12px;
  overflow: hidden;
  background: var(--surface-deep);
}

#optimize-log-viewer-target {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-deep);
}

#optimize-log-viewer-target .lvp-root {
  gap: 10px;
  padding: 10px;
  background: var(--surface-deep);
}

#optimize-log-viewer-target .lvp-sidebar {
  min-width: 180px;
  border-right-color: var(--border-default);
  background: var(--surface-panel);
}

#optimize-log-viewer-target .lvp-viewer {
  gap: 8px;
}

#optimize-log-viewer-target .lvp-toolbar {
  min-height: 34px;
  padding: 4px 6px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-panel);
}

#optimize-log-viewer-target .lvp-terminal {
  border-color: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
  scrollbar-color: var(--border-strong) transparent;
}

@media (max-width: 720px) {
  .optimize-log-overlay {
    padding: 10px;
  }

  .optimize-log-dialog {
    height: calc(100dvh - 20px);
  }

  .optimize-log-dialog__header {
    min-height: 56px;
    padding-inline: 12px;
  }

  .optimize-log-dialog__live {
    display: none;
  }

  .optimize-log-dialog__content {
    padding: 8px;
  }

  #optimize-log-viewer-target .lvp-root {
    padding: 6px;
  }

  #optimize-log-viewer-target .lvp-sidebar {
    min-width: 140px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .optimize-log-dialog__live-dot {
    box-shadow: none;
  }
}
</style>
