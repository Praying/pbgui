# Vue 3 Workbench Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade every Vue 3 PBGui page to a coherent dark trading workbench without changing business behavior.

**Architecture:** Centralize visual decisions in the existing Tailwind v4 theme, shared component classes, AppShell, and workbench primitives. Keep page logic and data flows intact, applying page scoped styles only where a page needs layout adaptation.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS v4, scoped SFC CSS, Vitest, pnpm.

---

### Task 1: Establish the shared visual contract

**Files:**
- Modify: `frontend/src/styles/tailwind.css`
- Modify: `frontend/src/styles/components.css`
- Modify: shared UI files under `frontend/src/shared/components/ui/` only when a shared state is missing

**Steps:**
1. Inspect current tokens and shared selectors.
2. Add or refine graphite surface layers, one accent ramp, semantic status ramps, tinted shadows, spacing rhythm, focus ring, tabular numeric utility, and reduced-motion behavior using existing token names where possible.
3. Refine shared panel, toolbar, table, input, button, badge, and empty/loading state styles without changing component APIs.
4. Check for unused rules and preserve legacy aliases.

**Verify:** `cd frontend && pnpm run build`.

### Task 2: Refine the common workbench shell

**Files:**
- Modify: `frontend/src/shared/components/AppShell.vue`
- Modify: `frontend/src/shared/components/WorkspaceHeader.vue`
- Modify: `frontend/src/shared/components/WorkbenchRail.vue`
- Modify: `frontend/src/shared/components/ui/workbench-primitives/*.vue` as needed

**Steps:**
1. Keep navigation, breadcrumbs, slots, and state restoration unchanged.
2. Apply the shared page title/status/action hierarchy and responsive shell spacing.
3. Ensure active navigation, focus-visible, collapsed rail, and narrow viewport states use the shared contract.
4. Keep page-local content responsible for its own data and scrolling.

**Verify:** build and inspect the actual navigation route in the local app.

### Task 3: Apply page-level consistency passes

**Files:**
- Modify only the affected scoped styles/templates in each `frontend/src/pages/**/App.vue` and page components.

**Steps:**
1. Group pages by authentication, dashboards, PB workbench, market/account, operations, and help/template flows.
2. Replace one-off surface, heading, metric, form, and table styles with shared classes or tokens.
3. Add missing composed loading/empty/error presentation where it is already represented by page state.
4. Preserve all request generations, automatic updates, filters, selections, edits, and modal behavior.
5. Confirm no manual refresh controls or external runtime assets are introduced.

**Verify:** run targeted component tests for touched areas and the full Vue build.

### Task 4: Update release notes and cache references

**Files:**
- Modify: `releases/unreleased.md`
- Modify asset version query strings only for changed static assets

**Steps:**
1. Add a concise English release note describing the Vue 3 workbench redesign.
2. Bump only the cache versions for changed frontend assets where the existing delivery path requires it.
3. Do not bump `api/serial.txt` because this is frontend-only.

**Verify:** inspect the diff for API/startup files and confirm no serial bump is needed.

### Task 5: Verify the finished redesign

**Steps:**
1. Run `cd frontend && pnpm test`.
2. Run `cd frontend && pnpm run build`.
3. Run the project’s offline pytest suite if the frontend changes affect shared contracts.
4. Use the real menu path to enter a representative page and verify Guide behavior, sidebar widths, viewport widths around 760px, overflow, and navigation persistence.
5. Run `node .gitnexus/run.cjs detect-changes --scope all --repo .` and inspect affected flows.
6. Report checks and any remaining limitations; ask before committing.
