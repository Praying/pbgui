# PBv8 Backtest Config Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved Open Design professional compact workbench for the shared PBv7/PBv8 Backtest config editor without changing configuration data, API behavior, or existing handoffs.

**Architecture:** Keep `useConfigEditor` as the single owner of form state and preserve every existing binding/event. Limit behavior changes to page-local disclosure state in `BacktestConfigEditor.vue` and `BotSideEditor.vue`; perform the density and responsive work in the existing Backtest stylesheet. Add focused regression tests before implementation, then update localization, guides, and the unreleased changelog.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vue I18n, existing PBGui CSS tokens, Vitest/Vue Test Utils, Pytest.

---

## Preconditions and repository constraints

- Work on the current `feature/frontend-vue3-migration` branch unless the user explicitly requests a separate worktree.
- Do not modify PB7/passivbot code or any remote host.
- Do not add frontend dependencies or remote assets.
- Do not change API files; no `api/serial.txt` bump is expected for this frontend-only scope.
- Before editing the component functions, retain the recorded GitNexus impact result:
  - `BacktestConfigEditor.vue:touch` — LOW risk, direct file plus `App.vue`, no affected execution flows.
  - `BacktestConfigEditor.vue:foldSuiteDraft` — LOW risk, no upstream impact.
  - `BotSideEditor.vue:syncField` — LOW risk, only `step` upstream.
  - `BotSideEditor.vue:step` — LOW risk, no upstream impact.
- If implementation expands beyond these files/symbols, run a new upstream `impact` analysis before editing and stop to warn the user for HIGH or CRITICAL risk.
- Do not commit or push. After all verification succeeds, ask the user explicitly before any commit or push.
- This host runs Node 26, where Vitest needs an explicit isolated Web Storage backing file. Prefix Vitest commands with `NODE_OPTIONS='--localstorage-file=/tmp/<unique-pbgui-vitest-file>.json'`; without it, baseline tests fail before mounting because `localStorage` is undefined.

### Task 1: Add failing editor disclosure and structure tests

**Files:**
- Modify: `frontend/src/pages/v7_backtest/App.test.ts:232-282`

**Step 1: Extend the compact-editor test with the approved contracts**

Inside `restores the compact editor layout, dropdown behavior and complete action toolbar`, add assertions after the five section assertions:

```ts
const trading = wrapper.find('[data-test="editor-section-trading"]');
const advancedExecution = trading.find('[data-test="advanced-execution-expander"]');
expect(advancedExecution.exists()).toBe(true);
expect(advancedExecution.classes()).not.toContain('open');
expect(advancedExecution.find('[data-test="advanced-execution-expander-toggle"]').attributes('aria-expanded')).toBe('false');
expect(advancedExecution.find('[data-test="cfg-maker-fee-enabled"]').exists()).toBe(false);

await advancedExecution.find('[data-test="advanced-execution-expander-toggle"]').trigger('click');
expect(advancedExecution.classes()).toContain('open');
expect(advancedExecution.find('[data-test="advanced-execution-expander-toggle"]').attributes('aria-expanded')).toBe('true');
expect(advancedExecution.find('#cfg-maker-fee-enabled').exists()).toBe(true);
expect(advancedExecution.find('#cfg-taker-fee-enabled').exists()).toBe(true);
```

Add Long/Short panel and JSON-disclosure assertions near the existing Raw JSON assertions:

```ts
const longPanel = wrapper.find('[data-test="bot-side-long"]');
const shortPanel = wrapper.find('[data-test="bot-side-short"]');
expect(longPanel.exists()).toBe(true);
expect(shortPanel.exists()).toBe(true);
expect(longPanel.text()).toContain('total_wallet_exposure_limit');
expect(shortPanel.text()).toContain('n_positions');

const longJson = longPanel.find('[data-test="bot-json-expander-long"]');
const shortJson = shortPanel.find('[data-test="bot-json-expander-short"]');
expect(longJson.classes()).not.toContain('open');
expect(shortJson.classes()).not.toContain('open');
expect(longPanel.find('[data-test="cfg-bot-long"]').exists()).toBe(false);
expect(shortPanel.find('[data-test="cfg-bot-short"]').exists()).toBe(false);

await longJson.find('[data-test="bot-json-expander-toggle-long"]').trigger('click');
expect(longJson.classes()).toContain('open');
expect(longPanel.find('[data-test="cfg-bot-long"]').exists()).toBe(true);
```

Use existing test helpers and do not add a new mount harness.

**Step 2: Run the focused test and verify it fails**

Run:

```bash
cd frontend && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-components.json' npm test -- src/pages/v7_backtest/App.test.ts
```

