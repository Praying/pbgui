<script setup lang="ts">
/*
 * The checksum-sharing card — #integrity-removed-card's archive sibling
 * (market_data_main.html:3268-3295): publish toggle, the two
 * predicate-filtered archive selects (fillArchiveSelect :4260-4276) and
 * the save/publish/reference actions (:4607-4636, :9172-9177).
 */
import { useI18n } from 'vue-i18n';
import {
  btnClass,
  fieldLabelClass,
  inputClass,
  noteClass,
  panelCardClass,
  panelHeadClass,
  settingsFieldClass,
  settingsToggleClass,
} from '../../lib/uiClasses';
import type { IntegrityController } from '../../composables/useIntegrity';

defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();
</script>

<template>
  <article :class="panelCardClass">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.checksumSharing') }}</div>
        <h3>{{ t('market.archiveSettings') }}</h3>
        <p :class="noteClass">{{ t('market.checksumPublishNote') }}</p>
      </div>
    </div>
    <div class="integrity-settings-grid grid grid-cols-[repeat(2,minmax(240px,1fr))] gap-3 max-[760px]:grid-cols-1">
      <label :class="settingsToggleClass">
        <input class="h-4 w-4 m-0" id="integrity-publish-enabled" v-model="store.form.publishEnabled.value" type="checkbox" />
        <span>{{ t('market.publishChecksumDaily') }}</span>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.publishArchive') }}</span>
        <select id="integrity-publish-archive" :class="inputClass" v-model="store.form.publishArchive.value">
          <option v-for="option in store.archiveOptions.value.publish" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.referenceArchive') }}</span>
        <select id="integrity-reference-archive" :class="inputClass" v-model="store.form.referenceArchive.value">
          <option v-for="option in store.archiveOptions.value.reference" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
    <div class="panel-actions">
      <button
        :class="btnClass('primary')"
        id="btn-integrity-save"
        type="button"
        :disabled="store.isSaving.value"
        @click="store.saveIntegritySettings()"
      >
        {{ t('market.saveArchiveSettings') }}
      </button>
      <button
        :class="btnClass('secondary')"
        id="btn-integrity-publish"
        type="button"
        :disabled="store.publishDisabled.value"
        @click="store.queuePublish()"
      >
        {{ t('market.publishNow') }}
      </button>
      <button
        :class="btnClass('secondary')"
        id="btn-integrity-reference"
        type="button"
        :disabled="store.referenceDisabled.value"
        @click="store.queueReference()"
      >
        {{ t('market.refreshReference') }}
      </button>
    </div>
  </article>
</template>
