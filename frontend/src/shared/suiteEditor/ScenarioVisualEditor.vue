<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';

export interface VisualScenarioWindow {
  id: string;
  role: 'training' | 'holdout';
  label: string;
  start_date: string;
  end_date: string;
  scenario?: Record<string, unknown>;
}

const props = defineProps<{
  windows: VisualScenarioWindow[];
  startDate?: string | null;
  endDate?: string | null;
}>();
const emit = defineEmits<{
  'update:windows': [windows: VisualScenarioWindow[]];
  apply: [];
}>();
const { t } = useI18n();

const orderedWindows = computed(() => [...props.windows].sort((left, right) => {
  return left.start_date.localeCompare(right.start_date) || left.id.localeCompare(right.id);
}));

function updateWindow(id: string, field: 'label' | 'start_date' | 'end_date' | 'role', value: string): void {
  const windows = props.windows.map((window) => window.id === id
    ? { ...window, [field]: value } as VisualScenarioWindow
    : window);
  emit('update:windows', windows);
}

function addWindow(role: VisualScenarioWindow['role']): void {
  const index = props.windows.length + 1;
  const startDate = props.startDate || '';
  const endDate = props.endDate || startDate;
  emit('update:windows', [...props.windows, {
    id: `window_${index}`,
    role,
    label: `${role}_${index}`,
    start_date: startDate,
    end_date: endDate,
  }]);
}

function removeWindow(id: string): void {
  emit('update:windows', props.windows.filter((window) => window.id !== id));
}
</script>

<template>
  <section class="grid gap-3 rounded-lg border border-border-default/70 bg-surface-deep/35 p-3" data-test="suite-visual-window-editor">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <strong class="text-sm font-semibold text-primary">{{ t('editor.suite.visualWindowEditor') }}</strong>
        <p class="mt-1 text-xs leading-relaxed text-secondary">
          {{ t('editor.suite.visualWindowEditorHint', { start: startDate || t('editor.suite.generatorUnset'), end: endDate || t('editor.suite.generatorUnset') }) }}
        </p>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" data-test="suite-visual-add-training" @click="addWindow('training')">{{ t('editor.suite.visualAddTraining') }}</Button>
        <Button type="button" variant="outline" size="sm" data-test="suite-visual-add-holdout" @click="addWindow('holdout')">{{ t('editor.suite.visualAddHoldout') }}</Button>
        <Button type="button" variant="info" size="sm" data-test="suite-visual-apply" :disabled="!orderedWindows.length" @click="emit('apply')">{{ t('editor.suite.visualApply') }}</Button>
      </div>
    </div>

    <div v-if="!orderedWindows.length" class="rounded-md border border-dashed border-border-default/70 px-3 py-4 text-center text-xs text-secondary">
      {{ t('editor.suite.visualNoWindows') }}
    </div>
    <div v-else class="grid gap-2" role="list" :aria-label="t('editor.suite.visualWindowEditor')">
      <div v-for="window in orderedWindows" :key="window.id" class="grid grid-cols-[minmax(120px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px_auto] items-end gap-2 rounded-md border border-border-default/60 bg-page/35 p-2 max-[800px]:grid-cols-1" role="listitem">
        <label class="grid gap-1 text-xs text-secondary">
          <span>{{ t('editor.suite.label') }}</span>
          <Input :model-value="window.label" class="h-8 text-compact" @update:model-value="updateWindow(window.id, 'label', String($event ?? ''))" />
        </label>
        <label class="grid gap-1 text-xs text-secondary">
          <span>{{ t('editor.suite.startDate') }}</span>
          <Input type="date" :model-value="window.start_date" class="h-8 text-compact" @update:model-value="updateWindow(window.id, 'start_date', String($event ?? ''))" />
        </label>
        <label class="grid gap-1 text-xs text-secondary">
          <span>{{ t('editor.suite.endDate') }}</span>
          <Input type="date" :model-value="window.end_date" class="h-8 text-compact" @update:model-value="updateWindow(window.id, 'end_date', String($event ?? ''))" />
        </label>
        <label class="grid gap-1 text-xs text-secondary">
          <span>{{ t('editor.suite.visualRole') }}</span>
          <SelectRoot :model-value="window.role" @update:model-value="updateWindow(window.id, 'role', String($event))">
            <SelectTrigger class="h-8 text-compact"><span>{{ window.role === 'training' ? t('editor.suite.generatorTrain') : t('editor.suite.generatorHoldout') }}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="training">{{ t('editor.suite.generatorTrain') }}</SelectItem>
              <SelectItem value="holdout">{{ t('editor.suite.generatorHoldout') }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </label>
        <Button type="button" variant="ghost" size="sm" class="text-danger-soft" :aria-label="t('editor.suite.remove')" @click="removeWindow(window.id)">{{ t('editor.suite.remove') }}</Button>
      </div>
    </div>
  </section>
</template>
