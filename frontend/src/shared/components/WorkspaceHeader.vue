<script setup lang="ts">
import { computed, useSlots } from 'vue';

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

const headerBreadcrumbs = computed<readonly BreadcrumbItem[]>(() => {
  if (props.breadcrumbs?.length) return props.breadcrumbs;

  const fallbackBreadcrumbs: BreadcrumbItem[] = [];
  if (props.family && props.family !== props.title) {
    fallbackBreadcrumbs.push({ label: props.family });
  }
  fallbackBreadcrumbs.push({ label: props.title });
  return fallbackBreadcrumbs;
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
