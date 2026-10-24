<script setup lang="ts">
/*
 * Action buttons (legacy mds-controls, market_data_status.html:271-281 and
 * updateUI button matrix :439-448). Legacy ships every button disabled
 * (html:272-280) and only updateUI — i.e. the first WS status frame —
 * re-enables them, hence the `received` prop (true after the first frame):
 *   Refresh Now  visible ⇔ !queued   (disabled ⇔ queued || !received)
 *   Cancel       visible ⇔ queued    (disabled ⇔ !queued)
 *   Stop         visible ⇔ running   (disabled ⇔ !running)
 * v-show keeps the legacy display:none toggling (flex children render
 * identically to the legacy display:block).
 */
import { useI18n } from 'vue-i18n';
import { PhArrowClockwise, PhStop } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';

defineProps<{ connected: boolean; queued: boolean; running: boolean; received: boolean; actionPending: boolean }>();
defineEmits<{ refresh: []; cancel: []; stop: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="mds-controls">
    <Button class="mds-btn" variant="primary" type="button" v-show="!queued" :disabled="actionPending || queued || running || !received" @click="$emit('refresh')">
      <PbIcon :icon="PhArrowClockwise" /> <span>{{ t('misc.mds.refreshNow') }}</span>
    </Button>
    <Button class="mds-btn" variant="danger" type="button" v-show="queued" :disabled="actionPending || !queued" @click="$emit('cancel')">
      <PbIcon :icon="PhStop" /> <span>{{ t('misc.mds.cancelQueuedRefresh') }}</span>
    </Button>
    <Button class="mds-btn" variant="danger" type="button" v-show="running" :disabled="actionPending || !running" @click="$emit('stop')">
      <PbIcon :icon="PhStop" /> <span>{{ t('misc.mds.stopCurrentRun') }}</span>
    </Button>
    <!-- Live socket state. It lives in the toolbar row instead of a banner
         above it so a dropped connection does not shift the table down. -->
    <span
      class="mds-connection ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-medium"
      :class="connected
        ? 'border-success/28 bg-success/12 text-success-soft'
        : 'border-warning/28 bg-warning/12 text-warning-soft'"
      data-test="mds-connection"
      role="status"
      aria-live="polite"
    >
      <span class="inline-block h-1.5 w-1.5 rounded-full" :class="connected ? 'bg-success' : 'bg-warning'" />
      <span>{{ connected ? t('market.connected') : t('market.connectingEllipsis') }}</span>
    </span>
  </div>
</template>

<style scoped>
/* Ported from .mds-root .mds-controls (market_data_status.html:62-66). The
   .mds-btn chrome (html:67-111) is owned by the ui/Button variants now;
   .mds-btn stays on the buttons as the inert hook the page suite selects.
   Spacing below the row is the content wrapper's gap, not a margin here. */
.mds-controls {
  display: flex;
  gap: var(--sp-sm);
  align-items: center;
  flex-wrap: wrap;
}
</style>
