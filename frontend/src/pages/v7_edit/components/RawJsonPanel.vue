<script setup lang="ts">
/**
 * Raw JSON expander — v7_edit.html:1126-1140. M-v7-1 ships the editable
 * textarea bound to the collect base; the bidirectional structured↔raw sync
 * controller, error reveal and highlight overlay land in M-v7-2.
 */
import { useI18n } from 'vue-i18n';
import ExpanderGroup from './ExpanderGroup.vue';
import { useEditPageContext } from '../composables/useEditPage';

const { t } = useI18n();
const page = useEditPageContext();
</script>

<template>
  <ExpanderGroup id="exp-raw" :title="t('v7run.rawJson')">
    <div class="form-group">
      <div class="raw-json-wrap" id="cfg-raw-json-wrap">
        <div id="cfg-raw-json-status" class="field-status" aria-live="polite"></div>
        <textarea
          id="cfg-raw-json"
          v-model="page.state.rawJson"
          style="overflow: hidden; resize: vertical"
        ></textarea>
      </div>
    </div>
  </ExpanderGroup>
</template>
