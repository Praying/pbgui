# Vue 3 Workbench Redesign

## Goal

Unify all PBGui Vue 3 pages into a restrained dark trading workbench with clearer hierarchy, stronger data typography, consistent surfaces, and complete interaction states while preserving current behavior and navigation.

## Scope

All Vue 3 page entries under `frontend/src/pages/**/App.vue`, plus shared presentation code under `frontend/src/styles`, `frontend/src/shared/components/AppShell.vue`, and shared UI/workbench primitives where the visual contract is defined. No PB7/PB8 code, API routes, or remote hosts are changed.

## Design direction

Use a graphite base, a single desaturated cyan accent, semantic status colors only for status, local Space Grotesk typography, tabular numerals for data, restrained borders, and a subtle ambient grid. Use shared tokens and components first, then make only small page-level adjustments where existing layout needs the new contract.

## Interaction rules

Keep automatic updates, navigation state restoration, and current page behavior intact. Add or refine hover, pressed, keyboard focus, disabled, loading, empty, and error states through shared components. Do not add manual refresh controls, browser-hosted dependencies, or new modal patterns.

## Verification

Run the Vue workspace build and component tests as appropriate, inspect the real navigation entry points, check the shared shell at narrow and wide sidebar widths, and run GitNexus change detection before considering the redesign complete. Update `releases/unreleased.md`; do not commit without explicit user approval.
