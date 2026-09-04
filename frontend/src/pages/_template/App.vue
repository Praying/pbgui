<script setup lang="ts">
/*
 * Page scaffold — copy this directory to pages/<new-page>/ and rename the
 * page-key/title. Includes the pieces every PBGui page is expected to have:
 * AppShell chrome, i18n, document.title, the loading/empty/error triad,
 * and the AI-drawer page context registration.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';

const { t } = useI18n();

type Phase = 'loading' | 'ready' | 'error';
const phase = ref<Phase>('loading');
const errorMessage = ref('');

async function load(): Promise<void> {
  phase.value = 'loading';
  errorMessage.value = '';
  try {
    // TODO: fetch page data here; flip to 'ready' or 'error'.
    phase.value = 'ready';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    phase.value = 'error';
  }
}

useAiPageContext({ id: 'template', getContext: () => ({ section: 'main', entities: [] }) });
onMounted(() => {
  document.title = t('common.loading');
  void load();
});
</script>

<template>
  <AppShell page-key="template" :page-title="t('common.loading')">
    <LoadingSkeleton v-if="phase === 'loading'" :label="t('common.loading')" />
    <ErrorState
      v-else-if="phase === 'error'"
      :title="t('common.error')"
      :message="errorMessage"
      :retry-label="t('market.retry')"
      @retry="load()"
    />
    <EmptyState v-else :title="t('common.noData')" />
  </AppShell>
</template>
