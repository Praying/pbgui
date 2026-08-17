<script setup lang="ts">
/**
 * ResultCharts — the #results-charts area (:6576-6786): renders one
 * ResultSection per result with open icon actions, in table order, and
 * hides itself entirely when nothing is open (:6592-6596). The JSON
 * panels' expanded-state save/restore (:6600-6604, :6748-6764) rides the
 * section components' local state instead of innerHTML scraping.
 */
import ResultSection from './ResultSection.vue';
import type { ResultDataApi, ResultsSection } from '../composables/useResults';
import type { BacktestVersion } from '../types';

defineProps<{
  sections: readonly ResultsSection[];
  version: BacktestVersion;
  dataApi: ResultDataApi;
}>();
</script>

<template>
  <div id="results-charts" :style="sections.length === 0 ? 'display: none' : ''">
    <ResultSection v-for="(section, index) in sections" :key="section.result.path" :section="section" :index="index" :version="version" :data-api="dataApi" />
  </div>
</template>
