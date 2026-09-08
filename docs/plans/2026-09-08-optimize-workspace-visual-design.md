# Optimize Workspace Visual Design

## Design read

This is a restrained redesign of a dense PBGui trading operations workspace. It preserves the existing graphite theme, information architecture, table density, and interactions while improving visual containment and feedback.

Design parameters: `DESIGN_VARIANCE 3`, `MOTION_INTENSITY 2`, `VISUAL_DENSITY 7`.

## Scope

Apply the visual treatment consistently to the Optimize Configs, Queue, Results, and Paretos panels. Keep all fields, sorting, selection, row actions, data loading, and API behavior unchanged.

## Table finish

- Retain a complete rounded border around each table viewport.
- Replace the flat near-black void below short tables with a subtle cool-charcoal surface.
- Add a restrained bottom gradient and inset shadow to establish a natural endpoint without adding a footer or synthetic table row.
- Give empty states the same contained surface treatment so they remain connected to the table header.
- Preserve the sticky dark header, alternating row tone, hover treatment, and standard selected-row accent.

## Background hierarchy

Use three closely related neutral layers within the Optimize workspace: page background, table viewport background, and table row background. The layers should be distinguishable without introducing glass effects, glow, or high-saturation gradients.

## Notifications

Present Optimize notifications as compact status cards in the lower-right corner:

- 280-340px responsive width.
- A narrow semantic status rail and matching Phosphor icon for information, success, and error states.
- Clear body text with wrapping for long messages.
- Strong enough border and elevation to separate the card from table content, without a full semantic-color fill.
- Short fade-and-rise entrance animation, disabled when reduced motion is requested.
- Preserve the current four-second timeout and live-region semantics.

## Verification

Check all four panels with populated and empty data, horizontal and vertical scrolling, selected rows, and long notification text. Run focused Vitest coverage, TypeScript checks, and the production frontend build. Review the rendered PBv8 Optimize page at desktop size.
