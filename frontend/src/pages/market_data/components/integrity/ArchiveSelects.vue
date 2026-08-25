<script setup lang="ts">
/*
 * The checksum-sharing card — #integrity-removed-card's archive sibling
 * (market_data_main.html:3268-3295): publish toggle, the two
 * predicate-filtered archive selects (fillArchiveSelect :4260-4276) and
 * the save/publish/reference actions (:4607-4636, :9172-9177).
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import {
  fieldLabelClass,
  noteClass,
  panelCardClass,
  panelHeadClass,
  settingsFieldClass,
  settingsToggleClass,
} from '../../lib/uiClasses';
import type { IntegrityController } from '../../composables/useIntegrity';

const props = defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();

/* ui-migration: the legacy archive selects carry a real empty-value option
   ("no publish/reference archive" — a selectable reset, :4260-4276). reka
   reserves "" for the cleared state, so the option rides a sentinel value
   that encodes/decodes to "" at the model boundary. */
const NONE_ARCHIVE = '__none__';

function encodeArchive(value: string): string {
  return value === '' ? NONE_ARCHIVE : value;
}

function onPublishArchiveSelect(value: unknown): void {
  const decoded = String(value ?? '');
  props.store.form.publishArchive.value = decoded === NONE_ARCHIVE ? '' : decoded;
}

function onReferenceArchiveSelect(value: unknown): void {
  const decoded = String(value ?? '');
  props.store.form.referenceArchive.value = decoded === NONE_ARCHIVE ? '' : decoded;
}

function archiveLabel(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
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
      <label :class="[settingsToggleClass, 'cursor-pointer']">
        <Checkbox id="integrity-publish-enabled" v-model="store.form.publishEnabled.value" />
        <span>{{ t('market.publishChecksumDaily') }}</span>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass" id="integrity-publish-archive-label">{{ t('market.publishArchive') }}</span>
        <SelectRoot :model-value="encodeArchive(store.form.publishArchive.value)" @update:model-value="onPublishArchiveSelect">
          <SelectTrigger id="integrity-publish-archive" aria-labelledby="integrity-publish-archive-label">
            <span>{{ archiveLabel(store.archiveOptions.value.publish, store.form.publishArchive.value) }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in store.archiveOptions.value.publish" :key="option.value || NONE_ARCHIVE" :value="encodeArchive(option.value)">
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass" id="integrity-reference-archive-label">{{ t('market.referenceArchive') }}</span>
        <SelectRoot :model-value="encodeArchive(store.form.referenceArchive.value)" @update:model-value="onReferenceArchiveSelect">
          <SelectTrigger id="integrity-reference-archive" aria-labelledby="integrity-reference-archive-label">
            <span>{{ archiveLabel(store.archiveOptions.value.reference, store.form.referenceArchive.value) }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in store.archiveOptions.value.reference" :key="option.value || NONE_ARCHIVE" :value="encodeArchive(option.value)">
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </label>
    </div>
    <div class="panel-actions">
      <Button
        variant="primary"
        id="btn-integrity-save"
        type="button"
        :disabled="store.isSaving.value"
        @click="store.saveIntegritySettings()"
      >
        {{ t('market.saveArchiveSettings') }}
      </Button>
      <Button
        variant="info"
        id="btn-integrity-publish"
        type="button"
        :disabled="store.publishDisabled.value"
        @click="store.queuePublish()"
      >
        {{ t('market.publishNow') }}
      </Button>
      <Button
        variant="info"
        id="btn-integrity-reference"
        type="button"
        :disabled="store.referenceDisabled.value"
        @click="store.queueReference()"
      >
        {{ t('market.refreshReference') }}
      </Button>
    </div>
  </article>
</template>
