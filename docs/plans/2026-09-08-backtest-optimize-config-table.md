# Backtest and Optimize Config Table Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the PBv7/PBv8 Backtest and Optimize configuration tables use one consistent visual contract without changing behavior.

**Architecture:** Add narrowly scoped shared configuration-list modifiers to the existing `pbgui-list-*` primitives. Apply those modifiers in both ConfigsPanel templates, remove conflicting page-local configuration-table paint rules, and retain each page's data-specific markup and interactions.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS v4, shared CSS tokens, Vitest, Vue Test Utils.

---

### Task 1: Lock the shared visual contract

**Files:**
- Modify: `frontend/src/pages/v7_backtest/App.styles.test.ts`
- Modify: `frontend/src/pages/v7_optimize/App.styles.test.ts`
- Modify: `frontend/src/pages/v7_backtest/components/ConfigsPanel.test.ts`
- Modify: `frontend/src/pages/v7_optimize/components/ConfigsPanel.test.ts`

1. Assert that both configuration panels render the same shared frame, viewport, table, cell-role, action, and footer modifiers.
2. Assert that the shared stylesheet owns the configuration-list frame, toolbar, zebra, hover, selected, and sticky-action treatments.
3. Run the focused tests and confirm the new assertions fail before implementation.

### Task 2: Apply the shared configuration-list structure

**Files:**
- Modify: `frontend/src/pages/v7_backtest/components/ConfigsPanel.vue`
- Modify: `frontend/src/pages/v7_optimize/components/ConfigsPanel.vue`

1. Add the common configuration-list root and toolbar modifiers.
2. Put both populated tables inside the same frame and scroll-viewport structure.
3. Add shared cell-role classes for names, exchanges, dates, counts, and actions.
4. Preserve all existing columns, emitted events, sorting, selection, and empty states.

### Task 3: Implement shared table styling and remove conflicts

**Files:**
- Modify: `frontend/src/styles/components.css`
- Modify: `frontend/src/pages/v7_backtest/App.vue`
- Modify: `frontend/src/pages/v7_optimize/App.vue`

1. Add configuration-list modifiers for the frame, toolbar, responsive table width, cell hierarchy, zebra rows, sticky action backgrounds, selection, and terminal footer.
2. Scope every new rule below `.pbgui-config-list` so other shared list tables remain unchanged.
3. Remove only the page-local configuration-table rules that conflict with the shared contract.
4. Run the focused tests and confirm they pass.

### Task 4: Document and verify

**Files:**
- Modify: `releases/unreleased.md`

1. Add an unreleased note covering the visual unification and explicit behavior preservation.
2. Run the focused ConfigsPanel and style tests.
3. Run `pnpm run typecheck` and `pnpm run build` from `frontend/`.
4. Run GitNexus changed-symbol analysis and review the final diff.
5. Visually inspect Backtest Configs and Optimize Configs with unselected and selected rows.
6. Do not commit or push without explicit user approval.
