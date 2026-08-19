# Welcome Page Visual Layout Design

**Date:** 2026-08-19
**Status:** Approved by user

## Goal

Improve the authenticated PBGui welcome page in two passes with the shared migration watermark disabled: first correct the layout and responsive behavior, then refine semantic colors and component detail.

## Layout

- Keep the existing navigation, sidebar, sections, data flow, and interactions unchanged.
- Replace the oversized hero split with a compact overview header followed by a responsive 2×2 status grid.
- Present version, serial, and API origin as metadata directly below the page heading.
- Keep runtime status in a full-width panel below the overview, with fixed label/status columns and a flexible detail column.
- At narrower widths, collapse summary cards to two columns and then one column; collapse the runtime rows to stacked content.

## Visual details

- Keep the shared `MigrationWatermark` component, but close its global build-time switch by default; migration QA can opt in with `VITE_MIGRATION_WATERMARK=on`.
- Add semantic variants for session, PB7, PB8, and identity summary cards.
- Render runtime state values as badges without changing their text or business logic.
- Reduce heavy shadowing and strengthen surface hierarchy with restrained borders and tonal differences.
- Preserve the current dark theme tokens and existing button/form styles outside the overview.

## Verification

- Component tests assert the new overview structure, semantic card variants, status badges, and disabled watermark.
- Run the welcome component tests and the complete frontend build.
- Re-capture the authenticated page and inspect desktop and narrower viewport layouts.
