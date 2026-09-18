<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import type { VastHostProfile } from '../lib/vastTypes';

const props = defineProps<{
  hosts: VastHostProfile[];
  blockedMachineIds: number[];
  busy: boolean;
}>();

const emit = defineEmits<{
  'set-preference': [machineId: number, field: 'preferred' | 'working', value: boolean];
  'set-block': [machineId: number, blocked: boolean];
}>();

const { t } = useI18n();
const machineId = ref<number | null>(null);
const sortedHosts = computed(() => [...props.hosts].sort((left, right) =>
  Number(right.preferred) - Number(left.preferred) || left.machine_id - right.machine_id));

function blockEnteredMachine(): void {
  const value = Number(machineId.value);
  if (!Number.isSafeInteger(value) || value <= 0) return;
  emit('set-block', value, true);
  machineId.value = null;
}

function statusParts(host: VastHostProfile): string[] {
  return [
    host.used ? t('v7optimize.cloudHostPreviouslyUsed') : t('v7optimize.cloudHostNoRecordedUse'),
    host.working ? t('v7optimize.cloudHostWorking') : '',
    host.preferred ? t('v7optimize.cloudHostPreferred') : '',
  ].filter(Boolean);
}
</script>

<template>
  <section class="grid gap-3 rounded-md border border-border-subtle bg-page/35 p-3">
    <div>
      <h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudHostManagement') }}</h3>
      <p class="mt-1 text-xs leading-5 text-secondary">{{ t('v7optimize.cloudHostManagementHint') }}</p>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <div class="grid min-w-48 gap-1.5">
        <Label for="vast-host-machine-id">{{ t('v7optimize.cloudMachineId') }}</Label>
        <Input
          id="vast-host-machine-id"
          v-model.number="machineId"
          data-test="host-machine-input"
          type="number"
          min="1"
          step="1"
        />
      </div>
      <Button
        type="button"
        variant="danger"
        size="sm"
        data-test="block-machine-submit"
        :disabled="busy || !machineId"
        @click="blockEnteredMachine"
      >{{ t('v7optimize.cloudBlockHost') }}</Button>
    </div>

    <div v-if="sortedHosts.length" class="grid gap-2 md:grid-cols-2">
      <article
        v-for="host in sortedHosts"
        :key="host.machine_id"
        :data-test="`host-${host.machine_id}`"
        class="grid gap-2 rounded-md border border-border-subtle bg-elevated/35 px-3 py-2"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <strong class="text-sm text-primary">{{ t('v7optimize.cloudMachineNumber', { id: host.machine_id }) }}</strong>
            <p class="mt-1 text-xs text-secondary">{{ statusParts(host).join(' · ') }} · {{ t('v7optimize.cloudRentalCount', { count: host.rentals || 0 }) }}</p>
          </div>
          <span v-if="blockedMachineIds.includes(host.machine_id)" class="rounded-full bg-danger/15 px-2 py-1 text-micro font-semibold tracking-label text-danger-soft uppercase">{{ t('v7optimize.cloudHostBlocked') }}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            :data-test="`prefer-host-${host.machine_id}`"
            :disabled="busy"
            @click="emit('set-preference', host.machine_id, 'preferred', !host.preferred)"
          >{{ host.preferred ? t('v7optimize.cloudRemovePreference') : t('v7optimize.cloudPreferHost') }}</Button>
          <Button
            v-if="!host.working_detected"
            type="button"
            variant="default"
            size="sm"
            :disabled="busy"
            @click="emit('set-preference', host.machine_id, 'working', !host.working_marked)"
          >{{ host.working_marked ? t('v7optimize.cloudClearWorking') : t('v7optimize.cloudMarkWorking') }}</Button>
          <Button
            type="button"
            :variant="blockedMachineIds.includes(host.machine_id) ? 'default' : 'danger'"
            size="sm"
            :data-test="`block-host-${host.machine_id}`"
            :disabled="busy"
            @click="emit('set-block', host.machine_id, !blockedMachineIds.includes(host.machine_id))"
          >{{ blockedMachineIds.includes(host.machine_id) ? t('v7optimize.cloudUnblockHost') : t('v7optimize.cloudBlockHost') }}</Button>
        </div>
      </article>
    </div>
    <p v-else class="text-xs text-secondary">{{ t('v7optimize.cloudNoHostHistory') }}</p>

    <div v-if="blockedMachineIds.length" class="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
      <span class="text-xs font-semibold text-secondary">{{ t('v7optimize.cloudBlockedHosts') }}</span>
      <Button
        v-for="blockedId in blockedMachineIds"
        :key="blockedId"
        type="button"
        variant="outline"
        size="sm"
        :data-test="`unblock-host-${blockedId}`"
        :disabled="busy"
        @click="emit('set-block', blockedId, false)"
      >{{ t('v7optimize.cloudUnblockMachine', { id: blockedId }) }}</Button>
    </div>
  </section>
</template>