Expected: FAIL because the advanced-execution and per-side JSON disclosures do not exist yet.

### Task 2: Add failing responsive stylesheet contracts

**Files:**
- Modify: `frontend/src/pages/v7_backtest/styles/backtest-shell.css.test.ts:8-34`

**Step 1: Add a focused responsive-workbench test**

Add a second test:

```ts
it('protects long technical labels and uses a deliberate medium-width grid', () => {
  expect(css).toContain('container-type: inline-size');
  expect(css).toContain('@container');
  expect(css).toContain('.config-editor-trading-primary');
  expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  expect(css).toContain('overflow-wrap: anywhere');
  expect(css).toContain('.bot-side-panel');
  expect(css).toContain('.bot-side-panel.long');
  expect(css).toContain('.bot-side-panel.short');
  expect(css).toContain('.bot-json-expander');
});
```

Do not assert exact colors or generated pixel values; keep the contract structural.

**Step 2: Run the stylesheet test and verify it fails**

Run:

```bash
cd frontend && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-css.json' npm test -- src/pages/v7_backtest/styles/backtest-shell.css.test.ts
```

Expected: FAIL because the new workbench selectors and container-query protection are absent.

### Task 3: Implement the Capital & Execution disclosure

**Files:**
- Modify: `frontend/src/pages/v7_backtest/components/BacktestConfigEditor.vue:67-71`
- Modify: `frontend/src/pages/v7_backtest/components/BacktestConfigEditor.vue:145-208`

**Step 1: Add page-local disclosure state**

Add one ref beside the existing disclosure refs:

```ts
const advancedExecutionOpen = ref(false);
```

Do not persist this value and do not add it to `BacktestFormState`.

**Step 2: Separate primary and advanced execution controls**

Keep these controls in a primary grid with a dedicated class:

```html
<div class="form-row config-editor-12 config-editor-trading-primary">
  <!-- existing starting_balance through liquidation_threshold fields unchanged -->
</div>

<div class="form-row config-editor-12 config-editor-trading-toggle">
  <!-- existing dynamic_wel_by_tradability binding unchanged -->
</div>
```

Move the existing maker/taker fee overrides, slippage, minimum-effective-cost filter, HSL mode, and logging level into the existing expander pattern:

```html
<div
  class="expander advanced-execution-expander"
  :class="{ open: advancedExecutionOpen }"
  data-test="advanced-execution-expander"
>
  <button
    type="button"
    class="expander-header"
    :aria-expanded="advancedExecutionOpen"
    data-test="advanced-execution-expander-toggle"
    @click="advancedExecutionOpen = !advancedExecutionOpen"
  >
    <span class="arrow">▶</span>
    {{ t('v7backtest.advancedExecutionSettings') }}
  </button>
  <div class="expander-body">
    <div class="form-row config-editor-12 config-editor-trading-advanced">
      <!-- move the existing controls here without changing v-model, ids, steps, options, or handlers -->
    </div>
  </div>
</div>
```

Do not duplicate controls. Keep the existing IDs so API/editor tests and label associations remain stable.

**Step 3: Run the focused component test**

Run:

```bash
cd frontend && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-components.json' npm test -- src/pages/v7_backtest/App.test.ts
```

Expected: the advanced-execution assertions pass; BotSideEditor assertions still fail until Task 4.

### Task 4: Convert Long/Short editors into compact strategy panels

**Files:**
- Modify: `frontend/src/pages/v7_backtest/components/BotSideEditor.vue:1-76`
- Modify: `frontend/src/pages/v7_backtest/components/BotSideEditor.vue:78-136`

**Step 1: Add local JSON disclosure state and error visibility**

Change the Vue import and add local state:

```ts
import { computed, ref, watch } from 'vue';

const jsonOpen = ref(false);
const jsonNeedsReview = computed(() => Boolean(props.errorLine) || hasStatus.value);
```

Do not change `syncField`, `step`, the JSON watcher, or the public props/emits contract.

**Step 2: Replace the anonymous wrapper with a semantic side panel**

Use this structure while preserving the existing controls and bindings:

