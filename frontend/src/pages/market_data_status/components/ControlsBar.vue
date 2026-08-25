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

defineProps<{ queued: boolean; running: boolean; received: boolean }>();
defineEmits<{ refresh: []; cancel: []; stop: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="mds-controls">
    <Button class="mds-btn" variant="primary" type="button" v-show="!queued" :disabled="queued || !received" @click="$emit('refresh')">
      <PbIcon :icon="PhArrowClockwise" /> <span>{{ t('misc.mds.refreshNow') }}</span>
    </Button>
    <Button class="mds-btn" variant="danger" type="button" v-show="queued" :disabled="!queued" @click="$emit('cancel')">
      <PbIcon :icon="PhStop" /> <span>{{ t('misc.mds.cancelQueuedRefresh') }}</span>
    </Button>
    <Button class="mds-btn" variant="danger" type="button" v-show="running" :disabled="!running" @click="$emit('stop')">
      <PbIcon :icon="PhStop" /> <span>{{ t('misc.mds.stopCurrentRun') }}</span>
    </Button>
  </div>
</template>

<style scoped>
/* Ported from .mds-root .mds-controls (market_data_status.html:62-66). The
   .mds-btn chrome (html:67-111) is owned by the ui/Button variants now;
   .mds-btn stays on the buttons as the inert hook the page suite selects. */
.mds-controls {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
</style>
