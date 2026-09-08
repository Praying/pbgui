<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/shared/lib/utils';

/**
 * TdActions — the trailing actions cell. Owns the pbgui-list-actions
 * chrome (nowrap + overflow-visible so icon rails never clip) and stops
 * row-level interactions — click, double-click, and drag-select
 * mousedown — from the action rail so row handlers never fire on
 * buttons. The `.pbgui-config-list .pbgui-config-table` specializations
 * in components.css still key off the pbgui-list-actions class.
 */
interface Props {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
</script>

<template>
  <td
    data-slot="td-actions"
    :class="cn('pbgui-list-actions whitespace-nowrap! overflow-visible!', props.class)"
    @click.stop
    @mousedown.stop
  >
    <div class="pbgui-list-actions__group">
      <slot />
    </div>
  </td>
</template>
