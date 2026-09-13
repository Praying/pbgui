<script setup lang="ts">
/**
 * API-keys log view — header chrome around the shared `LogViewer`.
 *
 * Formerly a standalone Vue port of the legacy LogViewerPanel. The viewer,
 * transport and filtering now live in `@/shared/components/LogViewer.vue`, so
 * this file keeps only the page-specific chrome (back button, title, file
 * chip) plus the API-keys preset set and the PBGui.log default.
 */
import { ref } from 'vue';
import { PhScroll } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import LogViewer from '@/shared/components/LogViewer.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { APIKEYS_PRESETS } from '@/shared/log/logViewerPresets';
import BackButton from './BackButton.vue';
import { wsBase } from '../config';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'back'): void }>();

const { t } = useI18n();

/** Default subscription target; the viewer owns the live selection. */
const DEFAULT_FILE = 'PBGui.log';

const selectedFile = ref(DEFAULT_FILE);

function onFileChange(file: string): void {
  selectedFile.value = file;
}
</script>

<template>
  <div
    id="logPanel"
    v-show="props.visible"
    class="hl-expiry-panel mx-auto mb-5 flex h-[calc(100dvh-100px)] w-[min(100%,1500px)] flex-col rounded-lg border border-border-subtle bg-panel p-4 shadow-sm select-none max-[768px]:p-3"
  >
    <div class="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
      <div class="flex items-center gap-3">
        <BackButton @back="emit('back')" />
        <div class="flex items-center gap-2">
          <h3 class="m-0 flex items-center gap-2 text-lg font-semibold tracking-tight text-primary">
            <PbIcon :icon="PhScroll" class="text-accent" />
            <span>{{ t('misc.apikeys.logs') }}</span>
          </h3>
          <span class="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 font-mono text-xs font-medium text-accent-soft">
            {{ selectedFile }}
          </span>
        </div>
      </div>
    </div>

    <LogViewer
      variant="card"
      :active="props.visible"
      :ws-base="wsBase()"
      :default-file="DEFAULT_FILE"
      :presets="APIKEYS_PRESETS"
      default-preset="apikeys"
      @file-change="onFileChange"
    />
  </div>
</template>
