<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import type { OverviewAccount } from '../types';

const props = defineProps<{
  accounts: OverviewAccount[];
  loading: boolean;
  anonymized: boolean;
  refreshMinutes: number;
  message: string;
  formatAmount: (value: unknown) => string;
  formatTime: (value: unknown) => string;
}>();

const emit = defineEmits<{
  select: [name: string];
  refresh: [];
  'update:anonymized': [value: boolean];
  'update:refreshMinutes': [value: number];
}>();

const { t } = useI18n();
const refreshOptions = [5, 15, 30, 60];
const totalAccountsLabel = computed(() => t('profitSweep.overviewAccounts', { count: props.accounts.length }));

function displayName(account: OverviewAccount): string {
  return account.display_name || account.name;
}

function rowTone(account: OverviewAccount): string {
  if (account.level === 'error') return 'text-danger-soft';
  if (account.level === 'warning' || account.stale) return 'text-warning-soft';
  return 'text-primary';
}
</script>

<template>
  <section class="mt-4 rounded-lg border border-border-default bg-panel p-4" data-test="profit-sweep-overview">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-primary">{{ t('profitSweep.overview') }}</h2>
        <p class="mt-1 text-sm text-secondary">{{ t('profitSweep.overviewHint') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-sm text-secondary">
          <Checkbox :model-value="anonymized" @update:model-value="emit('update:anonymized', $event === true)" />
          <span>{{ t('profitSweep.anonymizeAccounts') }}</span>
        </label>
        <SelectRoot :model-value="String(refreshMinutes)" @update:model-value="emit('update:refreshMinutes', Number($event))">
          <SelectTrigger class="w-auto min-w-[120px]" :aria-label="t('profitSweep.refreshInterval')">
            <span>{{ t('profitSweep.refreshMinutes', { count: refreshMinutes }) }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="minutes in refreshOptions" :key="minutes" :value="String(minutes)">
              {{ t('profitSweep.refreshMinutes', { count: minutes }) }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
        <Button size="sm" :loading="loading" @click="emit('refresh')">{{ t('profitSweep.refreshNow') }}</Button>
      </div>
    </div>

    <p v-if="message" class="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning-soft" role="status">{{ message }}</p>
    <div class="mt-3 overflow-auto">
      <table class="w-full min-w-[980px] text-left text-sm" data-test="profit-sweep-overview-table">
        <thead>
          <tr class="border-b-2 border-border-default bg-elevated text-xs uppercase text-secondary">
            <th class="p-2">{{ t('profitSweep.account') }}</th>
            <th class="p-2">{{ t('profitSweep.asset') }}</th>
            <th class="p-2">{{ t('profitSweep.status') }}</th>
            <th class="p-2">{{ t('profitSweep.sourceBalance') }}</th>
            <th class="p-2">{{ t('profitSweep.targetBalance') }}</th>
            <th class="p-2">{{ t('profitSweep.netPnl') }}</th>
            <th class="p-2">{{ t('profitSweep.swept') }}</th>
            <th class="p-2">{{ t('profitSweep.nextCheck') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in accounts"
            :key="account.name"
            class="cursor-pointer border-b border-border-subtle hover:bg-accent/8"
            :class="rowTone(account)"
            tabindex="0"
            @click="emit('select', account.name)"
            @keydown.enter="emit('select', account.name)"
          >
            <td class="p-2 font-semibold">{{ displayName(account) }}</td>
            <td class="p-2">{{ account.asset || '-' }}</td>
            <td class="p-2">{{ account.status || account.mode || '-' }}</td>
            <td class="p-2">{{ formatAmount(account.source_balance) }}</td>
            <td class="p-2">{{ formatAmount(account.target_balance) }}</td>
            <td class="p-2">{{ formatAmount(account.net_pnl) }}</td>
            <td class="p-2">{{ formatAmount(account.swept) }}</td>
            <td class="p-2">{{ formatTime(account.next_check) }}</td>
          </tr>
          <tr v-if="!accounts.length">
            <td colspan="8" class="p-6 text-center text-secondary">{{ t('profitSweep.noOverviewAccounts') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-xs text-secondary">{{ totalAccountsLabel }}</p>
  </section>
</template>
