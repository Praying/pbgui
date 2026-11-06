<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppShell from '@/shared/components/AppShell.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import type { PageSection } from '@/shared/navigation';
import { apiFetch } from '@/shared/api';

interface StorageStatus {
  busy?: boolean;
  scanned_at?: string | null;
  progress?: Record<string, unknown> | null;
  mounts?: MountInfo[];
}

interface MountInfo {
  mount?: string;
  used?: number;
  total?: number;
  free?: number;
  percent?: number;
  roots?: string[];
}

interface StorageSnapshot {
  ready?: boolean;
  roots?: Array<{ id?: string; label?: string; tree?: { size?: number } }>;
  categories?: Array<Record<string, unknown>>;
}

interface StorageHistoryPoint {
  date?: string;
  used?: number;
  total?: number;
}

const activeSection = ref('overview');
const status = ref<StorageStatus | null>(null);
const snapshot = ref<StorageSnapshot | null>(null);
const history = ref<StorageHistoryPoint[]>([]);
const search = ref('');
const days = ref('');
const keep = ref('');
const categoryItems = ref<Record<string, unknown>[]>([]);
const selectedItems = ref<string[]>([]);
const preview = ref<Record<string, unknown> | null>(null);
const error = ref('');
const loading = ref(true);
let pollTimer: ReturnType<typeof setInterval> | undefined;
let generation = 0;

const sections = computed<PageSection[]>(() => [
  { key: 'overview', label: 'Overview' },
  { key: 'cleanup', label: 'Cleanup' },
  { key: 'history', label: 'History' },
  { key: 'system', label: 'System' },
]);

const currentMount = computed(() => status.value?.mounts?.[0] || null);
const filteredCategories = computed(() => {
  const term = search.value.trim().toLowerCase();
  const categories = Array.isArray(snapshot.value?.categories) ? snapshot.value.categories : [];
  if (!term) return categories;
  return categories.filter((category) => JSON.stringify(category).toLowerCase().includes(term));
});

