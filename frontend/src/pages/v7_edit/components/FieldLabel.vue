<script setup lang="ts">
import { computed } from 'vue';

/**
 * Form-field caption for a raw config key.
 *
 * Labels here are snake_case parameter names (`minimum_coin_age_days`). The
 * group CSS sets `overflow-wrap: anywhere`, which is the right safety net for a
 * name that cannot fit at all, but it also lets the engine split a name at any
 * character, so in a narrow column `MINIMUM_COIN_AGE_DAYS` rendered as
 * `MINIMUM_COIN_AGE_D` / `AYS` (17 of 52 keys at 1440px). A `<wbr>` after each
 * underscore gives the line breaker a real opportunity first, and
 * `overflow-wrap` only applies when none exists, so names now wrap between
 * words. `<wbr>` adds no text, so label text, `for=` wiring and tests are
 * unchanged.
 */
const props = defineProps<{ label: string; tip?: string }>();

/** 'a_b_c' -> ['a_', 'b_', 'c']: each part keeps its trailing underscore. */
const parts = computed(() => props.label.split(/(?<=_)/));
</script>

<template>
  <span v-if="tip" :data-tip="tip"><template v-for="(part, i) in parts" :key="i">{{ part }}<wbr v-if="i < parts.length - 1" /></template></span>
  <template v-else><template v-for="(part, i) in parts" :key="i">{{ part }}<wbr v-if="i < parts.length - 1" /></template></template>
</template>
