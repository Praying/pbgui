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
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  fieldLabelClass,
  panelCardClass,
  settingsFieldClass,
  settingsGridWideClass,
} from '../../lib/uiClasses';
import { SETTINGS_FIELD_IDS, type SettingsFieldValues } from '../../lib/settingsFields';

defineProps<{
  fields: SettingsFieldValues;
}>();

const { t } = useI18n();
const IDS = SETTINGS_FIELD_IDS;

const accessKeyVisible = ref(false);
const secretKeyVisible = ref(false);

/** The former .pw-wrap / .pw-eye-btn rules (36px eye gutter + overlay). */
const pwWrapClass = 'pw-wrap relative flex w-full items-center';
const pwEyeBtnClass =
  'pw-eye-btn absolute right-2 cursor-pointer border-none bg-transparent p-0 text-md leading-none text-muted select-none hover:text-secondary';
</script>

<template>
  <article :class="panelCardClass" id="settings-hyperliquid-aws" data-settings-subsection="aws">
    <div class="eyebrow">{{ t('market.awsSettingsL2book') }}</div>
    <div :class="settingsGridWideClass">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.awsProfileName') }}</span>
        <Input :id="IDS.awsProfile" v-model="fields.awsProfile" type="text" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">aws_access_key_id</span>
        <div :class="pwWrapClass">
          <Input :id="IDS.awsAccessKeyId" class="pr-9" v-model="fields.awsAccessKeyId" :type="accessKeyVisible ? 'text' : 'password'" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :class="pwEyeBtnClass"
            :aria-label="t(accessKeyVisible ? 'market.hideAwsAccessKey' : 'market.showAwsAccessKey')"
            :title="t(accessKeyVisible ? 'market.hideAwsAccessKey' : 'market.showAwsAccessKey')"
            @click="accessKeyVisible = !accessKeyVisible"
          ><PbIcon :icon="accessKeyVisible ? PhEyeSlash : PhEye" /></Button>
        </div>
        <span class="aws-credential-status text-xs text-muted">{{ t(fields.awsAccessKeyConfigured ? 'market.awsCredentialConfigured' : 'market.awsCredentialNotConfigured') }}</span>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">aws_secret_access_key</span>
        <div :class="pwWrapClass">
          <Input :id="IDS.awsSecretAccessKey" class="pr-9" v-model="fields.awsSecretAccessKey" :type="secretKeyVisible ? 'text' : 'password'" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :class="pwEyeBtnClass"
            :aria-label="t(secretKeyVisible ? 'market.hideAwsSecretKey' : 'market.showAwsSecretKey')"
            :title="t(secretKeyVisible ? 'market.hideAwsSecretKey' : 'market.showAwsSecretKey')"
            @click="secretKeyVisible = !secretKeyVisible"
          ><PbIcon :icon="secretKeyVisible ? PhEyeSlash : PhEye" /></Button>
        </div>
        <span class="aws-credential-status text-xs text-muted">{{ t(fields.awsSecretAccessKeyConfigured ? 'market.awsCredentialConfigured' : 'market.awsCredentialNotConfigured') }}</span>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.awsRegion') }}</span>
        <Input :id="IDS.awsRegion" v-model="fields.awsRegion" type="text" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.scanTimeoutSeconds') }}</span>
        <Input :id="IDS.scanTimeout" :model-value="fields.scanTimeout" @update:model-value="fields.scanTimeout = String($event ?? '')" type="number" min="0.1" max="60" step="0.5" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.workers') }}</span>
        <Input :id="IDS.scanWorkers" :model-value="fields.scanWorkers" @update:model-value="fields.scanWorkers = String($event ?? '')" type="number" min="1" max="64" step="1" />
      </label>
    </div>
  </article>
</template>
