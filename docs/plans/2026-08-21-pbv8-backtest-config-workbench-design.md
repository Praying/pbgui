# PBv8 Backtest Config Workbench Design

**Date:** 2026-08-21
**Status:** Approved
**Open Design project:** `pbgui-pbv8-compact-config-workbench`
**Open Design entry:** `index.html`

## Goal

Improve the PBv8 New Backtest Config page into a professional, compact quantitative-workbench interface that makes configuration faster to scan, compare, and edit while preserving the existing API contracts, configuration schema, Vue state bindings, navigation, actions, and PBv7 compatibility.

The change is a focused presentation and disclosure improvement. It does not redesign the backtest workflow or introduce new business behavior.

## Success criteria

- The desktop page shows materially more useful configuration content in the initial viewport than the current card-heavy layout.
- Technical `snake_case` field labels remain fully readable and never overlap at approximately 1024px, 1440px, and 2048px viewport widths.
- Common fields stay immediately visible; low-frequency execution and JSON fields remain discoverable through explicit disclosure controls.
- Long and Short configuration values are aligned for direct comparison and retain textual direction labels in addition to semantic color.
- All existing PBv7/PBv8 editor bindings, validation status, save/queue behavior, handoffs, and keyboard behavior remain unchanged unless explicitly covered by this design.
- The page remains fully offline and uses no external runtime assets.
- Existing English/Simplified Chinese localization rules and EN/DE guide coverage remain valid.

## Scope

### In scope

- `frontend/src/pages/v7_backtest/components/BacktestConfigEditor.vue`
- `frontend/src/pages/v7_backtest/components/BotSideEditor.vue`
- `frontend/src/pages/v7_backtest/styles/backtest-shell.css`
- Focused Vue and stylesheet regression tests for the shared PBv7/PBv8 editor
- Relevant English and German Backtest guide updates if the disclosure behavior changes what users see by default
- English and Simplified Chinese i18n strings required by new disclosure labels or supporting copy

### Out of scope

- API routes or payload changes
- PB8 configuration schema changes
- Save, queue, import, conversion, Run, Strategy Explorer, Balance Calculator, or OHLCV workflow changes
- Global navigation redesign
- Changes to unrelated Backtest panels such as Queue, Results, Archive, or Legacy Results
- New frontend dependencies, hosted fonts, CDN assets, or design-system libraries
- PB7/passivbot source changes

## Approved product direction

The approved direction is a **professional compact quantitative workbench**:

- Data-first rather than card-first.
- Stable grid alignment rather than decorative spacing.
- Restrained blue PBGui branding rather than adopting a generic green terminal theme.
- Moderate existing PBGui radii, thin borders, shallow surface differences, and minimal shadows.
- System UI font for headings and labels; the existing local monospace stack for numeric values and JSON.
- Short, stable interaction feedback with no decorative animation.

The Open Design prototype applies Trading Terminal density principles while intentionally retaining PBGui's existing visual identity.

## Information architecture

The existing five sections remain in their current order:

1. Basic Settings
2. Capital & Execution
3. Market Data
4. Coins & Filters
5. Bot Configuration

The global top navigation, connection banner, main Backtest sidebar, editor-specific action sidebar, and save actions keep their current placement and meaning.

## Page header

Replace the large introductory area with a compact page header containing:

- PBv7/PBv8 version kicker
- New/Edit Backtest Config title
- One-line editor guidance
- Draft or saved-config status

The header must remain visually distinct without consuming a large portion of the initial viewport.

## Section treatment

Each configuration section uses:

- A thin semantic accent at the top edge
- Compact number, title, and one-line hint
- A low-contrast bordered surface
- Reduced padding and vertical gaps
- No large radial gradients or heavy elevation

Section accent colors may distinguish categories, but titles and numbers must continue to communicate identity without relying on color.

## Responsive field grid

The editor continues to use a 12-column desktop grid, with deliberate field spans based on content importance rather than uniform widths.

### Wide desktop

At wide desktop sizes, preserve compact multi-column rows where labels and controls remain readable.

### Medium desktop and tablet landscape

At approximately 1024–1180px available viewport widths:

- The six Capital & Execution summary fields become a deliberate three-column grid.
- Long `snake_case` labels wrap safely using `overflow-wrap: anywhere` or equivalent.
- Labels use a consistent minimum height and top alignment so controls stay on a shared baseline.
- Checkbox/toggle cards allow their label text to wrap without covering status text or neighboring controls.

### Narrow layouts

- Reduce to two columns where practical.
- Collapse to a single column on phone-sized widths.
- Long/Short matrices and bot panels stack while preserving Long-first ordering.

Responsive behavior must be driven by the editor's usable content width, preferably with container queries plus media-query fallback where repository support permits.

## Basic Settings

- Keep Exchanges as the dominant field.
- Keep Config Name adjacent to the date range.
- Present Start Date and End Date as one visually coherent range.
- Preserve the semantic `now` option and all current state behavior.

