<script setup lang="ts">
/*
 * The checksum-sharing card — #integrity-removed-card's archive sibling
 * (market_data_main.html:3268-3295): publish toggle, the two
 * predicate-filtered archive selects (fillArchiveSelect :4260-4276) and
 * the save/publish/reference actions (:4607-4636, :9172-9177).
 */
import { useI18n } from 'vue-i18n';
import type { IntegrityController } from '../../composables/useIntegrity';

defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="panel-card">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.checksumSharing') }}</div>
        <h3>{{ t('market.archiveSettings') }}</h3>
        <p class="note">{{ t('market.checksumPublishNote') }}</p>
      </div>
    </div>
    <div class="integrity-settings-grid">
      <label class="settings-toggle">
        <input id="integrity-publish-enabled" v-model="store.form.publishEnabled.value" type="checkbox" />
        <span>{{ t('market.publishChecksumDaily') }}</span>
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.publishArchive') }}</span>
        <select id="integrity-publish-archive" v-model="store.form.publishArchive.value">
          <option v-for="option in store.archiveOptions.value.publish" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.referenceArchive') }}</span>
        <select id="integrity-reference-archive" v-model="store.form.referenceArchive.value">
          <option v-for="option in store.archiveOptions.value.reference" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
    <div class="panel-actions">
      <button
        class="btn pbgui-btn btn-primary primary"
        id="btn-integrity-save"
        type="button"
        :disabled="store.isSaving.value"
        @click="store.saveIntegritySettings()"
      >
        {{ t('market.saveArchiveSettings') }}
      </button>
      <button
        class="btn pbgui-btn btn-secondary secondary"
        id="btn-integrity-publish"
        type="button"
        :disabled="store.publishDisabled.value"
        @click="store.queuePublish()"
      >
        {{ t('market.publishNow') }}
      </button>
      <button
        class="btn pbgui-btn btn-secondary secondary"
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
