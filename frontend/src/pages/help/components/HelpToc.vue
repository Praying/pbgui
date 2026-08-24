<script setup lang="ts">
/*
 * TOC sidebar — legacy #help-toc block (help.html:538-541; renderToc
 * :816-829; filter input :1014). Styling lives in Tailwind utilities since
 * the help.css → Tailwind migration (toc-item/active/help-loading remain
 * as inert anchors); the index-loading and error states replace the
 * innerHTML placeholders from loadHelpIndex (:859, :888).
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

/* toc-item colour set — the former .toc-item / .toc-item.active /
   .toc-item:hover rules from styles/help.css. Each branch carries the
   COMPLETE colour set (Tailwind emits same-property utilities in its own
   fixed order, so a neutral + variant pair in one list would render
   neutral), and the hover lift lives only on the inactive branch because
   the legacy .toc-item.active rule came later in the stylesheet and
   outranked :hover. 'toc-item'/'active' stay as inert anchors the page
   tests assert. */
function tocItemClass(isActive: boolean): string {
  return [
    'toc-item block cursor-pointer truncate border-l-[3px] py-[0.42rem] px-[0.9rem] text-sm transition-all duration-100',
    isActive
      ? 'active border-l-accent-soft bg-accent/7 font-semibold text-accent-soft'
      : 'border-l-transparent text-secondary hover:bg-elevated hover:text-primary',
  ].join(' ');
}
</script>

<template>
  <div
    id="help-toc"
    class="w-[230px] min-w-[170px] shrink-0 border-r border-border-subtle overflow-y-auto py-1.75 bg-page max-[720px]:w-full max-[720px]:min-w-0 max-[720px]:max-h-[210px] max-[720px]:border-r-0 max-[720px]:border-b max-[720px]:border-border-subtle"
  >
    <input
      id="help-toc-filter"
      type="text"
      class="w-[calc(100%-1.2rem)] mx-[0.6rem] mb-[0.4rem] bg-card text-primary border border-border-default rounded-[5px] py-[0.35rem] px-[0.5rem] text-sm outline-none focus:border-secondary placeholder:text-secondary"
      :value="filter"
      :placeholder="t('misc.help.filterTopics')"
      autocomplete="off"
      @input="emit('update:filter', ($event.target as HTMLInputElement).value)"
    >
    <div id="help-toc-list">
      <div v-if="status === 'loading'" class="help-loading text-secondary italic p-7 text-center">{{ t('common.loading') }}</div>
      <div v-else-if="status === 'error'" class="help-loading text-secondary italic p-7 text-center">{{ t('misc.help.failedLoadTopics') }}</div>
      <template v-else>
        <div
          v-for="entry in entries"
          :key="entry.topic.file"
          :class="tocItemClass(entry.index === selected)"
          @click="emit('select', entry.index)"
        >{{ entry.topic.title }}</div>
      </template>
    </div>
  </div>
</template>
