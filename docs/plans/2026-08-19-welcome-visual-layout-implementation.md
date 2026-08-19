# Welcome Page Visual Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebalance the PBGui welcome overview layout, then improve status color and component detail with the shared migration watermark disabled.

**Architecture:** Keep the existing Vue composable and API flow intact. Limit production changes to the welcome page template and page-scoped CSS, using presentational class variants derived from existing summary/status values.

**Tech Stack:** Vue 3, TypeScript, CSS Grid, Vitest, Vue Test Utils, Vite

---

### Task 1: Lock the new overview structure with tests

**Files:**
- Modify: `frontend/src/pages/welcome/App.test.ts`

1. Add a test asserting the migration watermark is disabled by default.
2. Assert the overview has a compact heading block, metadata strip, four semantic summary cards, and status badges.
3. Run `npm test -- --run frontend/src/pages/welcome/App.test.ts` and verify the new assertions fail for missing structure/classes.

### Task 2: Rework the overview markup

**Files:**
- Modify: `frontend/src/pages/welcome/App.vue`

1. Preserve all existing IDs used by behavior tests.
2. Move metadata into a compact overview heading.
3. Render the four summary cards in a dedicated grid with semantic variant classes.
4. Add a badge class to runtime status values.
5. Keep `MigrationWatermark` mounted, with its shared default switched off.
6. Re-run the focused test and verify it passes.

### Task 3: Implement layout and visual hierarchy

**Files:**
- Modify: `frontend/src/pages/welcome/styles/welcome.css`

1. Replace the hero split rules with a compact header and responsive card grid.
2. Add desktop, medium, and narrow breakpoint behavior.
3. Style semantic summary cards and runtime badges.
4. Reduce heavy panel shadowing and refine borders/background hierarchy.
5. Re-run the focused component test.

### Task 4: Verify and visually inspect

**Files:**
- Generated: `frontend/dist/**` via build

1. Run `npm test -- --run frontend/src/pages/welcome/App.test.ts`.
2. Run `npm run build`.
3. Reload the local server page and capture desktop/narrow screenshots.
4. Run `node .gitnexus/run.cjs detect_changes --scope unstaged` and confirm only expected welcome-page symbols/files are affected.
