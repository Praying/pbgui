<script setup lang="ts">
/*
 * Message composer: one rounded field that grows with the draft, the send
 * (or stop) button inside it, and a hint line for the keyboard contract.
 *
 * The textarea keeps its own `#prompt` id because the page and the drawer
 * both key off it, and Enter/Shift+Enter/IME handling is unchanged — see
 * the tests in Composer.test.ts.
 */
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhStop, PhArrowUp } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Textarea } from '@/shared/components/ui/textarea';
import { isImeComposing } from '@/shared/lib/ime';

interface ComposerProps {
  enabled: boolean;
  busy: boolean;
}

const props = defineProps<ComposerProps>();

const draft = defineModel<string>('draft', { default: '' });

const emit = defineEmits<{
  send: [];
  stop: [];
}>();

const { t } = useI18n();

const MAX_HEIGHT = 180;

const field = useTemplateRef<{ focus: () => void } | null>('field');
const root = useTemplateRef<HTMLElement>('root');
const autoHeight = ref(0);

/* Grow to the draft, then scroll inside the field. Measuring scrollHeight is
   the only way to size a wrapping textarea without a hidden mirror node. */
watch(
  () => draft.value,
  async () => {
    await nextTick();
    const el = (root.value?.querySelector('textarea') as HTMLTextAreaElement | null) || null;
    if (!el) return;
    el.style.height = 'auto';
    autoHeight.value = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${autoHeight.value}px`;
  },
);

const remaining = computed(() => 12000 - draft.value.length);
const showCounter = computed(() => remaining.value <= 1000);

function onKeydown(event: KeyboardEvent): void {
  // Enter commits an IME candidate (Chinese/Japanese/Korean input). Sending
  // there would push a half-typed sentence, so the composing keypress is
  // ignored; the user's next Enter, after composition ends, sends.
  // keyCode 229 covers Safari and older Chromium, where isComposing is
  // still false for the keydown that ends composition.
  if (isImeComposing(event)) return;
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    emit('send');
  }
}

function onSend(): void {
  emit('send');
}

onMounted(() => {
  field.value?.focus?.();
});
</script>

<template>
  <div ref="root" class="border-t border-border-subtle bg-sidebar px-[max(18px,calc((100%-920px)/2))] pt-2.5 pb-3">
    <div
      class="flex items-end gap-2 rounded-xl border border-border-default bg-input px-2 py-1.5 transition-colors duration-snap ease-standard focus-within:border-accent"
      :class="props.enabled ? '' : 'opacity-70'"
    >
      <Textarea
        id="prompt"
        ref="field"
        v-model="draft"
        maxlength="12000"
        :placeholder="t('ai.chat.placeholder')"
        :disabled="!props.enabled"
        :rows="1"
        class="composer-field max-h-[180px] min-h-[34px] resize-none border-0! bg-transparent! px-1 py-1 font-sans! text-primary shadow-none focus-visible:border-0!"
        :style="{ height: autoHeight ? `${autoHeight}px` : undefined }"
        @keydown="onKeydown"
      />
      <Button
        v-if="!props.busy"
        id="send"
        type="button"
        variant="primary"
        size="icon"
        class="mb-0.5 size-8 shrink-0 rounded-lg"
        :disabled="!props.enabled || !draft.trim()"
        :title="t('ai.chat.send')"
        :aria-label="t('ai.chat.send')"
        @click="onSend"
      >
        <PbIcon :icon="PhArrowUp" :size="16" />
      </Button>
      <Button
        v-else
        id="stop"
        type="button"
        variant="danger"
        size="icon"
        class="mb-0.5 size-8 shrink-0 rounded-lg"
        :title="t('ai.chat.stop')"
        :aria-label="t('ai.chat.stop')"
        @click="emit('stop')"
      >
        <PbIcon :icon="PhStop" :size="16" />
      </Button>
    </div>

    <div class="mt-1.5 flex items-center justify-between gap-2 text-micro text-secondary">
      <span v-if="!props.enabled">{{ t('ai.chat.composerDisabledHint') }}</span>
      <span v-else>{{ t('ai.chat.composerHint') }}</span>
      <span v-if="showCounter" :class="remaining <= 0 ? 'text-danger' : ''">{{ t('ai.chat.composerCounter', { left: remaining }) }}</span>
    </div>
  </div>
</template>