function formatBytes(value: unknown): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex ? 2 : 0)} ${units[unitIndex]}`;
}

function formatAge(value: unknown): string {
  if (!value) return 'Not scanned';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function numberValue(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

async function loadData(includeHistory = false): Promise<void> {
  const requestGeneration = ++generation;
  error.value = '';
  try {
    const [nextStatus, nextSnapshot] = await Promise.all([
      apiFetch<StorageStatus>('/api/storage/status'),
      apiFetch<StorageSnapshot>('/api/storage/snapshot'),
    ]);
    if (requestGeneration !== generation) return;
    status.value = nextStatus;
    snapshot.value = nextSnapshot;
    if (includeHistory || activeSection.value === 'history') {
      const response = await apiFetch<{ history?: StorageHistoryPoint[] }>('/api/storage/history');
      if (requestGeneration === generation) history.value = response.history || [];
    }
  } catch (caught) {
    if (requestGeneration === generation) error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function selectCategory(category: Record<string, unknown>): Promise<void> {
  const categoryId = String(category.id || category.key || '');
  if (!categoryId) return;
  try {
    const response = await apiFetch<{ items?: Record<string, unknown>[] }>(`/api/storage/categories/${encodeURIComponent(categoryId)}/items?days=${encodeURIComponent(days.value || '0')}&keep=${encodeURIComponent(keep.value || '0')}&limit=500`);
    categoryItems.value = response.items || [];
    selectedItems.value = [];
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
}

function toggleItem(item: Record<string, unknown>): void {
  const identifier = String(item.id || item.path || item.name || '');
  if (!identifier) return;
  selectedItems.value = selectedItems.value.includes(identifier)
    ? selectedItems.value.filter((value) => value !== identifier)
    : [...selectedItems.value, identifier];
}

async function createPreview(): Promise<void> {
  if (!selectedItems.value.length) return;
  try {
    preview.value = await apiFetch<Record<string, unknown>>('/api/storage/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selections: selectedItems.value.map((id) => ({ id })) }),
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
}

async function cancelStorageWork(): Promise<void> {
  await apiFetch('/api/storage/cancel', { method: 'POST' });
  await loadData();
}

function selectSection(section: string): void {
  activeSection.value = section;
  if (section === 'history') void loadData(true);
}

onMounted(() => {
  void loadData(true);
  pollTimer = setInterval(() => void loadData(), 5000);
});

onBeforeUnmount(() => {
  generation += 1;
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <AppShell
    class="core-workbench-shell"
    page-key="system_storage"
    page-title="Storage"
    page-family="System"
    :sections="sections"
    :active-section="activeSection"
    @update:section="selectSection"
  >
    <div class="flex min-h-0 flex-1 overflow-y-auto bg-page p-[var(--page-padding)]">
      <div class="mx-auto grid w-full max-w-[1440px] gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="m-0 text-xl font-bold text-primary">Storage</h1>
            <p class="m-0 text-sm text-secondary">Automatic disk usage and cleanup status</p>
          </div>
          <div class="flex items-center gap-2 text-xs text-secondary">
            <span>{{ status?.busy ? 'Working' : 'Updated' }}: {{ formatAge(status?.scanned_at) }}</span>
            <Button v-if="status?.busy" type="button" variant="warning" size="sm" @click="cancelStorageWork">Stop</Button>
          </div>
        </div>

        <ErrorState v-if="error" title="Storage unavailable" :message="error" />
        <LoadingSkeleton v-else-if="loading" label="Loading storage" />

        <template v-else-if="activeSection === 'overview'">
          <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
            <h2 class="m-0 mb-3 text-md font-semibold text-primary">Disk usage</h2>
            <div v-if="currentMount" class="grid gap-2">
              <div class="flex justify-between gap-3 text-sm"><span>{{ currentMount.mount }}</span><strong>{{ Math.round(numberValue(currentMount.percent)) }}% used</strong></div>
              <div class="h-2 overflow-hidden rounded-full bg-input"><div class="h-full rounded-full bg-accent" :style="{ width: `${Math.min(100, numberValue(currentMount.percent))}%` }"></div></div>
              <div class="text-xs text-secondary">{{ formatBytes(currentMount.used) }} of {{ formatBytes(currentMount.total) }} · {{ formatBytes(currentMount.free) }} free</div>
            </div>
            <div v-else class="text-sm text-secondary">Disk usage is unavailable.</div>
          </section>
          <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
            <h2 class="m-0 mb-3 text-md font-semibold text-primary">Storage categories</h2>
            <div class="grid gap-2 md:grid-cols-2">
              <button v-for="category in filteredCategories" :key="String(category.id || category.key)" type="button" class="rounded-md border border-border-subtle bg-input p-3 text-left text-sm text-primary transition-colors hover:border-accent" @click="selectCategory(category)">
                <span class="block font-medium">{{ String(category.label || category.name || category.id || 'Category') }}</span>
                <span class="text-xs text-secondary">{{ formatBytes(category.size) }}</span>
              </button>
              <span v-if="!filteredCategories.length" class="text-sm text-secondary">No categories are available yet.</span>
            </div>
          </section>
        </template>

        <template v-else-if="activeSection === 'cleanup'">
          <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
            <h2 class="m-0 mb-3 text-md font-semibold text-primary">Cleanup</h2>
            <div class="mb-3 grid gap-3 sm:grid-cols-3">
              <Input v-model="search" type="search" aria-label="Search categories" placeholder="Search categories" />
              <Input v-model="days" type="number" min="0" aria-label="Older than days" placeholder="Older than days" />
              <Input v-model="keep" type="number" min="0" aria-label="Keep days" placeholder="Keep days" />
            </div>
            <div class="grid max-h-[420px] gap-1 overflow-y-auto">
              <button v-for="item in categoryItems" :key="String(item.id || item.path || item.name)" type="button" class="rounded-md border p-2 text-left text-sm" :class="selectedItems.includes(String(item.id || item.path || item.name)) ? 'border-accent bg-accent/12 text-primary' : 'border-border-subtle bg-input text-secondary'" @click="toggleItem(item)">
                {{ String(item.path || item.name || item.id || 'Item') }} <span class="float-right">{{ formatBytes(item.size) }}</span>
              </button>
              <span v-if="!categoryItems.length" class="text-sm text-secondary">Select a category above to inspect cleanup candidates.</span>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="primary" :disabled="!selectedItems.length" @click="createPreview">Preview cleanup</Button>
              <span class="text-xs text-secondary">{{ selectedItems.length }} selected</span>
            </div>
            <pre v-if="preview" class="mt-3 max-h-56 overflow-auto rounded-md bg-input p-3 text-xs text-secondary">{{ JSON.stringify(preview, null, 2) }}</pre>
          </section>
        </template>

        <template v-else-if="activeSection === 'history'">
          <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
            <h2 class="m-0 mb-3 text-md font-semibold text-primary">Disk history</h2>
            <div class="grid gap-2">
              <div v-for="point in history" :key="String(point.date)" class="flex justify-between border-b border-border-subtle py-2 text-sm"><span>{{ point.date }}</span><span class="text-secondary">{{ formatBytes(point.used) }} / {{ formatBytes(point.total) }}</span></div>
              <span v-if="!history.length" class="text-sm text-secondary">No history is available yet.</span>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
            <h2 class="m-0 mb-3 text-md font-semibold text-primary">System mounts</h2>
            <div v-for="mount in status?.mounts || []" :key="String(mount.mount)" class="flex justify-between border-b border-border-subtle py-2 text-sm"><span>{{ mount.mount }}</span><span class="text-secondary">{{ formatBytes(mount.free) }} free</span></div>
          </section>
        </template>
      </div>
    </div>
  </AppShell>
</template>
