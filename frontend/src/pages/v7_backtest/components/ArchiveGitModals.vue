<script setup lang="ts">
/**
 * The archive git-maintenance modals (M-v7-12, the M-v7-11 DEFERRED
 * block): the streaming pull progress modal (:9512-9525, CSS :396-406),
 * the pull results modal (:9578-9587), the git push output
 * (:9660-9665), the compact-history preview + output (:9700-9740) and
 * the setup modal with its README config editor (:9750-9812). All state
 * lives in composables/useArchiveGit.ts; legacy modal bodies are
 * re-rendered as template markup (NO v-html).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { archivePullResultBody, archivePullResultStatus } from '../lib/archiveGitModel';
import type { ArchiveGitStore } from '../composables/useArchiveGit';

const props = defineProps<{ git: ArchiveGitStore }>();
const { t } = useI18n();
const git = props.git;

const statusStyle = computed(() => ({ color: git.pullStatusError.value ? 'var(--red)' : 'var(--text)' }));
</script>

<template>
  <!-- pull progress (:9512-9525) — Hide keeps the stream running -->
  <div v-if="git.pullOpen.value" id="modal-root" data-test="archive-pull-progress-modal">
    <div class="modal-box archive-pull-modal">
      <div class="modal-header">
        <span class="modal-title" data-test="archive-pull-title">{{ git.pullTitle.value }}</span>
        <button type="button" class="modal-close" title="Close" @click="git.hidePull()">✕</button>
      </div>
      <div class="modal-body">
        <div class="archive-pull-progress">
          <div class="archive-pull-head">
            <div v-if="git.pullRunning.value" class="archive-pull-spinner"></div>
            <div>
              <div class="archive-pull-status" data-test="archive-pull-status" :style="statusStyle">{{ git.pullStatus.value }}</div>
              <div class="archive-pull-meta" data-test="archive-pull-elapsed">{{ git.pullElapsedText.value }}</div>
            </div>
          </div>
          <div v-if="git.pullRunning.value" class="archive-pull-bar"></div>
          <pre class="archive-pull-log" data-test="archive-pull-log" aria-live="polite">{{ git.pullLog.value }}</pre>
          <div class="archive-pull-meta">You can hide this window; the pull keeps running.</div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" data-test="archive-pull-hide" @click="git.hidePull()">{{ t('v7backtest.hide') }}</button>
      </div>
    </div>
  </div>

  <!-- pull results (:9578-9587, :9613-9637) -->
  <div v-if="git.pullResults.value" id="modal-root" data-test="archive-pull-results">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">{{ git.pullResults.value.title }}</span>
        <button type="button" class="modal-close" title="Close" @click="git.closePullResults()">✕</button>
      </div>
      <div class="modal-body">
        <div v-if="git.pullResults.value.items.length === 0">No archives.</div>
        <details v-for="(item, i) in git.pullResults.value.items" :key="i" open style="margin-bottom: var(--sp-md)">
          <summary><b>{{ item.name || 'archive' }}</b>: {{ archivePullResultStatus(item) }}</summary>
          <pre class="pull-result-pre">{{ archivePullResultBody(item) }}</pre>
        </details>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" data-test="archive-pull-results-close" @click="git.closePullResults()">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- git push output (:9660-9665) -->
  <div v-if="git.pushOutput.value" id="modal-root" data-test="archive-push-output">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">{{ git.pushOutput.value.title }}</span>
        <button type="button" class="modal-close" title="Close" @click="git.closePushOutput()">✕</button>
      </div>
      <div class="modal-body"><pre class="pull-result-pre">{{ git.pushOutput.value.output }}</pre></div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" data-test="archive-push-close" @click="git.closePushOutput()">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- compact history: preview (:9700-9722) then output (:9734-9740) -->
  <div v-if="git.compactPreview.value" id="modal-root" data-test="archive-compact-preview">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">{{ t('v7backtest.compactArchiveHistory') }}</span>
        <button type="button" class="modal-close" title="Close" @click="git.closeCompactPreview()">✕</button>
      </div>
      <div class="modal-body">
        <p><b>This rewrites remote Git history.</b> It replaces archive history with one root commit and force-pushes using <code>--force-with-lease</code>.</p>
        <p>Normal Git Push remains non-destructive. After compaction, stale clones of this archive must be recloned or reset.</p>
        <div class="compact-estimate-box">
          <div class="sb-label">Estimated Savings</div>
          <div class="compact-savings">
            <template v-if="git.compactPreview.value.view.savings.available">
              {{ git.compactPreview.value.view.savings.human }}
              <span class="muted-line">({{ git.compactPreview.value.view.savings.percent }}%)</span>
            </template>
            <span v-else class="muted-line">Estimate unavailable</span>
          </div>
          <div class="form-row cols-2">
            <div><div class="sb-label">Before</div><b>{{ git.compactPreview.value.view.before }}</b></div>
            <div><div class="sb-label">After Compact</div><b>{{ git.compactPreview.value.view.after }}</b></div>
          </div>
          <p class="muted-line compact-note">{{ git.compactPreview.value.view.note }}</p>
        </div>
        <div class="form-row cols-2">
          <div><div class="sb-label">Archive</div><b>{{ git.compactPreview.value.name }}</b></div>
          <div><div class="sb-label">Branch</div><b>{{ git.compactPreview.value.view.branch }}</b></div>
        </div>
        <div class="form-row cols-2">
          <div><div class="sb-label">Commit Count</div><b>{{ git.compactPreview.value.view.commitCount }}</b></div>
          <div><div class="sb-label">Manifest Items</div><b>{{ git.compactPreview.value.view.manifestItems }}</b></div>
        </div>
        <div class="sb-label">Pending Local Changes</div>
        <pre v-if="git.compactPreview.value.view.hasStatus" class="pull-result-pre">{{ git.compactPreview.value.view.statusText }}</pre>
        <span v-else class="muted-line">Clean working tree</span>
        <div class="sb-label compact-gap-top">Object Size</div>
        <pre class="pull-result-pre">{{ git.compactPreview.value.view.sizeText }}</pre>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" data-test="archive-compact-cancel" @click="git.closeCompactPreview()">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn modal-btn-danger" data-test="archive-compact-confirm" @click="git.confirmCompact()">
          {{ t('v7backtest.compactForcePush') }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="git.compactOutput.value" id="modal-root" data-test="archive-compact-output">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">{{ git.compactOutput.value.title }}</span>
        <button type="button" class="modal-close" title="Close" @click="git.closeCompactOutput()">✕</button>
      </div>
      <div class="modal-body"><pre class="pull-result-pre">{{ git.compactOutput.value.output }}</pre></div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" data-test="archive-compact-output-close" @click="git.closeCompactOutput()">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- setup my archive (:9750-9812) -->
  <div v-if="git.setupOpen.value" id="modal-root" data-test="archive-setup">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">{{ t('v7backtest.setupMyArchive') }}</span>
        <button type="button" class="modal-close" title="Close" @click="git.closeSetup()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label title="Which of your cloned archives is your own (will be used for Git Push).">My Archive</label>
          <select v-model="git.setupForm.value.my_archive" class="sb-input" data-test="setup-arc-name" @change="git.loadReadmeSetup(git.setupForm.value.my_archive)">
            <option value="">(none)</option>
            <option v-for="name in git.setupArchiveNames.value" :key="name" :value="name">{{ name }}</option>
          </select>
        </div>
        <p class="muted-line">Archive paths are generated automatically from each configuration's config_version.</p>
        <div class="form-row cols-2">
          <div class="form-group">
            <label title="Git commit author name.">Username</label>
            <input v-model="git.setupForm.value.username" type="text" class="sb-input" data-test="setup-arc-user" />
          </div>
          <div class="form-group">
            <label title="Git commit author email.">Email</label>
            <input v-model="git.setupForm.value.email" type="text" class="sb-input" data-test="setup-arc-email" />
          </div>
        </div>
        <div class="form-group">
          <label title="GitHub / GitLab personal access token for HTTPS push authentication. Leave empty if SSH keys are used.">Access Token</label>
          <input v-model="git.setupForm.value.access_token" type="password" class="sb-input" placeholder="ghp_..." data-test="setup-arc-token" />
        </div>
        <div class="form-group">
          <label title="Automatically pull all archives in the background every N minutes. Set to 0 to disable.">Auto Pull Interval (min, 0 = off)</label>
          <input v-model="git.setupForm.value.auto_pull_interval" type="number" min="0" step="1" class="sb-input" data-test="setup-arc-interval" style="width: 120px" />
        </div>
        <hr class="sb-sep" />
        <div class="form-group">
          <label title="Title written to the archive README.md on GitHub.">README Title</label>
          <input v-model="git.setupForm.value.readme_title" type="text" class="sb-input" data-test="setup-arc-readme-title" />
        </div>
        <div class="form-group">
          <label title="Static Markdown kept above PBGui generated score tables in README.md.">README Static Markdown</label>
          <textarea
            v-model="git.setupForm.value.readme_static_markdown"
            class="sb-input"
            rows="7"
            placeholder="Describe this archive, strategy rules, exchanges, notes…"
            data-test="setup-arc-readme-static"
          ></textarea>
          <p class="muted-line">Saved in <code>pbgui/readme_config.json</code> and written to <code>README.md</code>. The generated score block stays separate.</p>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" data-test="setup-cancel" @click="git.closeSetup()">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn" data-test="setup-test-push" @click="git.testPush()">{{ t('v7backtest.testPush') }}</button>
        <button type="button" class="modal-btn modal-btn-primary" data-test="setup-save" @click="git.saveSetup()">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>
