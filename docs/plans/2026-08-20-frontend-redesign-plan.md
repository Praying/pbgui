# PBGui Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a safe, incremental Vue 3 frontend modernization with a polished dark design system, Tailwind/headless dependency Spikes, and a first operational slice covering Dashboard management, logging shell/settings, and staged services monitoring.

**Architecture:** Keep the existing FastAPI-served Vue MPA and route-by-route strangler migration. New Vue pages use strict TypeScript, composables, semantic PBGui tokens, and locally bundled assets; legacy Vanilla pages remain fallbacks until each route is verified. Preserve current API, auth, i18n, iframe, polling, WebSocket, SSE, and business-operation seams unless a task explicitly adds a tested replacement.

**Tech Stack:** Vue 3, Vite, TypeScript strict, Vitest, Vue Test Utils, vue-i18n, Tailwind CSS only for new Vue layout/composition after Spike approval, optional headless interaction primitives after Spike approval, local SVG icon dependency behind `AppIcon`.

---

## Task 1: Establish the clean baseline and documentation authority

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/.github/copilot-instructions.md` frontend architecture rule only
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/docs/superpowers/plans/2026-08-15-frontend-vue3-migration.md` only where its current migration state is stale
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/docs/plans/2026-08-20-frontend-redesign-design.md`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/docs/plans/2026-08-20-frontend-redesign-plan.md`
- Test: no production test; run read-only status and existing targeted frontend checks

**Step 1: Inspect the pre-existing working-tree change**

Run: `git diff -- AGENTS.md`

Expected: confirm the existing GitNexus count-only edit is not overwritten or mixed into this work.

**Step 2: Update the conflicting frontend instruction narrowly**

Replace the Vanilla-only rule with a statement that Vue 3 + Vite + strict TypeScript MPA is the migration target, while legacy Vanilla JS remains compatibility/fallback code. Do not alter unrelated rules.

**Step 3: Add a migration-plan note**

Record that the repository now contains a mixed Vue/legacy tree and that the approved redesign plan supersedes the original “not yet migrated” assumptions without changing existing page/API behavior.

**Step 4: Run the baseline frontend checks**

Run:

```bash
cd /mnt/quranhdd/projects/crypto_bot/pbgui/frontend
npm ci
npm run typecheck
npm test
npm run build
```

Expected: record the actual result before making implementation changes. If a baseline command fails, stop and report the failure before proceeding with production edits.

**Step 5: Add a changelog entry**

Modify `/mnt/quranhdd/projects/crypto_bot/pbgui/releases/unreleased.md` with a concise note that the approved frontend redesign plan and migration direction were documented. Do not bump `/mnt/quranhdd/projects/crypto_bot/pbgui/api/serial.txt`; no API/startup code is changed.

---

## Task 2: Run the Tailwind, headless, and icon Spikes

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/package.json`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/package-lock.json`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/vite.config.ts` only if the selected CSS integration requires it
- Create/modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/styles/tokens.css`
- Create/modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/styles/base.css`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppIcon.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppIcon.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/InteractionSpike.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/InteractionSpike.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/styles/tailwind-spike.css` only if isolation requires a separate entry
- Test: the new Spike tests plus existing frontend checks

**Step 1: Select local dependencies through an audit**

Evaluate candidate Tailwind, headless, and SVG icon packages for offline build behavior, license, tree-shaking, bundle impact, Vue 3/TypeScript compatibility, and visual fit. Do not add a full visual component library.

**Step 2: Write failing tests for the icon abstraction**

Cover:

- semantic icon name resolution;
- unknown icon behavior;
- size and accessible-label forwarding;
- no direct page dependency on the concrete icon package.

Run: `cd frontend && npx vitest run src/shared/components/AppIcon.test.ts`

Expected: fail because `AppIcon` does not yet exist.

**Step 3: Implement the minimal `AppIcon` wrapper**

Expose a stable PBGui-facing interface. Keep the selected icon package private to the wrapper. Use local bundled assets only.

