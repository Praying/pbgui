<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

type ConnectionState = 'waiting' | 'lost' | 'ok';

interface ConnectionNoticeProps {
  state: ConnectionState;
  waitingText: string;
  lostText: string;
  okText?: string;
  showOk?: boolean;
  waitingDelayMs?: number;
}

const props = withDefaults(defineProps<ConnectionNoticeProps>(), {
  okText: 'Connected',
  showOk: false,
  waitingDelayMs: 600,
});

const visible = ref(false);
let waitingTimer: ReturnType<typeof setTimeout> | null = null;

function clearWaitingTimer(): void {
  if (waitingTimer === null) return;
  clearTimeout(waitingTimer);
  waitingTimer = null;
}

watch(
  () => props.state,
  (state) => {
    clearWaitingTimer();
    if (state === 'lost') {
      visible.value = true;
      return;
    }
    if (state === 'ok') {
      visible.value = props.showOk;
      return;
    }
    visible.value = false;
    waitingTimer = setTimeout(() => {
      waitingTimer = null;
      if (props.state === 'waiting') visible.value = true;
    }, props.waitingDelayMs);
  },
  { immediate: true },
);

onBeforeUnmount(clearWaitingTimer);
</script>

<template>
  <Transition name="connection-notice">
    <section
      v-if="visible"
      id="conn-banner"
      class="pbgui-connection-notice"
      :class="[`pbgui-connection-notice--${props.state}`, `conn-${props.state}`]"
      :data-state="props.state"
      role="status"
      :aria-live="props.state === 'lost' ? 'assertive' : 'polite'"
    >
      <span class="pbgui-connection-notice__indicator" aria-hidden="true" />
      <span>{{ props.state === 'lost' ? props.lostText : props.state === 'ok' ? props.okText : props.waitingText }}</span>
    </section>
  </Transition>
</template>

<style scoped>
.pbgui-connection-notice {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: var(--sp-sm);
  padding: 7px var(--sp-xl);
  border-block: 1px solid rgb(var(--warning-rgb) / 0.2);
  background: color-mix(in srgb, var(--surface-panel) 92%, var(--warning) 8%);
  color: var(--warning-soft);
  font-size: var(--fs-sm);
  font-weight: 600;
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.04) inset;
}

.pbgui-connection-notice--lost {
  border-color: rgb(var(--danger-rgb) / 0.28);
  background: color-mix(in srgb, var(--surface-panel) 88%, var(--danger) 12%);
  color: var(--danger-soft);
}

.pbgui-connection-notice--ok {
  border-color: rgb(var(--success-rgb) / 0.2);
  background: color-mix(in srgb, var(--surface-panel) 92%, var(--success) 8%);
  color: var(--success-soft);
}

.pbgui-connection-notice__indicator {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: var(--radius-full);
  background: var(--warning);
  box-shadow: 0 0 0 3px rgb(var(--warning-rgb) / 0.1);
}

.pbgui-connection-notice--lost .pbgui-connection-notice__indicator {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgb(var(--danger-rgb) / 0.12);
}

.pbgui-connection-notice--ok .pbgui-connection-notice__indicator {
  background: var(--success);
  box-shadow: 0 0 0 3px rgb(var(--success-rgb) / 0.1);
}

.connection-notice-enter-active,
.connection-notice-leave-active {
  transition:
    opacity var(--motion-normal) var(--ease-standard),
    transform var(--motion-normal) var(--ease-standard);
}

.connection-notice-enter-from,
.connection-notice-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .connection-notice-enter-active,
  .connection-notice-leave-active {
    transition: none;
  }
}
</style>
