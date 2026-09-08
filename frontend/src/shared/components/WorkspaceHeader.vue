<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhCheck, PhCopy } from '@phosphor-icons/vue';
import IconButton from './IconButton.vue';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface WorkspaceHeaderProps {
  family?: string;
  title: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  breadcrumbLabel?: string;
}

const props = withDefaults(defineProps<WorkspaceHeaderProps>(), {
  breadcrumbLabel: 'Breadcrumb',
});
const slots = useSlots();

/* useI18n() throws when the component is mounted without the vue-i18n
   plugin (isolated unit tests) — degrade to raw keys in that case. */
let t: (key: string) => string;
try {
  const i18n = useI18n();
  t = (key: string) => i18n.t(key);
} catch {
  t = (key: string) => key;
}

const headerBreadcrumbs = computed<readonly BreadcrumbItem[]>(() => {
  if (props.breadcrumbs?.length) return props.breadcrumbs;

  const fallbackBreadcrumbs: BreadcrumbItem[] = [];
  if (props.family && props.family !== props.title) {
    fallbackBreadcrumbs.push({ label: props.family });
  }
  fallbackBreadcrumbs.push({ label: props.title });
  return fallbackBreadcrumbs;
});

/** Labels joined with '/' — the compact "PBv8/回测/配置" form copied to the clipboard. */
const breadcrumbPath = computed(() =>
  headerBreadcrumbs.value.map((breadcrumb) => breadcrumb.label).join('/'),
);

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyBreadcrumbPath(): Promise<void> {
  const text = breadcrumbPath.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (older browsers / non-secure contexts) —
    // fall back to the legacy textarea + execCommand trick.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* both paths failed — just keep the old icon */
    }
    document.body.removeChild(ta);
  }
  copied.value = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 1500);
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <header class="workspace-header">
    <div class="workspace-header__identity">
      <nav class="workspace-header__breadcrumb" :aria-label="props.breadcrumbLabel">
        <ol class="workspace-header__breadcrumb-list">
          <li
            v-for="(breadcrumb, index) in headerBreadcrumbs"
            :key="`${breadcrumb.label}-${index}`"
            class="workspace-header__breadcrumb-item"
            :aria-current="index === headerBreadcrumbs.length - 1 ? 'page' : undefined"
          >
            <span
              v-if="index > 0"
              class="workspace-header__breadcrumb-separator"
              aria-hidden="true"
            >
              /
            </span>
            <a
              v-if="breadcrumb.href && index < headerBreadcrumbs.length - 1"
              class="workspace-header__breadcrumb-link"
              :href="breadcrumb.href"
            >
              {{ breadcrumb.label }}
            </a>
            <span
              v-else-if="index < headerBreadcrumbs.length - 1"
              class="workspace-header__breadcrumb-ancestor"
            >
              {{ breadcrumb.label }}
            </span>
            <h1 v-else class="workspace-header__title">{{ breadcrumb.label }}</h1>
          </li>
        </ol>
      </nav>
      <IconButton
        class="pbgui-icon-button workspace-header__copy"
        :class="{ 'workspace-header__copy--copied': copied }"
        :icon="copied ? PhCheck : PhCopy"
        :size="13"
        :label="copied ? t('shared.breadcrumb.copied') : t('shared.breadcrumb.copyPath')"
        @click="copyBreadcrumbPath"
      />
      <span class="sr-only" aria-live="polite">
        {{ copied ? t('shared.breadcrumb.copied') : '' }}
      </span>
    </div>

    <div v-if="slots.status || slots.actions" class="workspace-header__utilities">
      <div v-if="slots.status" class="workspace-header__status">
        <slot name="status" />
      </div>
      <div v-if="slots.actions" class="workspace-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