**Step 4: Write failing interaction Spike tests**

Cover only the proposed complex primitives:

- explicit-close modal;
- Escape handling;
- focus containment/return;
- popover/dropdown keyboard behavior;
- no click-outside close for high-consequence dialogs.

Run: `cd frontend && npx vitest run src/shared/components/InteractionSpike.test.ts`

Expected: fail before the Spike implementation.

**Step 5: Implement the smallest Spike component**

Use the selected headless candidate only if it reduces code and passes the interaction requirements. Keep PBGui visual styles outside the dependency.

**Step 6: Verify Tailwind isolation**

Build one new Vue-only fixture and verify:

- old legacy pages are not changed;
- Preflight does not corrupt existing Vue or legacy styles;
- tokens are available as CSS variables and Tailwind theme values;
- no runtime CDN/network request is needed;
- output remains within an agreed local bundle budget.

**Step 7: Decide Spike outcome**

Record pass/fail decisions in the design plan. If Tailwind or the headless candidate fails, remove it and continue with the existing token/CSS approach; do not retain a half-adopted dependency.

---

## Task 3: Build the minimal PBGui design system primitives

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/styles/tokens.css`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/styles/base.css`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/styles/components.css`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppButton.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppButton.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppPanel.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppPanel.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/StatusBadge.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/StatusBadge.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppModal.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppModal.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppToast.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AppToast.test.ts`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AsyncState.vue`
- Create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/shared/components/AsyncState.test.ts`
- Test: all new component tests plus existing shared component tests

**Step 1: Add failing tests for token-driven rendering**

Verify semantic status variants, explicit text/icon pairing, focus styles, disabled/pending states, and modal close rules.

**Step 2: Implement the smallest token-driven primitives**

Do not create generic abstractions for behavior not used by the first slice. Avoid changing unrelated pages.

**Step 3: Verify component behavior**

Run focused Vitest tests, then the full frontend test suite. Confirm both English and Simplified Chinese labels where user-facing strings are introduced.

**Step 4: Verify visual isolation**

Build and manually inspect only the new Vue pages/fixtures. Confirm old CSS selectors and legacy pages remain unaffected.

---

