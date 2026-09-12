<script setup lang="ts">
/**
 * Backtest queue task log dialog — renders the shared QueueLogTerminal
 * for a backtest task log stream (backtests_v8/{filename}.log for V8,
 * backtests/{filename}.log for V7).
 */
import { PhTerminalWindow, PhX } from '@phosphor-icons/vue';
import { toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import QueueLogTerminal from '@/shared/components/QueueLogTerminal.vue';
import { Button } from '@/shared/components/ui/button';
import { useEscapeClose } from '@/shared/composables/useEscapeClose';

const props = defineProps<{
  open: boolean;
  filename: string;
  title: string;
  file: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

useEscapeClose(toRef(props, 'open'), () => emit('close'));

const heading = () => t('v7backtest.logPrefix', { name: props.title || props.filename });
</script>

<template>
  <div v-if="open" class="backtest-log-overlay" data-test="backtest-log-overlay">
    <section
      class="backtest-log-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backtest-log-title"
    >
      <header class="backtest-log-dialog__header">
        <div class="backtest-log-dialog__heading">
          <span class="backtest-log-dialog__icon" aria-hidden="true">
            <PbIcon :icon="PhTerminalWindow" :size="19" weight="duotone" />
          </span>
          <div class="backtest-log-dialog__title-group">
            <h2 id="backtest-log-title" data-test="backtest-log-title">{{ heading() }}</h2>
            <code :title="file" data-test="backtest-log-path">{{ file }}</code>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="backtest-log-dialog__close"
          data-test="backtest-log-close"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <PbIcon :icon="PhX" :size="18" />
        </Button>
      </header>

      <div class="backtest-log-dialog__content">
        <div class="backtest-log-dialog__viewer">
          <QueueLogTerminal
            v-if="open && file"
            :key="file"
            :file="file"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style>
.backtest-log-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 15 15 / 0.78);
}

.backtest-log-dialog {
  display: flex;
  width: min(1180px, 100%);
  height: min(780px, calc(100dvh - 48px));
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface-panel);
  box-shadow: var(--shadow-modal), 0 0 0 1px rgb(var(--accent-rgb) / 0.06);
}

.backtest-log-dialog__header {
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

.backtest-log-dialog__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.backtest-log-dialog__icon {
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

.backtest-log-dialog__title-group {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.backtest-log-dialog__title-group h2 {
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backtest-log-dialog__title-group code {
  max-width: min(640px, 60vw);
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backtest-log-dialog__close {
  flex: 0 0 auto;
  border-color: var(--border-default);
}

.backtest-log-dialog__content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-deep);
}

.backtest-log-dialog__viewer {
  display: flex;
  min-height: 0;
  flex: 1;
  padding: 12px;
  background: var(--surface-deep);
}

@media (max-width: 720px) {
  .backtest-log-overlay {
    padding: 10px;
  }

  .backtest-log-dialog {
    height: calc(100dvh - 20px);
  }

  .backtest-log-dialog__header {
    min-height: 56px;
    padding-inline: 12px;
  }

  .backtest-log-dialog__viewer {
    padding: 8px;
  }
}
</style>
