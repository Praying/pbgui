<script setup lang="ts">
import { computed } from 'vue';
import { PhTrash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';

/**
 * Legacy #del-dash-dialog (dashboard_main.html openDeleteDialog): a quoted
 * name for a single dashboard, dashboardsCount ({count} dashboards) for
 * multi-deletes. Confirm emits the pending list, cancel closes.
 */
const props = defineProps<{
  visible: boolean;
  names: string[];
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const { t } = useI18n();

const confirmName = computed(() =>
  props.names.length === 1
    ? `“${props.names[0] ?? ''}”`
    : t('dash.dashboardsCount', { count: props.names.length })
);

// Legacy markup had a literal "Delete " text node before the name span;
// Vue drops whitespace-only nodes between elements, so the space joins the label.
const deleteLabel = computed(() => `${t('common.delete')} `);
</script>

<template>
  <div id="del-dash-dialog" v-show="visible" role="dialog" aria-labelledby="delete-dash-title">
    <div class="dlg-box">
      <div class="dlg-heading">
        <span class="dlg-icon dlg-icon--danger" aria-hidden="true"><PbIcon :icon="PhTrash" /></span>
        <div id="delete-dash-title" class="dlg-title">{{ t('dash.deleteDashboard') }}</div>
      </div>
      <div id="del-confirm-text">
        <!-- the space after "Delete" lives inside the label span: Vue drops whitespace-only nodes between elements -->
        <span>{{ deleteLabel }}</span><span id="del-confirm-name">{{ confirmName }}</span><span>{{ t('dash.deleteConfirmSuffix') }}</span>
      </div>
      <div class="dlg-actions">
        <button class="dlg-btn secondary" id="del-cancel" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button class="dlg-btn primary del-danger" id="del-ok" @click="emit('confirm')">
          {{ t('common.delete') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Legacy #del-ok inline style: red delete variant. */
.del-danger {
  color: var(--danger);
  border-color: rgb(var(--danger-rgb) / 0.4);
  background: rgb(var(--danger-rgb) / 0.08);
}
</style>
