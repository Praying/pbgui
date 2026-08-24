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
import {
  btnClass,
  fieldLabelClass,
  inputClass,
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
        <input
          id="copy-data-ssh-command"
          :class="inputClass"
          type="text"
          placeholder="ssh -J user@jump-host -p 2222"
          autocomplete="off"
          :value="store.sshCommand.value"
          @input="store.setSshCommand(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label :class="settingsFieldClass">
        <span
          :class="fieldLabelClass"
          data-tip="Final SSH target for rsync. Examples: user@target-host, target-host, localhost for a reverse tunnel, or an SSH config alias."
        >{{ t('market.remoteTarget') }}</span>
        <input
          id="copy-data-target"
          :class="inputClass"
          type="text"
          placeholder="localhost or user@host"
          autocomplete="off"
          :value="store.target.value"
          @input="store.setTarget(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label :class="settingsFieldClass">
        <span
          :class="fieldLabelClass"
          data-tip="Absolute data/ohlcv root on the remote host. Leave empty when the target PBGui uses the same path as this machine. The copy job creates missing exchange subdirectories below this root."
        >{{ t('market.destinationDataRoot') }}</span>
        <input
          id="copy-data-destination-root"
          :class="inputClass"
          type="text"
          placeholder="Leave empty to use this PBGui path on the target"
          autocomplete="off"
          :value="store.destinationRoot.value"
          @input="store.setDestinationRoot(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <div>
      <div :class="fieldLabelClass">{{ t('market.exchanges') }}</div>
      <div class="copy-data-exchange-grid grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
        <label v-for="item in COPY_DATA_EXCHANGES" :key="item.key" :class="settingsToggleClass">
          <input
            type="checkbox"
            class="h-4 w-4 m-0"
            :data-copy-data-exchange="item.key"
            :checked="store.isExchangeSelected(item.key)"
            @change="store.setExchangeSelected(item.key, ($event.target as HTMLInputElement).checked)"
          />
          {{ item.label }}
        </label>
      </div>
    </div>
    <div class="copy-data-actions flex flex-wrap items-center gap-3">
      <button
        :class="btnClass('secondary')"
        id="btn-copy-data-test"
        type="button"
        :disabled="store.isQueueDisabled.value"
        @click="store.testConnection()"
      >{{ t('market.testConnection') }}</button>
      <button
        :class="btnClass('secondary')"
        id="btn-copy-data-dry-run"
        type="button"
        :disabled="store.isQueueDisabled.value"
        @click="store.queueJob(true)"
      >{{ t('market.dryRun') }}</button>
      <button
        :class="btnClass('primary')"
        id="btn-copy-data-queue"
        type="button"
        :disabled="store.isQueueDisabled.value"
        @click="store.queueJob(false)"
      >{{ t('market.queueCopyJob') }}</button>
      <span :class="noteClass">{{ t('market.copyDataProgressNote') }}</span>
    </div>
  </div>
</template>
