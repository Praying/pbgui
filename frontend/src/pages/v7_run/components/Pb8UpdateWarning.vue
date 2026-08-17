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
  <div id="pb8-update-warning" class="pb8-update-warning" role="status" v-show="hosts.length > 0">
    <div>
      <strong>{{ t('v7run.pbrunCannotStartPb8') }}</strong>
      <span id="pb8-update-warning-hosts">
        {{ hosts.length ? t('v7run.pb8RuntimeNotReady', { hosts: hosts.join(', ') }) : '' }}
      </span>
    </div>
    <a href="/api/vps-manager/main_page">{{ t('v7run.openVpsManagerUpdatePb8') }}</a>
  </div>
</template>
