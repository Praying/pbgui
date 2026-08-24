<script setup lang="ts">
/*
 * The distributed Bitget downloaders card — legacy #best1m-distributed-card
 * (market_data_main.html:3381-3388) with renderBest1mDistributedHosts
 * (:7222-7256) and the host click/keyboard handlers (:9324-9346).
 *
 * Bitget-only visibility (:7230-7231); the note text varies by host count
 * (:7236-7243, :7255).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { best1mHostRowClass, noteClass, settingsToggleClass } from '../../lib/uiClasses';
import type { UseBest1m } from '../../composables/useBest1m';

const props = defineProps<{
  store: UseBest1m;
}>();

const { t } = useI18n();

const isBitget = computed(() => props.store.exchange.value === 'bitget'); // :7230
const hosts = computed(() => props.store.distributedHosts.value);
const cardVisible = computed(() => isBitget.value); // :7231 card.hidden = !isBitget
const toggleDisabled = computed(() => !isBitget.value || !hosts.value.length); // :7232
const note = computed(() => {
  if (!isBitget.value) return t('market.distributedOnlyBitget'); // :7236
  if (!hosts.value.length) return t('market.useMasterVps'); // :7242
  return t('market.downloaderSelected', {
    selected: props.store.selectedDistributedHostList.value.length,
    total: hosts.value.length,
  }); // :7255
});

/** Host keyboard activation (:9339-9346) — reuse the click path. */
function onKeydown(event: KeyboardEvent, hostname: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  props.store.toggleDistributedHost(hostname); // row.click() equivalent
}
</script>

<template>
  <div class="best1m-distributed-card grid gap-2 rounded-[10px] border border-accent/16 bg-page/45 p-3" id="best1m-distributed-card" :hidden="!cardVisible">
    <label :class="settingsToggleClass">
      <input
        id="best1m-distributed-enabled"
        class="h-4 w-4 m-0"
        type="checkbox"
        :disabled="toggleDisabled"
        :checked="store.distributedEnabled.value && !!hosts.length"
        @change="store.setDistributedEnabled(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('market.distributeBitgetBackfill') }}</span>
    </label>
    <div class="best1m-host-list grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2" id="best1m-distributed-hosts">
      <button
        v-for="host in store.hostRows.value"
        :key="host.hostname"
        :class="best1mHostRowClass(host.selected)"
        type="button"
        :data-best1m-host="host.hostname"
        :aria-pressed="host.selected ? 'true' : 'false'"
        @click="store.toggleDistributedHost(host.hostname)"
        @keydown="onKeydown($event, host.hostname)"
      >
        <span class="best1m-host-name font-bold">{{ host.hostname }}</span>
        <span class="best1m-host-target overflow-hidden text-ellipsis whitespace-nowrap text-xs text-secondary">{{ host.target }}</span>
      </button>
      <div v-if="isBitget && !hosts.length" class="coin-picker-empty col-span-full p-3 text-base text-secondary">
        {{ t('market.noBitgetDownloaders') }}
      </div>
    </div>
    <span :class="noteClass" id="best1m-distributed-note">{{ note }}</span>
  </div>
</template>
