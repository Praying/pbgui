<script setup lang="ts">
/** Checkbox row primitive — the legacy .chk-row (:650-653). */
const model = defineModel<boolean>({ required: true });
withDefaults(defineProps<{ id: string; label: string; tip?: string }>(), { tip: '' });
</script>

<template>
  <div class="chk-row">
    <input :id="id" v-model="model" type="checkbox" />
    <label :for="id"><span v-if="tip" :data-tip="tip">{{ label }}</span><template v-else>{{ label }}</template></label>
  </div>
</template>
