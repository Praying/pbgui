<script setup lang="ts">
/* The teal "← Back" header button every panel uses (e.g. :712, :832, :872). */
import { PhArrowLeft } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';

const emit = defineEmits<{ (e: 'back'): void }>();
const { t } = useI18n();
</script>

<template>
  <Button type="button" variant="info" size="sm" class="back-btn shrink-0" @click="emit('back')">
    <PbIcon :icon="PhArrowLeft" /> <slot>{{ t('misc.apikeys.back') }}</slot>
  </Button>
</template>
