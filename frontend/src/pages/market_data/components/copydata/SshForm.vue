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
import { COPY_DATA_EXCHANGES } from '../../lib/copySchedules';
import type { UseCopyData } from '../../composables/useCopyData';

defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="copy-data-form-grid">
    <div class="settings-grid settings-grid-wide">
      <label class="settings-field">
        <span
          class="field-label"
          data-tip="Remote shell command only. Do not include the final target here. Examples: ssh, ssh -p 2222, ssh -J user@jump-host, ssh -J user@jump-host -p 2222."
        >{{ t('market.sshCommandWithoutTarget') }}</span>
        <input
          id="copy-data-ssh-command"
          type="text"
          placeholder="ssh -J user@jump-host -p 2222"
          autocomplete="off"
          :value="store.sshCommand.value"
          @input="store.setSshCommand(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="settings-field">
        <span
          class="field-label"
          data-tip="Final SSH target for rsync. Examples: user@target-host, target-host, localhost for a reverse tunnel, or an SSH config alias."
        >{{ t('market.remoteTarget') }}</span>
        <input
          id="copy-data-target"
          type="text"
          placeholder="localhost or user@host"
          autocomplete="off"
          :value="store.target.value"
          @input="store.setTarget(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="settings-field">
        <span
          class="field-label"
          data-tip="Absolute data/ohlcv root on the remote host. Leave empty when the target PBGui uses the same path as this machine. The copy job creates missing exchange subdirectories below this root."
        >{{ t('market.destinationDataRoot') }}</span>
        <input
          id="copy-data-destination-root"
          type="text"
          placeholder="Leave empty to use this PBGui path on the target"
          autocomplete="off"
          :value="store.destinationRoot.value"
          @input="store.setDestinationRoot(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <div>
      <div class="field-label">{{ t('market.exchanges') }}</div>
      <div class="copy-data-exchange-grid">
        <label v-for="item in COPY_DATA_EXCHANGES" :key="item.key" class="settings-toggle">
          <input
            type="checkbox"
            :data-copy-data-exchange="item.key"
            :checked="store.isExchangeSelected(item.key)"
            @change="store.setExchangeSelected(item.key, ($event.target as HTMLInputElement).checked)"
          />
          {{ item.label }}
        </label>
      </div>
    </div>
    <div class="copy-data-actions">
      <button
        class="btn pbgui-btn btn-secondary secondary"
        id="btn-copy-data-test"
        type="button"
        :disabled="store.isQueueDisabled.value"
        @click="store.testConnection()"
      >{{ t('market.testConnection') }}</button>
      <button
        class="btn pbgui-btn btn-secondary secondary"
        id="btn-copy-data-dry-run"
        type="button"
        :disabled="store.isQueueDisabled.value"
        @click="store.queueJob(true)"
      >{{ t('market.dryRun') }}</button>
      <button
        class="btn pbgui-btn btn-primary primary"
        id="btn-copy-data-queue"
        type="button"
        :disabled="store.isQueueDisabled.value"
        @click="store.queueJob(false)"
      >{{ t('market.queueCopyJob') }}</button>
      <span class="note">{{ t('market.copyDataProgressNote') }}</span>
    </div>
  </div>
</template>
