# Backtest and Optimize Config Table Visual Design

## Design read

This is a restrained visual unification of two dense PBGui configuration lists for experienced trading operators. It preserves the current graphite theme, compact information density, columns, and page-specific interactions.

Design parameters: `DESIGN_VARIANCE 3`, `MOTION_INTENSITY 2`, `VISUAL_DENSITY 7`.

## Scope

Unify the table presentation on PBv7/PBv8 Backtest Configs and Optimize Configs. Keep sorting, filtering, selection, row actions, data loading, API behavior, and generation-specific columns unchanged.

## Shared table contract

- Both lists use the same bordered, rounded frame with a contained scroll viewport and terminal footer.
- Toolbars share spacing, control height, count treatment, and responsive wrapping.
- Headers share height, graphite background, two-pixel separator, uppercase labels, and compact sort indicators.
- Rows share height, separators, restrained zebra striping, hover feedback, and the PBGui selected-row accent treatment.
- Identifier, exchange, date, and numeric cells use the same hierarchy and alignment across both lists.
- Sticky action rails use the same surface as the row beneath them, including hover and selected states.
- Icon actions share dimensions, border treatment, focus visibility, and spacing while retaining page-specific semantic tones.
- Narrow viewports scroll horizontally instead of compressing columns into unreadable widths.

## Non-goals

- Do not change columns or row actions.
- Do not make the two pages use the same selection implementation.
- Do not extract a new Vue table component.
- Do not change empty-state content, routes, APIs, or persistence.

## Verification

Add focused source and component contracts for the shared modifier classes and table frame. Run both ConfigsPanel test files, the Backtest and Optimize style tests, frontend type checking, and a production build. Visually inspect both pages in populated and selected states at desktop width.
