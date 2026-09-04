<script setup lang="ts">
/**
 * The archive git-maintenance modals (M-v7-12, the M-v7-11 DEFERRED
 * block): the streaming pull progress modal (:9512-9525, CSS :396-406),
 * the pull results modal (:9578-9587), the git push output
 * (:9660-9665), the compact-history preview + output (:9700-9740) and
 * the setup modal with its README config editor (:9750-9812). All state
 * lives in composables/useArchiveGit.ts; legacy modal bodies are
 * re-rendered as template markup (NO v-html).
 *
 * ui-migration: the setup modal's legacy <option value="">(none)</option>
 * reset row has no reka-listbox equivalent — the listbox offers no reset
 * row; the cleared model ('') renders as the trigger label instead.
 */
import { PhX } from '@phosphor-icons/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { archivePullResultBody, archivePullResultStatus } from '../lib/archiveGitModel';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
import type { ArchiveGitStore } from '../composables/useArchiveGit';

const props = defineProps<{ git: ArchiveGitStore }>();
const { t } = useI18n();
const git = props.git;

const statusStyle = computed(() => ({ color: git.pullStatusError.value ? 'var(--red)' : 'var(--text)' }));
</script>

<template>
  <!-- pull progress (:9512-9525) — Hide keeps the stream running -->
  <div v-if="git.pullOpen.value" id="modal-root" :class="modalBackdropClass" data-test="archive-pull-progress-modal">
    <div
      class="archive-pull-modal flex h-[min(680px,88dvh)] min-w-[160px] w-[min(920px,94vw)] max-h-[88dvh] max-w-[94vw] flex-col resize overflow-hidden rounded-lg border border-border-default bg-panel p-5 shadow-modal"
    >
      <div class="mb-3 flex shrink-0 items-center justify-between border-b border-border-default pb-2">
        <span class="text-lg font-semibold" data-test="archive-pull-title">{{ git.pullTitle.value }}</span>
        <Button type="button" variant="ghost" class="h-auto border-0 px-2 py-0.5 text-[1.2rem] text-secondary hover:bg-white/10 hover:text-primary" :title="t('common.close')" :aria-label="t('common.close')" @click="git.hidePull()"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div class="flex h-full min-h-0 flex-col gap-3">
          <div class="flex items-center gap-3">
            <div v-if="git.pullRunning.value" class="archive-pull-spinner h-5 w-5 shrink-0 animate-spin rounded-full border-[3px] border-white/14 border-t-accent"></div>
            <div>
              <div class="text-sm leading-[1.4] text-primary" data-test="archive-pull-status" :style="statusStyle">{{ git.pullStatus.value }}</div>
              <div class="text-xs text-secondary" data-test="archive-pull-elapsed">{{ git.pullElapsedText.value }}</div>
            </div>
          </div>
          <div v-if="git.pullRunning.value" class="archive-pull-bar relative h-2 overflow-hidden rounded-full border border-border-default bg-elevated"></div>
          <pre class="min-h-[180px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-default bg-page p-3 font-mono text-xs leading-[1.45] text-secondary" data-test="archive-pull-log" aria-live="polite">{{ git.pullLog.value }}</pre>
          <div class="text-xs text-secondary">{{ t('v7backtest.gitHideWindowNote') }}</div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn pbgui-action" data-test="archive-pull-hide" @click="git.hidePull()">{{ t('v7backtest.hide') }}</Button>
      </div>
    </div>
  </div>

  <!-- pull results (:9578-9587, :9613-9637) -->
  <div v-if="git.pullResults.value" id="modal-root" :class="modalBackdropClass" data-test="archive-pull-results">
    <div :class="[modalBoxClass, 'shadow-modal']">
      <div class="mb-3 flex shrink-0 items-center justify-between border-b border-border-default pb-2">
        <span class="text-lg font-semibold">{{ git.pullResults.value.title }}</span>
        <Button type="button" variant="ghost" class="h-auto border-0 px-2 py-0.5 text-[1.2rem] text-secondary hover:bg-white/10 hover:text-primary" :title="t('common.close')" :aria-label="t('common.close')" @click="git.closePullResults()"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div v-if="git.pullResults.value.items.length === 0">{{ t('v7backtest.gitNoArchives') }}</div>
        <details v-for="(item, i) in git.pullResults.value.items" :key="i" open style="margin-bottom: var(--sp-md)">
          <summary><b>{{ item.name || 'archive' }}</b>: {{ archivePullResultStatus(item) }}</summary>
          <pre class="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-border-default bg-page p-2 text-xs">{{ archivePullResultBody(item) }}</pre>
        </details>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn pbgui-action" data-test="archive-pull-results-close" @click="git.closePullResults()">{{ t('common.close') }}</Button>
      </div>
    </div>
  </div>

  <!-- git push output (:9660-9665) -->
  <div v-if="git.pushOutput.value" id="modal-root" :class="modalBackdropClass" data-test="archive-push-output">
    <div :class="[modalBoxClass, 'shadow-modal']">
      <div class="mb-3 flex shrink-0 items-center justify-between border-b border-border-default pb-2">
        <span class="text-lg font-semibold">{{ git.pushOutput.value.title }}</span>
        <Button type="button" variant="ghost" class="h-auto border-0 px-2 py-0.5 text-[1.2rem] text-secondary hover:bg-white/10 hover:text-primary" :title="t('common.close')" :aria-label="t('common.close')" @click="git.closePushOutput()"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto"><pre class="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-border-default bg-page p-2 text-xs">{{ git.pushOutput.value.output }}</pre></div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" data-test="archive-push-close" @click="git.closePushOutput()">{{ t('common.close') }}</Button>
      </div>
    </div>
  </div>

  <!-- compact history: preview (:9700-9722) then output (:9734-9740) -->
  <div v-if="git.compactPreview.value" id="modal-root" :class="modalBackdropClass" data-test="archive-compact-preview">
    <div :class="modalBoxClass">
      <div class="mb-3 flex shrink-0 items-center justify-between border-b border-border-default pb-2">
        <span class="text-lg font-semibold">{{ t('v7backtest.compactArchiveHistory') }}</span>
        <Button type="button" variant="ghost" class="h-auto border-0 px-2 py-0.5 text-[1.2rem] text-secondary hover:bg-white/10 hover:text-primary" :title="t('common.close')" :aria-label="t('common.close')" @click="git.closeCompactPreview()"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <p>{{ t('v7backtest.gitCompactIntro') }}</p>
        <p>{{ t('v7backtest.gitCompactIntroNote') }}</p>
        <div class="my-2 rounded-md border border-white/12 bg-white/4 p-2">
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitEstimatedSavings') }}</div>
          <div class="mt-0.5 text-xl font-bold">
            <template v-if="git.compactPreview.value.view.savings.available">
              {{ git.compactPreview.value.view.savings.human }}
              <span class="text-secondary">({{ git.compactPreview.value.view.savings.percent }}%)</span>
            </template>
            <span v-else class="text-secondary">{{ t('v7backtest.gitEstimateUnavailable') }}</span>
          </div>
          <div class="form-row cols-2">
            <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitBefore') }}</div><b>{{ git.compactPreview.value.view.before }}</b></div>
            <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitAfterCompact') }}</div><b>{{ git.compactPreview.value.view.after }}</b></div>
          </div>
          <p class="mt-1 text-secondary">{{ git.compactPreview.value.view.note }}</p>
        </div>
        <div class="form-row cols-2">
          <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitArchive') }}</div><b>{{ git.compactPreview.value.name }}</b></div>
          <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitBranch') }}</div><b>{{ git.compactPreview.value.view.branch }}</b></div>
        </div>
        <div class="form-row cols-2">
          <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitCommitCount') }}</div><b>{{ git.compactPreview.value.view.commitCount }}</b></div>
          <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitManifestItems') }}</div><b>{{ git.compactPreview.value.view.manifestItems }}</b></div>
        </div>
        <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitPendingLocalChanges') }}</div>
        <pre v-if="git.compactPreview.value.view.hasStatus" class="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-border-default bg-page p-2 text-xs">{{ git.compactPreview.value.view.statusText }}</pre>
        <span v-else class="text-secondary">{{ t('v7backtest.gitCleanWorkingTree') }}</span>
        <div class="mt-2 text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitObjectSize') }}</div>
        <pre class="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-border-default bg-page p-2 text-xs">{{ git.compactPreview.value.view.sizeText }}</pre>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" data-test="archive-compact-cancel" @click="git.closeCompactPreview()">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="danger" class="modal-btn" data-test="archive-compact-confirm" @click="git.confirmCompact()">
          {{ t('v7backtest.compactForcePush') }}
        </Button>
      </div>
    </div>
  </div>

  <div v-if="git.compactOutput.value" id="modal-root" :class="modalBackdropClass" data-test="archive-compact-output">
    <div :class="modalBoxClass">
      <div class="mb-3 flex shrink-0 items-center justify-between border-b border-border-default pb-2">
        <span class="text-lg font-semibold">{{ git.compactOutput.value.title }}</span>
        <Button type="button" variant="ghost" class="h-auto border-0 px-2 py-0.5 text-[1.2rem] text-secondary hover:bg-white/10 hover:text-primary" :title="t('common.close')" :aria-label="t('common.close')" @click="git.closeCompactOutput()"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto"><pre class="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-border-default bg-page p-2 text-xs">{{ git.compactOutput.value.output }}</pre></div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" data-test="archive-compact-output-close" @click="git.closeCompactOutput()">{{ t('common.close') }}</Button>
      </div>
    </div>
  </div>

  <!-- setup my archive (:9750-9812) -->
  <div v-if="git.setupOpen.value" id="modal-root" :class="modalBackdropClass" data-test="archive-setup">
    <div :class="modalBoxClass">
      <div class="mb-3 flex shrink-0 items-center justify-between border-b border-border-default pb-2">
        <span class="text-lg font-semibold">{{ t('v7backtest.setupMyArchive') }}</span>
        <Button type="button" variant="ghost" class="h-auto border-0 px-2 py-0.5 text-[1.2rem] text-secondary hover:bg-white/10 hover:text-primary" :title="t('common.close')" :aria-label="t('common.close')" @click="git.closeSetup()"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div class="form-group">
          <label id="setup-arc-name-label" :title="t('v7backtest.gitMyArchiveTitle')">{{ t('v7backtest.gitMyArchive') }}</label>
          <SelectRoot v-model="git.setupForm.value.my_archive" @update:model-value="git.loadReadmeSetup($event)">
            <SelectTrigger data-test="setup-arc-name" aria-labelledby="setup-arc-name-label">
              <span :class="git.setupForm.value.my_archive ? '' : 'text-placeholder'">{{ git.setupForm.value.my_archive || '(none)' }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="name in git.setupArchiveNames.value" :key="name" :value="name">{{ name }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </div>
        <p class="text-secondary">{{ t('v7backtest.gitPathsGeneratedNote') }}</p>
        <div class="form-row cols-2">
          <div class="form-group">
            <label :title="t('v7backtest.gitAuthorNameTitle')">{{ t('v7backtest.gitAuthorName') }}</label>
            <Input v-model="git.setupForm.value.username" type="text" data-test="setup-arc-user" />
          </div>
          <div class="form-group">
            <label :title="t('v7backtest.gitAuthorEmailTitle')">{{ t('v7backtest.gitAuthorEmail') }}</label>
            <Input v-model="git.setupForm.value.email" type="text" data-test="setup-arc-email" />
          </div>
        </div>
        <div class="form-group">
          <label :title="t('v7backtest.gitAccessTokenTitle')">{{ t('v7backtest.gitAccessToken') }}</label>
          <Input v-model="git.setupForm.value.access_token" type="password" placeholder="ghp_..." data-test="setup-arc-token" />
        </div>
        <div class="form-group">
          <label :title="t('v7backtest.gitAutoPullIntervalTitle')">{{ t('v7backtest.gitAutoPullInterval') }}</label>
          <Input v-model="git.setupForm.value.auto_pull_interval" type="number" min="0" step="1" class="w-[120px]" data-test="setup-arc-interval" />
        </div>
        <hr class="sb-sep" />
        <div class="form-group">
          <label title="Title written to the archive README.md on GitHub.">README Title</label>
          <Input v-model="git.setupForm.value.readme_title" type="text" data-test="setup-arc-readme-title" />
        </div>
        <div class="form-group">
          <label title="Static Markdown kept above PBGui generated score tables in README.md.">README Static Markdown</label>
          <Textarea
            v-model="git.setupForm.value.readme_static_markdown"
            rows="7"
            placeholder="Describe this archive, strategy rules, exchanges, notes…"
            data-test="setup-arc-readme-static"
          />
          <p class="text-secondary">{{ t('v7backtest.gitReadmeConfigNote') }}</p>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" data-test="setup-cancel" @click="git.closeSetup()">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="default" class="modal-btn" data-test="setup-test-push" @click="git.testPush()">{{ t('v7backtest.testPush') }}</Button>
        <Button type="button" variant="primary" class="modal-btn" data-test="setup-save" @click="git.saveSetup()">{{ t('common.save') }}</Button>
      </div>
    </div>
  </div>
</template>
