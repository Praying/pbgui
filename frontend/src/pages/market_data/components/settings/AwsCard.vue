<script setup lang="ts">
/*
 * AWS (l2Book) card — legacy #settings-hyperliquid-aws
 * (market_data_main.html:3027-3061), including the password-eye toggle
 * (window.togglePwVisible :5575-5585 → local reactive state).
 */
import { ref } from 'vue';
import { PhEye, PhEyeSlash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { SETTINGS_FIELD_IDS, type SettingsFieldValues } from '../../lib/settingsFields';

defineProps<{
  fields: SettingsFieldValues;
}>();

const { t } = useI18n();
const IDS = SETTINGS_FIELD_IDS;

const accessKeyVisible = ref(false);
const secretKeyVisible = ref(false);
</script>

<template>
  <article class="panel-card" id="settings-hyperliquid-aws" data-settings-subsection="aws">
    <div class="eyebrow">{{ t('market.awsSettingsL2book') }}</div>
    <div class="settings-grid settings-grid-wide">
      <label class="settings-field">
        <span class="field-label">{{ t('market.awsProfileName') }}</span>
        <input :id="IDS.awsProfile" v-model="fields.awsProfile" type="text">
      </label>
      <label class="settings-field">
        <span class="field-label">aws_access_key_id</span>
        <div class="pw-wrap">
          <input :id="IDS.awsAccessKeyId" v-model="fields.awsAccessKeyId" :type="accessKeyVisible ? 'text' : 'password'">
          <button
            type="button"
            class="pw-eye-btn"
            :aria-label="t(accessKeyVisible ? 'market.hideAwsAccessKey' : 'market.showAwsAccessKey')"
            :title="t(accessKeyVisible ? 'market.hideAwsAccessKey' : 'market.showAwsAccessKey')"
            @click="accessKeyVisible = !accessKeyVisible"
          ><PbIcon :icon="accessKeyVisible ? PhEyeSlash : PhEye" /></button>
        </div>
        <span class="aws-credential-status">{{ t(fields.awsAccessKeyConfigured ? 'market.awsCredentialConfigured' : 'market.awsCredentialNotConfigured') }}</span>
      </label>
      <label class="settings-field">
        <span class="field-label">aws_secret_access_key</span>
        <div class="pw-wrap">
          <input :id="IDS.awsSecretAccessKey" v-model="fields.awsSecretAccessKey" :type="secretKeyVisible ? 'text' : 'password'">
          <button
            type="button"
            class="pw-eye-btn"
            :aria-label="t(secretKeyVisible ? 'market.hideAwsSecretKey' : 'market.showAwsSecretKey')"
            :title="t(secretKeyVisible ? 'market.hideAwsSecretKey' : 'market.showAwsSecretKey')"
            @click="secretKeyVisible = !secretKeyVisible"
          ><PbIcon :icon="secretKeyVisible ? PhEyeSlash : PhEye" /></button>
        </div>
        <span class="aws-credential-status">{{ t(fields.awsSecretAccessKeyConfigured ? 'market.awsCredentialConfigured' : 'market.awsCredentialNotConfigured') }}</span>
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.awsRegion') }}</span>
        <input :id="IDS.awsRegion" v-model="fields.awsRegion" type="text">
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.scanTimeoutSeconds') }}</span>
        <input :id="IDS.scanTimeout" :value="fields.scanTimeout" type="number" min="0.1" max="60" step="0.5" @input="fields.scanTimeout = ($event.target as HTMLInputElement).value">
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.workers') }}</span>
        <input :id="IDS.scanWorkers" :value="fields.scanWorkers" type="number" min="1" max="64" step="1" @input="fields.scanWorkers = ($event.target as HTMLInputElement).value">
      </label>
    </div>
  </article>
</template>

<style scoped>
.aws-credential-status {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
</style>