```html
<div
  class="bot-side-panel"
  :class="{ long, short: !long }"
  :data-test="'bot-side-' + side"
>
  <header class="bot-side-head">
    <div class="bot-side-title">
      <span class="bot-side-direction">{{ t(side === 'long' ? 'v7backtest.long' : 'v7backtest.short') }}</span>
      <span class="bot-side-role">{{ side.toUpperCase() }}</span>
    </div>
  </header>

  <div class="form-row cols-2 bot-side-primary">
    <!-- existing TWE and n_positions controls unchanged -->
  </div>

  <div
    class="expander bot-json-expander"
    :class="{ open: jsonOpen, error: jsonNeedsReview }"
    :data-test="'bot-json-expander-' + side"
  >
    <button
      type="button"
      class="expander-header"
      :aria-expanded="jsonOpen"
      :data-test="'bot-json-expander-toggle-' + side"
      @click="jsonOpen = !jsonOpen"
    >
      <span class="arrow">▶</span>
      {{ t('v7backtest.fullConfigJson') }}
      <span v-if="jsonNeedsReview" class="bot-json-review">{{ t('v7backtest.review') }}</span>
    </button>
    <div class="expander-body">
      <!-- move the existing highlighted pre, textarea, legend, and status surface here unchanged -->
    </div>
  </div>
</div>
```

Keep the textarea's existing `data-test="cfg-bot-long|short"` contract and keep error/status rendering in the DOM only while the disclosure body is open, matching the existing expander behavior.

**Step 3: Run the focused editor test**

Run:

```bash
cd frontend && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-components.json' npm test -- src/pages/v7_backtest/App.test.ts
```

Expected: PASS for the compact-editor and disclosure assertions.

### Task 5: Implement the compact responsive workbench styling

**Files:**
- Modify: `frontend/src/pages/v7_backtest/styles/backtest-shell.css:335-510`
- Modify: `frontend/src/pages/v7_backtest/styles/backtest-shell.css:520-910`

**Step 1: Remove duplicate or conflicting editor presentation rules only where required**

The stylesheet currently contains an older editor block followed by a newer refinement block. Do not refactor unrelated Backtest shell rules. Consolidate only selectors touched by this feature so each modified selector has one authoritative final rule.

**Step 2: Add editor container sizing**

On the editor's usable content container, add:

```css
#configs-editor {
  container-type: inline-size;
  container-name: backtest-editor;
}
```

Preserve the current independent vertical-scroll behavior.

**Step 3: Reduce decorative space while preserving PBGui identity**

Adjust only the editor surfaces:

```css
.config-editor-grid { gap: 12px; }
.config-editor-intro { min-height: 72px; padding: 8px 4px 12px; }
.config-editor-section { padding: 14px 16px 16px; box-shadow: none; }
.config-editor-section-head { margin-bottom: 12px; padding-bottom: 9px; }
#configs-editor .form-row { gap: 10px 12px; margin-bottom: 12px; }
```

Keep the existing dark surfaces, blue focus treatment, moderate radius, and semantic section accents. Do not introduce the Open Design prototype's standalone shell tokens into production CSS.

**Step 4: Protect technical labels**

Add the common label contract:

```css
#configs-editor .form-group > label,
#configs-editor .field-label {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: normal;
}
```

For medium widths, keep label/control baselines aligned:

```css
@container backtest-editor (max-width: 1180px) {
  .config-editor-trading-primary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .config-editor-trading-primary > .editor-span-2 {
    grid-column: span 1;
  }

  .config-editor-trading-primary .form-group > label {
    min-height: 2.5em;
    align-items: flex-start;
  }

  .config-editor-trading-advanced > .editor-span-2,
  .config-editor-trading-advanced > .editor-span-4 {
    grid-column: span 4;
  }
}
```

Add an equivalent `@media (max-width: 1180px)` fallback if the repository's browser support requires it. The fallback must target the same selectors and produce the same three-column result.

**Step 5: Style Long/Short panels without color-only identity**

Add restrained panel rules:

```css
.bot-side-panel {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 9px;
  background: rgba(5, 10, 18, 0.3);
}

.bot-side-panel.long { border-top: 2px solid var(--green); }
.bot-side-panel.short { border-top: 2px solid var(--red); }
.bot-side-head,
.bot-side-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bot-side-direction { color: var(--text); font-weight: 700; }
.bot-side-role { color: var(--text-dim); font: 10px/1 var(--mono, ui-monospace); letter-spacing: .12em; }
.bot-json-review { margin-left: auto; color: var(--yellow, #f0a500); font-size: var(--fs-xs); }
.bot-json-expander.error { border-color: rgba(240, 165, 0, .38); }
```

Keep the existing JSON highlight overlay rules.

**Step 6: Keep the coin filters and long labels stable at narrow widths**

Ensure `.cols-2`, Long/Short panels, checkbox rows, and multi-select controls stack at the existing narrow breakpoint without horizontal overflow. Do not change selection behavior.

**Step 7: Run stylesheet and editor tests**

Run:

```bash
cd frontend && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-focused.json' npm test -- \
  src/pages/v7_backtest/styles/backtest-shell.css.test.ts \
  src/pages/v7_backtest/App.test.ts
```

Expected: PASS.

### Task 6: Add localization and guide coverage

