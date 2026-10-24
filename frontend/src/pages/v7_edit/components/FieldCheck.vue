<script setup lang="ts">
import FieldLabel from './FieldLabel.vue';
import { Checkbox } from '@/shared/components/ui/checkbox';

/** Checkbox row primitive — the legacy .chk-row (:650-653), on the shared Checkbox chrome. */
const model = defineModel<boolean>({ required: true });
withDefaults(defineProps<{ id: string; label: string; tip?: string }>(), { tip: '' });
</script>

<template>
  <div class="chk-row">
    <Checkbox :id="id" v-model="model" />
    <label :for="id"><FieldLabel :label="label" :tip="tip" /></label>
  </div>
</template>
