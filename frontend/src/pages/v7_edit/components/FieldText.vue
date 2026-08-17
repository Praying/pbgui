<script setup lang="ts">
/** Text form-group primitive — the legacy text inputs (:633). */
const model = defineModel<string>({ required: true });
withDefaults(defineProps<{ id: string; label: string; tip?: string; placeholder?: string }>(), {
  tip: '',
  placeholder: '',
});
</script>

<template>
  <div class="form-group">
    <label><span v-if="tip" :data-tip="tip">{{ label }}</span><template v-else>{{ label }}</template></label>
    <input :id="id" v-model="model" type="text" :placeholder="placeholder" />
  </div>
</template>
