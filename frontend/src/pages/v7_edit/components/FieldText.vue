<script setup lang="ts">
import { Input } from '@/shared/components/ui/input';

/** Text form-group primitive — the legacy text inputs (:633), on the shared Input chrome. */
const model = defineModel<string>({ required: true });
withDefaults(defineProps<{ id: string; label: string; tip?: string; placeholder?: string }>(), {
  tip: '',
  placeholder: '',
});
</script>

<template>
  <div class="form-group">
    <label :for="id"><span v-if="tip" :data-tip="tip">{{ label }}</span><template v-else>{{ label }}</template></label>
    <Input :id="id" v-model="model" type="text" :placeholder="placeholder" />
  </div>
</template>
