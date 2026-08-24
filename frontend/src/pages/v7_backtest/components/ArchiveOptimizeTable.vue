<script setup lang="ts">
/**
 * ArchiveOptimizeTable — renderArchiveOptimizeConfigs (:9228-9267):
 * name/owner/config-version/pbgui-version/modified/path columns with a
 * single-row click-select and the dblclick view action (:9258-9266).
 */
import { useI18n } from 'vue-i18n';
import type { ArchiveOptimizeConfigItem } from '../types';

const props = defineProps<{
  configs: readonly ArchiveOptimizeConfigItem[];
  selected: { path: string } | null;
}>();

const emit = defineEmits<{ select: [item: ArchiveOptimizeConfigItem]; open: [item: ArchiveOptimizeConfigItem] }>();

const { t } = useI18n();

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
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
    <table v-else class="tbl">
      <thead>
        <tr>
          <th>{{ t('v7backtest.name') }}</th>
          <th>{{ t('v7backtest.owner') }}</th>
          <th>{{ t('v7backtest.configVersion') }}</th>
          <th>{{ t('v7backtest.pbguiVersion') }}</th>
          <th>{{ t('v7backtest.modified') }}</th>
          <th>{{ t('v7backtest.path') }}</th>
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
          <td>{{ item.name ?? '' }}</td>
          <td>{{ version(item) }}</td>
          <td>{{ item.config_version ?? item.pb7_config_version ?? '' }}</td>
          <td>{{ item.pbgui_version ?? '' }}</td>
          <td>{{ fmtDate(item.modified) }}</td>
          <td class="text-secondary" style="max-width: 360px; word-break: break-all">{{ item.relative_path ?? item.path }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
