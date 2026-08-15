<script setup lang="ts">
/*
 * Generic tag multiselect, ported from the legacy renderPBDataSettings /
 * renderVpsHosts markup in frontend/services_monitor.html: a filter input
 * (legacy filterTags, case-insensitive substring on the trimmed query) plus a
 * .multiselect-wrap of clickable .tag chips whose active/inactive class tracks
 * membership in modelValue. Emissions are normalized to options order with
 * non-option entries dropped — the legacy save handlers collect exactly the
 * rendered tags in DOM order via querySelectorAll('.tag:not(.inactive)').
 *
 * Generic by design: reused for PBData users (this task) and VPS hosts (Task 13);
 * pass filterable=false for the hosts variant which has no filter input.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface Props {
  options: string[];
  modelValue: string[];
  /** Show the filter input (legacy users multiselects); VPS hosts has none. */
  filterable?: boolean;
  /** i18n key for the filter placeholder (legacy sysmon.filterUsers). */
  filterPlaceholderKey?: string;
  /** i18n key for the empty state (legacy sysmon.noUsersFound). */
  emptyKey?: string;
  /** Applied to the .multiselect-wrap div for legacy id-based addressing. */
  id?: string;
}

const props = withDefaults(defineProps<Props>(), {
  filterable: true,
  filterPlaceholderKey: 'sysmon.filterUsers',
  emptyKey: 'sysmon.noUsersFound',
  id: undefined,
});

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const { t } = useI18n();

const query = ref('');

/** Legacy filterTags: show when the query is empty or matches as a substring. */
function matches(option: string): boolean {
  const q = query.value.trim().toLowerCase();
  return !q || option.toLowerCase().includes(q);
}

/** Legacy tag onclick toggle, emitted in options order like the DOM collection. */
function toggle(option: string): void {
  const selected = new Set(props.modelValue);
  if (selected.has(option)) selected.delete(option);
  else selected.add(option);
  emit('update:modelValue', props.options.filter((opt) => selected.has(opt)));
}
</script>

<template>
  <input
    v-if="filterable"
    class="form-input multiselect-filter"
    type="text"
    :placeholder="t(filterPlaceholderKey)"
    v-model="query"
  />
  <div class="multiselect-wrap" :id="id">
    <span v-if="!options.length" class="multiselect-empty">{{ t(emptyKey) }}</span>
    <span
      v-for="option in options"
      v-show="matches(option)"
      :key="option"
      class="tag"
      :class="{ inactive: !modelValue.includes(option) }"
      :data-value="option"
      @click="toggle(option)"
    >{{ option }}</span>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (filter input + tag wrap). -->
<style scoped>
.form-input {
  background: #1a202c; color: #e2e8f0; border: 1px solid #2d3748; border-radius: 5px;
  padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none;
}
.form-input:focus { border-color: #4a5568; }
.multiselect-filter { margin-bottom: 0.35rem; width: 220px; }
.multiselect-wrap { background: #1a202c; border: 1px solid #2d3748; border-radius: 5px; padding: 0.3rem; min-height: 36px; max-height: 160px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 4px; }
.multiselect-empty { color: #4a5568; font-size: var(--fs-xs); }
.tag { display: inline-flex; align-items: center; background: #1e3a5f; border: 1px solid #2563eb; color: #93c5fd; border-radius: 4px; padding: 2px 8px; font-size: var(--fs-xs); cursor: pointer; user-select: none; transition: all 0.1s; }
.tag:hover { background: #1d4ed8; }
.tag.inactive { background: transparent; border-color: #2d3748; color: #64748b; }
.tag.inactive:hover { border-color: #4a5568; color: #94a3b8; }
</style>
