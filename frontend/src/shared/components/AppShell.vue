<script setup lang="ts">
import { onMounted, ref, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { WORKBENCH_NAVIGATION, type PageSection } from '@/shared/navigation';
import { initAiPageMeta } from '@/shared/ai/context';
import { setupAiDrawerAutoOpen } from '@/shared/ai/drawer';
import StatusStrip from './StatusStrip.vue';
import WorkbenchRail from './WorkbenchRail.vue';
import WorkspaceHeader from './WorkspaceHeader.vue';

const RAIL_STORAGE_KEY = 'pbgui-workbench-rail-collapsed';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

interface AppShellProps {
  pageKey: string;
  pageTitle: string;
  pageDescription?: string;
  pageFamily?: string;
  statusText?: string;
  statusTone?: StatusTone;
  /** Page-internal sections rendered as rail children (accordion). */
  sections?: readonly PageSection[];
  activeSection?: string;
}

const props = withDefaults(defineProps<AppShellProps>(), {
  statusTone: 'neutral',
});

const emit = defineEmits<{
  'update:section': [sectionKey: string];
}>();

const slots = useSlots();
const { t } = useI18n();

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

const railCollapsed = ref(readCollapsedPreference());

/* Install the window.PBGuiAI bridge (page meta + context facade) so the
   shared AI drawer can collect this page's context the same way it does
   on legacy pages, and run the drawer auto-open boot logic
   (?pbgui_ai_action=1 continuation / saved drawer_open preference). */
onMounted(() => {
  initAiPageMeta(props.pageKey, props.pageTitle);
  setupAiDrawerAutoOpen();
});
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--rail-collapsed': railCollapsed }">
    <a class="pbgui-skip-link" href="#app-shell-main">{{ t('nav.skipToMain') }}</a>

    <div class="app-shell__rail-slot">
      <WorkbenchRail
        :groups="WORKBENCH_NAVIGATION"
        :active-page="props.pageKey"
        :collapsed="railCollapsed"
        :sections="props.sections"
        :active-section="props.activeSection"
        @update:collapsed="railCollapsed = $event"
        @update:section="emit('update:section', $event)"
      />
    </div>

    <div class="app-shell__workspace">
      <WorkspaceHeader
        :family="props.pageFamily"
        :title="props.pageTitle"
        :description="props.pageDescription"
      >
        <template v-if="slots.status || props.statusText" #status>
          <slot name="status">
            <StatusStrip
              :label="t('shared.status')"
              :value="props.statusText ?? ''"
              :tone="props.statusTone"
            />
          </slot>
        </template>

        <template v-if="slots['header-actions']" #actions>
          <slot name="header-actions" />
        </template>
      </WorkspaceHeader>

      <main id="app-shell-main" class="app-shell__main" tabindex="-1">
        <section class="app-shell__primary" :aria-label="t('shared.workspace')">
          <slot />
        </section>

        <section
          v-if="slots.supporting"
          class="app-shell__supporting"
          :aria-label="t('shared.supportingInformation')"
        >
          <slot name="supporting" />
        </section>
      </main>
    </div>
  </div>
</template>
