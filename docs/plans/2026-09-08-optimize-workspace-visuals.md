# Optimize Workspace Visuals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give all four Optimize data panels a finished cool-charcoal table surface and replace the lower-right notification with a compact semantic status card.

**Architecture:** Keep the change local to the Optimize Vue page. Add one page-level class to the existing workbench content, use page selectors for the four existing panel table wrappers, and enhance the existing toast markup without changing its state or timeout logic.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS v4, CSS, Vitest, Vue Test Utils, Phosphor icons.

---

### Task 1: Lock the visual contract

**Files:**
- Modify: `frontend/src/pages/v7_optimize/App.styles.test.ts`

1. Add assertions for the Optimize workspace class, shared table-finish selectors, semantic toast classes, status icon rendering, and reduced-motion handling.
2. Run `pnpm test -- App.styles.test.ts` from `frontend/` and confirm the assertions fail before implementation.

### Task 2: Implement the Optimize-wide table surface

**Files:**
- Modify: `frontend/src/pages/v7_optimize/App.vue`

1. Add a local class to the existing workbench content container.
2. Apply the cool-charcoal viewport, bottom breathing room, natural gradient finish, border highlight, and empty-state containment to `.opt-table-wrap` in all four child panels.
3. Preserve existing sticky headers, row selection, scrolling, and responsive table widths.
4. Run the focused style test and four panel component tests.

### Task 3: Implement the compact notification card

**Files:**
- Modify: `frontend/src/pages/v7_optimize/App.vue`

1. Map the existing toast kind to a Phosphor status icon in template markup.
2. Replace the current notification styling with a compact card, semantic rail, icon well, wrapping body, and restrained elevation.
3. Add a short entrance transition and reduced-motion override while preserving the existing four-second timeout and `aria-live` behavior.
4. Run `pnpm test -- App.test.ts App.styles.test.ts` from `frontend/`.

### Task 4: Document and verify

**Files:**
- Modify: `releases/unreleased.md`

1. Add an unreleased entry describing the four-panel table finish, charcoal hierarchy, and compact notification card.
2. Run the focused Optimize tests.
3. Run `pnpm run typecheck` and `pnpm run build` from `frontend/`.
4. Check lints for the edited Vue and test files.
5. Render PBv8 Optimize and visually inspect Configs, Queue, Results, Paretos, empty states, and notifications.
6. Do not commit or push without explicit user approval.
