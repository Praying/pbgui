<script setup lang="ts">
/**
 * The PB8 update warning (v7_run.html:549-552, renderPb8UpdateWarning
 * :770-788): v8-only banner listing the hosts whose validated PB8 runtime
 * is not ready, with the VPS Manager link. Hidden (v-show keeps the DOM
 * node the legacy `hidden` attribute produced) when there are no hosts.
 */
import { useI18n } from 'vue-i18n';

defineProps<{ hosts: string[] }>();

const { t } = useI18n();
</script>

<template>
  <div id="pb8-update-warning" class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/45 bg-warning/10 p-3 text-warning-soft" role="status" v-show="hosts.length > 0">
    <div>
      <strong class="text-warning">{{ t('v7run.pbrunCannotStartPb8') }}</strong>
      <span id="pb8-update-warning-hosts">
        {{ hosts.length ? t('v7run.pb8RuntimeNotReady', { hosts: hosts.join(', ') }) : '' }}
      </span>
    </div>
    <a class="shrink-0 rounded-sm border border-warning/55 bg-warning/14 px-2 py-1 font-semibold text-primary no-underline hover:bg-warning/24" href="/api/vps-manager/main_page">{{ t('v7run.openVpsManagerUpdatePb8') }}</a>
  </div>
</template>