## Task 4: Migrate `dashboard_main` without changing behavior

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/App.vue`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/components/DashboardList.vue`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/components/NewDashboardDialog.vue`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/components/DeleteDialog.vue`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/components/TemplatesOverlay.vue`
- Modify/create: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/styles/dashboard-main.css`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/dashboard_main/App.test.ts`
- Modify: existing Dashboard component tests as needed
- Test: Dashboard page and component tests, route serving tests, frontend build

**Step 1: Add regression tests for current behavior**

Before changing templates, cover:

- sorting/search and filtered empty state;
- `?current=<name>` selection;
- view/edit mode;
- create/delete/template flows;
- multi-select, drag select, Enter, and Space;
- iframe load state and postMessage actions;
- explicit dialog close behavior.

Run focused tests and verify they pass before production edits.

**Step 2: Replace only the page presentation layer**

Use the approved tokens and primitives. Keep data fetching, iframe boundaries, route URLs, postMessage names, selection semantics, and dialog behavior unchanged.

**Step 3: Add explicit async/empty/error states**

Render stable states for initial load, no dashboards, no search matches, iframe loading, iframe failure, create/delete pending, and operation result.

**Step 4: Verify the route and fallback**

Run the relevant Python route tests and build. Confirm the Vue bundle is served when present and legacy fallback behavior remains correct where applicable.

---

## Task 5: Migrate `logging_monitor` shell and settings while retaining `LogViewerPanel`

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/logging_monitor/App.vue`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/logging_monitor/styles/logging-monitor.css`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/logging_monitor/App.test.ts`
- Keep unchanged initially: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/js/log_viewer_panel.js`
- Test: logging monitor tests, relevant Python route/UI tests, full frontend build

**Step 1: Add regression tests for view switching and log selection**

Cover Log Viewer/Settings switching, current/rotated file selection, purge confirmation, refresh after purge, numeric normalization, save pending/success states, and server-message translation.

**Step 2: Implement the shell visual migration**

Use shared panel, status, modal, toast, loading, and error primitives. Keep the imperative viewer lifecycle deterministic and preserve its current options.

**Step 3: Verify no viewer regression**

Run page tests and inspect the viewer mount/close behavior. Do not rewrite `LogViewerPanel` in this task.

---

## Task 6: Migrate `services_monitor` vertically

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/services_monitor/App.vue`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/services_monitor/services.ts`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/services_monitor/status.ts`
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/services_monitor/resultPopup.ts`
- Modify: relevant components under `/mnt/quranhdd/projects/crypto_bot/pbgui/frontend/src/pages/services_monitor/components/`
- Add tests beside each changed component
- Test: focused services monitor tests, then full frontend and relevant Python UI/API tests

**Step 1: Add regression tests for lifecycle and stale-state protection**

Cover polling start/stop, hash navigation, panel selection, action pending states, stale action responses, WebSocket/log lifecycle, and error/result popup behavior.

**Step 2: Migrate Overview/status first**

Preserve existing endpoints and status normalization. Use shared StatusBadge, AsyncState, Button, Toast, and ConnectionState primitives.

**Step 3: Migrate Workers and logs**

Reuse the existing Vue `LogViewer.vue` seam first. Ensure closing a panel stops polling/streams and stale callbacks cannot revive closed state.

**Step 4: Migrate settings panels**

Handle PBData, PBCoinData, and PBAPIServer one panel at a time. Keep native table behavior and persistence semantics unless a regression test proves a safe presentation-only improvement.

**Step 5: Migrate Migration last**

Keep explicit operation results, restart-pending state, and high-consequence feedback. Preserve all existing safety and confirmation rules.

---

## Task 7: Resolve documentation, changelog, and verification gates

**Files:**
- Modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/releases/unreleased.md`
- Do not modify: `/mnt/quranhdd/projects/crypto_bot/pbgui/api/serial.txt` unless API/startup code is unexpectedly changed
- Review: `/mnt/quranhdd/projects/crypto_bot/pbgui/tests/test_i18n.py`
- Review: relevant `tests/test_*_route.py` and `tests/ui/` files

**Step 1: Run focused frontend checks after each task**

Use the smallest relevant Vitest command first, then:

```bash
cd /mnt/quranhdd/projects/crypto_bot/pbgui/frontend
npm run typecheck
npm test
npm run build
```

**Step 2: Run relevant offline Python tests**

Run only the route/UI tests affected by the changed pages, then the full offline suite if shared runtime or security behavior changed.

**Step 3: Perform visual QA**

Run the built app locally and inspect Dashboard manager, logging shell/settings, and the migrated services slices at the supported desktop viewport sizes. Confirm loading, empty, error, stale, disconnected, pending, success, and responsive states.

**Step 4: Verify GitNexus scope before any commit**

Run the repository's `detect_changes()` check as required by `AGENTS.md`. Confirm only the intended frontend symbols, docs, and changelog paths changed. If a changed symbol was not analyzed before editing, stop and run the required upstream impact analysis before continuing.

**Step 5: Update the changelog**

Add the final concise entry to `/mnt/quranhdd/projects/crypto_bot/pbgui/releases/unreleased.md` before declaring the work complete.

**Step 6: Ask before commit or push**

Do not commit or push automatically. Present the verified diff and ask for explicit approval.

---

## Execution constraints

- Do not edit `pb7/` or PB6 legacy modules.
- Do not change FastAPI routes or API startup code unless a separately approved requirement appears.
- Do not deploy or copy files to any remote host.
- Do not delete legacy pages or `LogViewerPanel` during this first slice.
- Do not claim completion without current test/build output.
- Do not commit without explicit user approval.
