<script setup lang="ts">
import { computed } from 'vue';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';

/**
 * MultiSelect — the multi-value picker on the ui/select listbox. It replaces
 * native `<select multiple>` elements (and their ctrl-free mousedown toggle
 * hack) in the backtest queue / re-backtest / retest dialogs and the pareto
 * candidate selector:
 * the ui/select listbox runs reka's `multiple` mode, where choosing an
 * option toggles just that option and the list stays open.
 *
 * The model keeps the options' own order, matching what a native
 * `selectedOptions` read returned, so payloads built from it are unchanged.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  options: readonly string[];
  /** DOM id for the trigger so a <Label for> can target it (SelectRoot renders no element). */
  id?: string;
  /** Hook preserved from the native element (`rbt-exchanges`, `arr-exchanges`). */
  dataTest?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
}>();

const model = defineModel<string[]>({ required: true });

const ordered = computed({
  get: () => model.value,
  set: (next: string[]) => {
    const picked = new Set(next);
    model.value = props.options.filter((option) => picked.has(option));
  },
});

const summary = computed(() => model.value.join(', '));
</script>

<template>
  <SelectRoot v-model="ordered" multiple>
    <SelectTrigger :id="id" :data-test="dataTest" :aria-label="ariaLabel" :aria-labelledby="ariaLabelledby" class="h-auto min-h-(--control-height-md) py-1">
      <span :class="summary ? undefined : 'text-placeholder'">{{ summary || '—' }}</span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="option in options" :key="option" :value="option">{{ option }}</SelectItem>
    </SelectContent>
  </SelectRoot>
</template>
