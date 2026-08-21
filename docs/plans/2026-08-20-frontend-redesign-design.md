# PBGui Frontend Redesign Design

**Date:** 2026-08-20
**Status:** Approved for implementation planning

## Goal

Modernize PBGui's frontend into a polished, professional, offline-capable Vue platform without breaking existing URLs, API contracts, authentication, localization, legacy fallbacks, or trading/operations behavior.

## Product direction

PBGui should feel like a calm, high-end quantitative operations console:

- Dashboard surfaces system health, exceptions, metrics, and trends in that order.
- Operations pages prioritize scan speed, explicit state, safe asynchronous actions, and useful information density.
- Log pages use an IDE/terminal-like reading experience without decorative motion.
- Visual quality comes from hierarchy, spacing, alignment, typography, semantic color, and consistent interaction states rather than ornamental effects.

The first delivery focuses on the existing Dashboard manager, logging shell/settings, and a staged services monitor migration. A true health-monitoring homepage is explicitly deferred until the existing Dashboard manager is stable.

## Architecture

### Runtime and migration

- Continue with Vue 3, Vite, and strict TypeScript.
- Keep the current Vite MPA architecture and existing page URLs.
- Keep FastAPI as the page/API/static-resource server.
- Use the current strangler migration: new Vue pages can replace legacy pages route-by-route while legacy HTML remains as a fallback where required.
- Keep the shared navigation semantics and URLs; improve its visual treatment and responsive behavior without changing its information architecture in the first slice.
- Keep API contracts, authentication, boot loading, WebSocket/SSE semantics, i18n behavior, and business operations unchanged.

### Styling and component strategy

- Run a Tailwind Spike before broad adoption.
- If the Spike passes, use Tailwind only for new Vue page layout, spacing, responsive behavior, and local composition.
- PBGui semantic CSS tokens remain the visual source of truth for colors, typography, density, radii, shadows, and status meanings.
- Encapsulate core interactions and visual patterns in PBGui components: buttons, icons, status badges, panels, modals, toasts, tables, loading/empty/error states, and connection states.
- Do not introduce a full visual component library as the global design system.
- Run a headless-interaction Spike, with Reka UI as a candidate, only for complex accessible primitives such as modal focus management, popovers, dropdowns, and command menus. Formal adoption requires evidence from the Spike.
- Use a locally bundled icon dependency behind an `AppIcon` abstraction. The concrete icon source is selected during Phase 0 after license, size, tree-shaking, and style review.
- Do not use CDN, remote fonts, or runtime network dependencies.

### State and data flow

- Use page-local refs, computed state, and composables.
- Do not introduce Pinia for the first slice.
- Preserve existing polling, WebSocket, SSE, and iframe boundaries until each seam has a tested replacement.
- Use request IDs/generations and explicit lifecycle ownership so stale responses, callbacks, reconnects, and timers cannot overwrite current state.
- Prefer existing local chart and log implementations in the first slice; do not replace chart engines or the core imperative log viewer at the same time as the shell migration.

## Visual system

### Theme

- Deliver one high-quality dark theme first.
- Define tokens so a future light theme or alternate dark theme can be added without page-level rewrites.
- Use a near-black application background, progressively lighter panel/elevated surfaces, restrained cool-gray borders, and a low-saturation blue/cyan brand accent.
- Use semantic green, amber, red, and neutral/purple-gray statuses.
- Never rely on color alone for status; pair color with text and/or iconography.

### Layout and density

- Use an 8px spacing system with 4px micro-adjustments.
- Use moderate, consistent radii and restrained shadows.
- Dashboard uses comfortable density.
- Operations tables use standard density with a high-density option.
- Logs default to high density with adjustable line height/size where useful.
- Domain pages may specialize their layouts while sharing the global component and token rules.

### Typography and assets

- Use local system font stacks for UI text.
- Use a local monospace stack for logs, timestamps, identifiers, and technical values.
- Use locally bundled SVG icons through `AppIcon`.
- Use existing local chart assets and implementations before evaluating a new chart dependency.

### Motion and feedback

- Allow short transitions for state changes, panel expansion, loading, and operation feedback.
- Do not use persistent decorative animation or continuous flashing.
- Do not animate the log reading surface in ways that interfere with scanning.
- Make loading, empty, stale, offline, reconnecting, pending, success, and failure states explicit.

## First-slice scope

### Phase 0: foundations and Spikes

- Semantic design tokens and global CSS foundations.
- Tailwind isolation/integration Spike.
- Headless interaction Spike.
- `AppIcon` abstraction and local icon audit.
- Minimal reusable Button, Panel, StatusBadge, Modal, Toast, Loading, Empty, Error, and ConnectionState primitives.
- Shared lifecycle-safe API/polling/realtime composables where needed.
- No broad legacy-page rewrite.

### Phase 1: existing `dashboard_main`

Preserve:

- Dashboard list and sorting.
- Search and filtered empty state.
- Query-string selection.
- View/edit mode.
- Create, edit, delete, and template flows.
- Multi-selection, click-drag selection, keyboard selection, Enter, and Space behavior.
- iframe boundary and postMessage save/cancel integration.
- Explicit dialogs and non-click-outside close behavior.

Improve:

- Application shell and page hierarchy.
- Loading, iframe, empty, error, and selected states.
- Responsive behavior and visual consistency.
- Status/feedback components.

### Phase 2: `logging_monitor` shell and settings

- Preserve the existing imperative `LogViewerPanel` initially.
- Improve Vue shell, file/rotated-file selection, settings, purge flow, feedback, and responsive layout.
- Keep the viewer replacement as a separate later risk-controlled slice.

### Phase 3+: `services_monitor`

Migrate vertically while preserving full business behavior:

1. Overview, status polling, action controls, and pending/success/error states.
2. Workers and service logs, reusing the existing Vue log boundary first.
3. PBData, PBCoinData, PBAPIServer settings and tables.
4. Migration and other high-consequence operations last.

### Deferred

- A true health-monitoring homepage with aggregated health, exceptions, metrics, and trends.
- Full replacement of the imperative core log viewer.
- Any chart-engine replacement.
- Full-page freeform Dashboard layout customization.
- Broad cleanup or removal of legacy pages.

## Non-regression rules

- Preserve REST, WebSocket, SSE, auth, and existing URL contracts.
- Preserve English/Simplified Chinese behavior and dictionary parity.
- Preserve offline operation and local assets.
- Preserve business behavior and operation semantics.
- Do not expose tokens, secrets, or session credentials.
- Do not add native alert/confirm dialogs or click-outside-closing high-consequence modals.
- Keep old pages and fallbacks until their route migration is verified.

## Acceptance criteria

- Strict typecheck, frontend tests, build, and i18n parity pass.
- Existing relevant Python route/UI tests pass.
- Old pages and APIs remain available during migration.
- Loading, empty, stale, error, offline, reconnecting, pending, success, and permission-expired states are visible and localizable.
- Stale requests, callbacks, timers, and reconnects cannot overwrite newer state.
- Logs remain usable during continuous updates; manual scrolling is not hijacked.
- All browser assets build and run offline.
- The complete first-slice path can be exercised without changing business outcomes.

## Known repository constraint

The actual branch and frontend migration plan use Vue 3, while older generic instructions still describe a Vanilla JS-only frontend. Before implementation, the authoritative frontend rule must be documented as: Vue 3 MPA is the migration target; legacy Vanilla JS remains compatibility/fallback code during migration.