**Files:**
- Modify: `frontend/i18n/en.json`
- Modify: `frontend/i18n/zh.json`
- Modify: `docs/help/35_pbv7_backtest.md`
- Modify: `docs/help_de/35_pbv7_backtest.md`
- Modify: `docs/help/42_pbv8_backtest.md`
- Modify: `docs/help_de/42_pbv8_backtest.md`

**Step 1: Add the one new semantic i18n key**

Add the same key to both dictionaries near the other `v7backtest.editor*` keys:

```json
"v7backtest.advancedExecutionSettings": "Advanced execution settings"
```

```json
"v7backtest.advancedExecutionSettings": "高级执行设置"
```

Reuse existing keys for Long, Short, Full Config JSON, and Review. Do not add duplicate wording.

**Step 2: Update the English guides**

In both PBv7 and PBv8 Backtest guides, update the config-editor description to state:

- Common capital/execution fields remain visible.
- Fee overrides, slippage, minimum-effective-cost filtering, HSL signal mode, and logging level are under Advanced Execution Settings.
- Long/Short TWE and position counts remain visible while Full Config JSON is collapsed by default and exposes review/error status in its header.

Do not document prototype-only toast behavior.

**Step 3: Apply the equivalent German guide updates**

Keep EN/DE topic scope and headings aligned.

**Step 4: Run localization and guide tests**

Run:

```bash
python -m pytest tests/test_i18n.py tests/test_help_coverage.py -q
```

Expected: PASS.

### Task 7: Add changelog entry and complete verification

**Files:**
- Modify: `releases/unreleased.md`

**Step 1: Add an unreleased changelog bullet**

Add a concise bullet under the current Vue 3 Frontend Migration section:

```markdown
- Refined the shared PBv7/PBv8 Backtest config editor into a denser quantitative-workbench layout: common execution fields remain visible, low-frequency execution and per-side JSON controls use explicit accessible disclosures, Long/Short settings align for comparison, and medium-width grids protect long technical labels without changing config bindings or editor actions.
```

Do not bump `api/serial.txt` because the planned changes are frontend/docs/tests only.

**Step 2: Run the focused Vue suite**

Run:

```bash
cd frontend && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-final-focused.json' npm test -- \
  src/pages/v7_backtest/App.test.ts \
  src/pages/v7_backtest/styles/backtest-shell.css.test.ts
```

Expected: PASS.

**Step 3: Run frontend typecheck and full component tests**

Run:

```bash
cd frontend && npm run typecheck && NODE_OPTIONS='--localstorage-file=/tmp/pbgui-vitest-pbv8-full.json' npm test
```

Expected: both commands exit 0.

**Step 4: Run the production build**

Run:

```bash
cd frontend && npm run build
```

Expected: Vue typecheck and Vite production build exit 0. Generated `frontend/dist/` output remains ignored and is not staged.

**Step 5: Run focused Python parity tests**

Run:

```bash
python -m pytest tests/test_i18n.py tests/test_help_coverage.py tests/test_backtest_v7_api.py tests/test_backtest_v8_api.py -q
```

Expected: PASS with no network access and no production runtime-data mutation.

**Step 6: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- \
  frontend/src/pages/v7_backtest/components/BacktestConfigEditor.vue \
  frontend/src/pages/v7_backtest/components/BotSideEditor.vue \
  frontend/src/pages/v7_backtest/styles/backtest-shell.css \
  frontend/src/pages/v7_backtest/App.test.ts \
  frontend/src/pages/v7_backtest/styles/backtest-shell.css.test.ts \
  frontend/i18n/en.json frontend/i18n/zh.json \
  docs/help/35_pbv7_backtest.md docs/help_de/35_pbv7_backtest.md \
  docs/help/42_pbv8_backtest.md docs/help_de/42_pbv8_backtest.md \
  docs/plans/2026-08-21-pbv8-backtest-config-workbench-design.md \
  docs/plans/2026-08-21-pbv8-backtest-config-workbench-plan.md \
  releases/unreleased.md
```

Expected: only the approved editor, tests, localization, guides, plans, and changelog are changed.

**Step 7: Run GitNexus change detection**

Run:

```bash
node .gitnexus/run.cjs detect-changes --scope unstaged
```

If the installed CLI does not accept `--scope unstaged`, run `node .gitnexus/run.cjs detect-changes --help` and use the equivalent working-tree scope. For regression review against the default branch, also run:

```bash
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
```

Expected: changes map only to the shared Backtest editor/component/style/test/documentation surface. Stop and investigate any unrelated execution flow.

**Step 8: Request commit approval**

Report verification results and the final changed-file list. Ask the user explicitly whether to commit. Do not stage, commit, push, deploy, or modify a remote host before that approval.
