<script setup lang="ts">
import { useI18n } from 'vue-i18n';

interface ComposerProps {
  enabled: boolean;
  busy: boolean;
}

defineProps<ComposerProps>();

const draft = defineModel<string>('draft', { default: '' });

const emit = defineEmits<{
  send: [];
  stop: [];
}>();

const { t } = useI18n();

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    emit('send');
  }
}
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] gap-2.5 border-t border-border-default bg-[#0d1521] px-[max(18px,calc((100%-920px)/2))] pt-3 pb-4">
    <textarea
      id="prompt"
      v-model="draft"
      maxlength="12000"
      :placeholder="t('ai.chat.placeholder')"
      :disabled="!enabled"
      class="max-h-[150px] min-h-[46px] resize-y rounded-md border border-border-default bg-[#0b1320] p-3 text-sm text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      @keydown="onKeydown"
    ></textarea>
    <button
      v-if="!busy"
      id="send"
      type="button"
      class="h-[46px] min-w-[82px] cursor-pointer rounded-md border-none bg-accent px-4 text-sm font-bold text-[#07111f] transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45"
      :disabled="!enabled"
      @click="emit('send')"
    >{{ t('ai.chat.send') }}</button>
    <button
      v-else
      id="stop"
      type="button"
      class="h-[46px] min-w-[82px] cursor-pointer rounded-md border-none bg-[rgba(127,29,29,.35)] px-4 text-sm text-[#fecaca] transition-colors hover:border-danger"
      @click="emit('stop')"
    >{{ t('ai.chat.stop') }}</button>
  </div>
</template>