No duplicate exchange controls or labels are introduced.

## Capital & Execution

### Primary fields

Keep these immediately visible:

- `starting_balance`
- `balance_sample_divider`
- `btc_collateral_cap`
- `btc_collateral_ltv_cap`
- `minimum_coin_age_days`
- `liquidation_threshold`
- `dynamic_wel_by_tradability`

### Advanced execution disclosure

Move low-frequency execution controls into an explicit **Advanced Execution Settings** disclosure while retaining their current bindings:

- Maker fee override
- Taker fee override
- Market-order slippage
- Minimum-effective-cost filter
- HSL signal mode
- Logging level

The disclosure is collapsed for a new configuration and remains keyboard-accessible through a real button with `aria-expanded`. Opening or closing it must not reset values.

## Market Data

- Give `ohlcv_source_dir` the dominant width.
- Keep the PBGui Data path action attached to the path control.
- Align candle interval and gap tolerance in the same compact row where space permits.
- Allow `compress_cache` and `volume_normalization` labels to wrap cleanly within checkbox cards.
- Preserve existing source editors and advanced market fields.

## Coins & Filters

Use a symmetric matrix:

- Market-cap, volume/market-cap, tags, `only_cpt`, and `notices_ignore` remain above the coin matrix.
- Long and Short form two aligned columns.
- Approved and Ignored rows align across both directions.
- Apply Filters remains a clear section-level secondary action.
- Existing searchable multi-select, keyboard selection, tags, clear, and all-selection behavior remain unchanged.

The design must not replace the existing compact multi-column item-selection standard with full-table selection visuals.

## Bot Configuration

Display Long and Short as two parallel strategy panels.

Each panel header includes:

- Explicit Long or Short text label
- Existing semantic color treatment
- `total_wallet_exposure_limit`
- `n_positions`

The complete JSON editor moves into a visible per-side disclosure, collapsed by default for a new configuration. Expanding it reveals the existing textarea, validation/error-line treatment, and parameter-status highlighting without changing parsing or synchronization behavior.

Long and Short identity must never rely on green/red color alone.

Coin Overrides, Suite Mode, Additional Parameters, and Raw JSON remain below the Long/Short panels using their existing components and explicit disclosures.

## State and data flow

The existing parent composable remains the owner of editor state. Presentation components continue to receive state through props and emit the existing update/change events.

No parallel form model is introduced.

```text
useConfigEditor state
    -> BacktestConfigEditor props/v-model bindings
        -> compact section layout and disclosure state
        -> BotSideEditor Long/Short controls and JSON
    -> existing collect/validate/save/save-and-queue paths
```

Disclosure state is page-local UI state only. It is not persisted into the PB8 config and does not affect collection or validation.

## Validation and error handling

- Existing raw JSON, Long JSON, Short JSON, and parameter-status validation remains authoritative.
- A collapsed disclosure containing an error must expose an error indicator in its header so the problem is not hidden.
- Expanding a disclosure must not clear errors or values.
- Existing save and queue error reporting remains unchanged.
- No new native alert or confirmation dialog is introduced.

## Accessibility

- Disclosure headers are real buttons with `aria-expanded` and associated content.
- Existing labels remain associated with their inputs.
- Focus-visible treatment remains clear against the dark background.
- Text and icon labels accompany semantic colors.
- Controls remain keyboard operable.
- Reduced-motion preferences continue to disable nonessential transitions.

## Localization

- Technical configuration field names remain untranslated.
- New interface copy such as Advanced Execution Settings and JSON disclosure labels uses semantic i18n keys.
- English and Simplified Chinese key sets remain identical.
- User data, JSON, configuration values, and logs are not translated.

## Testing

Add or update focused tests to verify:

- The five editor sections and their order remain unchanged.
- The primary Capital & Execution fields remain visible.
- Advanced execution controls exist inside an explicit disclosure and retain values across toggle cycles.
- Long and Short JSON disclosures exist and preserve current bindings and status markup.
- Required action buttons and handoffs remain present and retain saved-config gating.
- CSS contains the intended medium-width three-column protection and safe long-label wrapping.
- PBv7 and PBv8 routes continue to render the shared editor correctly.
- i18n parity remains valid.
- Frontend typecheck, component tests, and production build pass.

## Open Design validation

The first generated prototype was inspected at an approximately 1066×828 viewport. That inspection found overlapping Capital & Execution labels. A second Open Design refinement added an intentional medium-width three-column grid, safe label wrapping, consistent label heights, and checkbox-card protections.

The refined Open Design artifact passed its structural HTML check, CSS brace check, inline JavaScript syntax check, required-field/action/disclosure audit, responsive-rule audit, and remote-resource audit.

## Release and operational impact

This design is frontend-only unless implementation discovers a required API change, which is not expected. A pure frontend implementation does not require an `api/serial.txt` bump. Any change to API startup/runtime code would require a fresh serial bump under the repository rules.
