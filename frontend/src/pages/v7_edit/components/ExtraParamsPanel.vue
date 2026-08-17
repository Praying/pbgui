<script setup lang="ts">
/**
 * Additional Parameters expander — v7_edit.html:2480-2560: unknown live.*
 * keys rendered as dynamic fields (checkbox / number / JSON textarea /
 * text) with the legacy kind semantics; collectConfig reads them back.
 */
import { useI18n } from 'vue-i18n';
import ExpanderGroup from './ExpanderGroup.vue';
import { useEditPageContext } from '../composables/useEditPage';

const { t } = useI18n();
const page = useEditPageContext();
</script>

<template>
  <ExpanderGroup v-if="page.extraLive.value.length" id="exp-extra-live" :title="t('v7run.additionalParameters')">
    <template #header-extra>
      <span style="margin-left: auto; font-size: var(--fs-xs); color: var(--text-dim)">{{ t('v7run.parametersNotInGui') }}</span>
    </template>
    <div class="form-row cols-3">
      <div
        v-for="field in page.extraLive.value"
        :key="field.key"
        class="form-group"
        :style="field.kind === 'json' ? 'grid-column: span 3' : undefined"
      >
        <label>{{ field.key }}</label>
        <div v-if="field.kind === 'boolean'" class="chk-row">
          <input :id="'extra-live-' + field.key" v-model="field.checked" type="checkbox" />
        </div>
        <input
          v-else-if="field.kind === 'number'"
          :id="'extra-live-' + field.key"
          v-model="field.text"
          type="number"
          class="form-input"
        />
        <template v-else-if="field.kind === 'json'">
          <textarea :id="'extra-live-' + field.key" v-model="field.text" class="json-editor" rows="4" style="overflow: hidden; resize: vertical"></textarea>
          <div :id="'extra-live-' + field.key + '-status'" class="field-status field-status-inline" aria-live="polite"></div>
        </template>
        <input v-else :id="'extra-live-' + field.key" v-model="field.text" type="text" class="form-input" />
      </div>
    </div>
  </ExpanderGroup>
</template>
