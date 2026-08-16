<script setup lang="ts">
/*
 * TOC sidebar — legacy #help-toc block (help.html:538-541; renderToc
 * :816-829; filter input :1014). ids/classes unchanged; the index-loading
 * and error states replace the innerHTML placeholders from loadHelpIndex
 * (:859, :888).
 */
import { useI18n } from 'vue-i18n';
import type { HelpIndexStatus, HelpTopic } from '../composables/useHelpContent';

defineProps<{
  filter: string;
  entries: { topic: HelpTopic; index: number }[];
  selected: number;
  status: HelpIndexStatus;
}>();

const emit = defineEmits<{
  (e: 'update:filter', value: string): void;
  (e: 'select', index: number): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div id="help-toc">
    <input
      id="help-toc-filter"
      type="text"
      :value="filter"
      :placeholder="t('misc.help.filterTopics')"
      autocomplete="off"
      @input="emit('update:filter', ($event.target as HTMLInputElement).value)"
    >
    <div id="help-toc-list">
      <div v-if="status === 'loading'" class="help-loading">{{ t('common.loading') }}</div>
      <div v-else-if="status === 'error'" class="help-loading">{{ t('misc.help.failedLoadTopics') }}</div>
      <template v-else>
        <div
          v-for="entry in entries"
          :key="entry.topic.file"
          class="toc-item"
          :class="{ active: entry.index === selected }"
          @click="emit('select', entry.index)"
        >{{ entry.topic.title }}</div>
      </template>
    </div>
  </div>
</template>
