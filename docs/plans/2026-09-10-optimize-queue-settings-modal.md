# Optimize Queue Settings Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Optimize queue settings dialog more compact by removing the duplicate header close action and reducing header spacing without changing save, cancel, or Escape behavior.

**Architecture:** Keep the existing local modal and event contract. Only adjust `SettingsModal.vue` presentation: the footer remains the single visible discard action, while the page-level Escape handler continues to close the dialog.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind CSS v4 utilities, Vue Test Utils, Vitest.

---

### Task 1: Add focused visual contract coverage

**Files:**
- Create: `frontend/src/pages/v7_optimize/components/SettingsModal.test.ts`

**Step 1: Write the failing test**

Cover that the queue settings dialog:

- does not render the duplicate header close button;
- uses the compact header spacing classes;
- keeps the footer Cancel and Save buttons visible.

**Step 2: Run the focused test**

Run: `cd frontend && pnpm vitest run src/pages/v7_optimize/components/SettingsModal.test.ts`

Expected: FAIL because the current component still renders the header close button and uses the larger header spacing.

### Task 2: Implement the compact dialog header

**Files:**
- Modify: `frontend/src/pages/v7_optimize/components/SettingsModal.vue`

**Step 1: Remove the duplicate visible close action**

Keep the title in the header and remove its Button. Do not add outside-click dismissal.

**Step 2: Reduce header and footer vertical padding**

Use compact, explicit header/footer padding while keeping the existing border, flex alignment, and button behavior.

**Step 3: Run the focused test**

Run: `cd frontend && pnpm vitest run src/pages/v7_optimize/components/SettingsModal.test.ts`

Expected: PASS.

### Task 3: Update the required changelog

**Files:**
- Modify: `releases/unreleased.md`

Add a concise entry describing the duplicate close-action removal and compact queue settings modal header. Preserve all existing user changes in the file.

### Task 4: Verify the affected frontend area

**Step 1: Run focused tests**

Run: `cd frontend && pnpm vitest run src/pages/v7_optimize/components/SettingsModal.test.ts`

Expected: PASS.

**Step 2: Run type checking**

Run: `cd frontend && pnpm run typecheck`

Expected: PASS with zero TypeScript errors.

**Step 3: Review the diff**

Run: `git diff -- frontend/src/pages/v7_optimize/components/SettingsModal.vue frontend/src/pages/v7_optimize/components/SettingsModal.test.ts releases/unreleased.md`

Confirm that only the approved visual changes and their focused coverage are present.
