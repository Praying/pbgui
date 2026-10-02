<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import FixedDashboard from './components/FixedDashboard.vue';

const { t } = useI18n();

onMounted(() => {
  document.title = t('dash.pageTitle');
  window.PBGUI_HELP_OPENER = () => {
    window.location.href = '/api/help/main_page?topic=33_dashboard';
  };
});

onUnmounted(() => {
  delete window.PBGUI_HELP_OPENER;
});
</script>

<template>
  <AppShell
    class="core-workbench-shell data-page-shell data-page-shell--dashboard-main"
    page-key="dashboards"
    :page-title="t('dash.dashboards')"
    :page-description="t('dash.fixedOverviewDescription')"
    :status-text="t('dash.liveOverview')"
    status-tone="success"
  >
    <FixedDashboard />
  </AppShell>
</template>

<style scoped>
html,
body {
  overflow: hidden;
}

.data-page-shell--dashboard-main :deep(.app-shell__workspace) {
  min-width: 0;
}

.data-page-shell--dashboard-main :deep(.app-shell__primary) {
  min-height: 0;
  overflow: hidden;
}
</style>
