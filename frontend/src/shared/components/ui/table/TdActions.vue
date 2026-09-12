<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
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
  align?: 'left' | 'center' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  align: 'left',
});

const alignClass = computed(() => {
  if (props.align === 'center') return 'text-center';
  if (props.align === 'right') return 'text-right';
  return 'text-left';
});

const groupAlignClass = computed(() => {
  if (props.align === 'center') return 'justify-center';
  if (props.align === 'right') return 'justify-end';
  return 'justify-start';
});
</script>

<template>
  <td
    data-slot="td-actions"
    :class="cn('pbgui-list-actions whitespace-nowrap! overflow-visible!', alignClass, props.class)"
    @click.stop
    @mousedown.stop
  >
    <div :class="cn('pbgui-list-actions__group', groupAlignClass)">
      <slot />
    </div>
  </td>
</template>
