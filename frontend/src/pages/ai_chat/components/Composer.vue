<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

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
    <Textarea
      id="prompt"
      v-model="draft"
      maxlength="12000"
      :placeholder="t('ai.chat.placeholder')"
      :disabled="!enabled"
      class="max-h-[150px] min-h-[46px]"
      @keydown="onKeydown"
    />
    <Button
      v-if="!busy"
      id="send"
      type="button"
      variant="primary"
      class="h-[46px] min-w-[82px]"
      :disabled="!enabled"
      @click="emit('send')"
    >{{ t('ai.chat.send') }}</Button>
    <Button
      v-else
      id="stop"
      type="button"
      variant="danger"
      class="h-[46px] min-w-[82px]"
      @click="emit('stop')"
    >{{ t('ai.chat.stop') }}</Button>
  </div>
</template>
