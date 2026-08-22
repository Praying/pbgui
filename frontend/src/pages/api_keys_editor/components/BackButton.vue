<script setup lang="ts">
/* The teal "← Back" header button every panel uses (e.g. :712, :832, :872). */
import { PhArrowLeft } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';

const emit = defineEmits<{ (e: 'back'): void }>();
const { t } = useI18n();
</script>

<template>
  <button
    class="back-btn"
    style="width:auto; flex-shrink:0; padding:6px 14px; border-radius:5px; border:1px solid #26a69a; background:transparent; color:#26a69a; font-size:var(--fs-sm); cursor:pointer; font-weight:600;"
    @click="emit('back')"
  >
    <PbIcon :icon="PhArrowLeft" /> <slot>{{ t('misc.apikeys.back') }}</slot>
  </button>
</template>
