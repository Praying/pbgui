<script setup lang="ts">
/**
 * ArchiveOptimizeTable — renderArchiveOptimizeConfigs (:9228-9267):
 * name/owner/config-version/pbgui-version/modified/path columns with a
 * single-row click-select and the dblclick view action (:9258-9266).
 */
import { useI18n } from 'vue-i18n';
import { Table, Th } from '@/shared/components/ui/table';
import type { ArchiveOptimizeConfigItem } from '../types';

const props = defineProps<{
  configs: readonly ArchiveOptimizeConfigItem[];
  selected: { path: string } | null;
}>();

const emit = defineEmits<{ select: [item: ArchiveOptimizeConfigItem]; open: [item: ArchiveOptimizeConfigItem] }>();

const { t } = useI18n();

function fmtDate(iso: string | undefined): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function version(item: ArchiveOptimizeConfigItem): string {
  return String(item.optimize_version || 'v7').toUpperCase();
}

function isSelected(item: ArchiveOptimizeConfigItem): boolean {
  return props.selected?.path === item.path;
}
</script>

<template>
  <div>
    <div v-if="configs.length === 0" class="empty-state px-5 py-15 text-center text-md text-secondary">{{ t('v7backtest.noOptimizeSettings') }}</div>
    <Table v-else class="select-none">
      <thead>
        <tr>
          <Th class="cursor-default">{{ t('v7backtest.name') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.owner') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.configVersion') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.pbguiVersion') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.modified') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.path') }}</Th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in configs"
          :key="item.path"
          :data-path="item.path"
          :data-name="item.name ?? ''"
          :data-version="item.optimize_version || 'v7'"
          :class="{ selected: isSelected(item) }"
          :title="t('v7backtest.dblClickViewConfig')"
          @click="emit('select', item)"
          @dblclick.prevent.stop="emit('open', item)"
        >
          <td class="max-w-[240px] truncate font-medium" :title="item.name ?? ''">{{ item.name ?? '' }}</td>
          <td class="truncate text-secondary">{{ version(item) }}</td>
          <td class="truncate tabular-nums text-secondary">{{ item.config_version ?? item.pb7_config_version ?? '' }}</td>
          <td class="truncate tabular-nums text-secondary">{{ item.pbgui_version ?? '' }}</td>
          <td class="truncate text-xs tabular-nums text-secondary" :title="item.modified ?? ''">{{ fmtDate(item.modified) }}</td>
          <td class="max-w-[360px] break-all text-secondary" :title="item.relative_path ?? item.path">{{ item.relative_path ?? item.path }}</td>
        </tr>
      </tbody>
    </Table>
  </div>
</template>
