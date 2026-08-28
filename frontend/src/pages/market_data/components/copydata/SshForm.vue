<script setup lang="ts">
/*
 * The SSH copy form — legacy .copy-data-form-grid (market_data_main.html:
 * 3425-3456): ssh command / target / destination root fields, the exchange
 * checkbox grid (:3441-3448) and the test/dry-run/queue action row.
 *
 * collectCopyDataRequest reads these at action time (:5046-5053); the store
 * owns the values, this component only binds them.
 */
import { useI18n } from 'vue-i18n';
import { PhFlask, PhPlugsConnected, PhUploadSimple } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import PbIcon from '@/shared/components/PbIcon.vue';
import {
  fieldLabelClass,
  noteClass,
  settingsFieldClass,
  settingsGridWideClass,
  settingsToggleClass,
} from '../../lib/uiClasses';
import { COPY_DATA_EXCHANGES } from '../../lib/copySchedules';
import type { UseCopyData } from '../../composables/useCopyData';

defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="copy-data-form-grid grid gap-3">
    <div :class="settingsGridWideClass">
      <label :class="settingsFieldClass">
        <span
          :class="fieldLabelClass"
          data-tip="Remote shell command only. Do not include the final target here. Examples: ssh, ssh -p 2222, ssh -J user@jump-host, ssh -J user@jump-host -p 2222."
        >{{ t('market.sshCommandWithoutTarget') }}</span>
        <Input
          id="copy-data-ssh-command"
          type="text"
          placeholder="ssh -J user@jump-host -p 2222"
          autocomplete="off"
          :model-value="store.sshCommand.value"
          @update:model-value="store.setSshCommand(String($event ?? ''))"
        />
      </label>
      <label :class="settingsFieldClass">
        <span
          :class="fieldLabelClass"
          data-tip="Final SSH target for rsync. Examples: user@target-host, target-host, localhost for a reverse tunnel, or an SSH config alias."
        >{{ t('market.remoteTarget') }}</span>
        <Input
          id="copy-data-target"
          type="text"
          placeholder="localhost or user@host"
          autocomplete="off"
          :model-value="store.target.value"
          @update:model-value="store.setTarget(String($event ?? ''))"
        />
      </label>
      <label :class="settingsFieldClass">
        <span
          :class="fieldLabelClass"
          data-tip="Absolute data/ohlcv root on the remote host. Leave empty when the target PBGui uses the same path as this machine. The copy job creates missing exchange subdirectories below this root."
        >{{ t('market.destinationDataRoot') }}</span>
        <Input
          id="copy-data-destination-root"
          type="text"
          placeholder="Leave empty to use this PBGui path on the target"
          autocomplete="off"
          :model-value="store.destinationRoot.value"
          @update:model-value="store.setDestinationRoot(String($event ?? ''))"
        />
      </label>
    </div>
    <div>
      <div :class="fieldLabelClass">{{ t('market.exchanges') }}</div>
      <div class="copy-data-exchange-grid grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
        <label v-for="item in COPY_DATA_EXCHANGES" :key="item.key" :class="[settingsToggleClass, 'cursor-pointer']">
          <Checkbox
            :data-copy-data-exchange="item.key"
            :model-value="store.isExchangeSelected(item.key)"
            @update:model-value="store.setExchangeSelected(item.key, $event === true)"
          />
          {{ item.label }}
        </label>
      </div>
    </div>
    <div class="copy-data-actions flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        id="btn-copy-data-test"
        type="button"
        :loading="store.isTesting.value"
        :disabled="store.isQueueDisabled.value"
        @click="store.testConnection()"
      ><PbIcon v-if="!store.isTesting.value" :icon="PhPlugsConnected" /> {{ t('market.testConnection') }}</Button>
      <Button
        variant="info"
        id="btn-copy-data-dry-run"
        type="button"
        :loading="store.isQueueing.value"
        :disabled="store.isQueueDisabled.value"
        @click="store.queueJob(true)"
      ><PbIcon v-if="!store.isQueueing.value" :icon="PhFlask" /> {{ t('market.dryRun') }}</Button>
      <Button
        variant="primary"
        id="btn-copy-data-queue"
        type="button"
        :loading="store.isQueueing.value"
        :disabled="store.isQueueDisabled.value"
        @click="store.queueJob(false)"
      ><PbIcon v-if="!store.isQueueing.value" :icon="PhUploadSimple" /> {{ t('market.queueCopyJob') }}</Button>
      <span :class="noteClass">{{ t('market.copyDataProgressNote') }}</span>
    </div>
  </div>
</template>
