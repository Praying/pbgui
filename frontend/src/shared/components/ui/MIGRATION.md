# Control Migration Playbook — legacy controls → `ui/` layer

The standard (AGENTS.md §"Vue 3 form controls"): every form control on a Vue 3
page uses the shared shadcn-vue-style components in
`frontend/src/shared/components/ui/`. They are styled from the `@theme` tokens
only, so the migrated control renders the same visual language as the legacy
classes it replaces. This document is the mechanical contract for migrating a
page. Follow it exactly; deviate only where a section below says you may.

## Component mapping

| Legacy pattern | Replace with |
|---|---|
| `<button class="btn …">`, `pbgui-btn`, `sb-btn`, ad-hoc Tailwind button strings, per-page `btnClass()` helpers | `<Button variant="…" size="…">` |
| `<input type="text|number|password|date|search|url">` | `<Input>` (`size` matches Button: `sm` h-7, default h-8, `lg` h-9.5) |
| `<textarea>` | `<Textarea>` (mono stack is built in — drop hand-written `font-[…]` stacks) |
| `<label>` + form control in a vertical field | `<Label for>` (uppercase-xs standard) or `<Field label hint error>` scaffold |
| `<select>` | `SelectRoot` + `SelectTrigger` + `SelectContent` + `SelectItem` (reka-ui listbox) |
| `<input type="checkbox">` (option semantics) | `<Checkbox v-model="bool">` |
| checkbox/label used as an on/off toggle | `<Switch v-model="bool">` |
| `<input type="radio">` group | `<RadioGroup>` + `<RadioGroupItem>` |
| `<input type="range">` | `<Slider>` |
| loading spinner + disabled button | `<Button :loading="…">` (built-in spinner + `aria-busy`) |

Variant mapping for buttons: `btn-primary`/`accent` → `primary`, `btn-secondary` → `secondary`,
`btn-info`/soft-accent tones → `info`, `btn-success` → `success`, `btn-warning`/`warn` → `warning`,
`btn-danger` → `danger`, borderless quiet buttons → `ghost`, framed transparent → `outline`.
Heights: `--control-height-sm` 28px → `size="sm"`, 32px → default, 38px → `size="lg"`,
square icon-only → `size="icon"`.

## Hard rules

1. **Preserve every `id` and test-selected hook class.** ids fall through to the
   rendered element on all ui/ components. Keep inert anchor classes that tests
   or other pages select (`.summary-action`, `.save-settings-btn`, `.browse-btn`,
   `.act-btn`, page-specific hooks) via the `class` prop.
2. **Drop live styling classes** once the component owns the chrome: `.btn`,
   `.pbgui-btn`, `.btn-primary/.btn-secondary/…`, `.form-input`, `.form-select`,
   and the hand-written geometry/color utility strings the helper functions
   produced. Do NOT port `rounded-md`→`rounded-sm`-style deltas back onto the
   component — the unified chrome is the point.
3. **Always set `type` explicitly** on `<Button>` (`type="button"` unless it
   submits a form). The component does not default it, and a bare button inside
   a form becomes an accidental submit.
4. **`v-model` on store refs**: `v-model="store.field.value"` is the established
   pattern (pages keep plain-ref stores). Never wrap in extra computeds unless
   validation/transform logic already exists — keep the same call path.
5. **Do not change behavior**: same handlers, same disabled conditions, same
   v-if/v-for structure. If the legacy markup did something the component cannot
   express (e.g. `select size=5`, `multiple`), keep the native element, apply
   `class="form-select"`/`form-input` (still valid legacy classes) and leave a
   `/* ui-migration: blocked — reason */` comment.
6. Delete migrated helpers (`btnClass`, `inputClass`, …) from page `lib/uiClasses.ts`
   when their last consumer is gone. Keep non-control helpers (tone maps,
   row classes) untouched.
7. Delete `<style>`-block rules that styled the migrated controls
   (`.submit-btn`, `.form-btn` copies, `input {…}`) once no element needs them.
   Cross-check other components of the same page first — some rules are shared.

## Select (reka-ui listbox) pattern

```vue
<SelectRoot v-model="store.exchange.value">
  <SelectTrigger id="sel-exchange" class="w-auto min-w-[140px]" aria-labelledby="sel-exchange-label">
    <span>{{ store.exchange.value || t('placeholder.key') }}</span>
  </SelectTrigger>
  <SelectContent>
    <SelectItem v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
  </SelectContent>
</SelectRoot>
```

- **Never render `<SelectItem value="">`** — reka throws; the empty string is the
  cleared state. A legacy `<option value="">Placeholder…</option>` becomes the
  trigger's placeholder text, not an item. If the legacy page allowed resetting
  to empty through that option, note the deviation in the page header comment
  (modern listbox UX has no reset row).
- The trigger label is an explicit `<span>` (not `SelectValue`): the option list
  is lazily mounted, so a programmatically set model value has no collection
  entry to read its text from. Render the label from the model.
- Placeholder styling: apply `class="text-placeholder"` on the span when the
  model is empty.
- Label association: `<label for>` does not focus a button-role trigger. Put the
  text in `<span id="…-label">` (or `Label id="…-label"`) and set
  `aria-labelledby="…-label"` on the trigger.
- `SelectTrigger` default width is `w-full`; toolbar selects usually want
  `class="w-auto min-w-[…]"`.
- Non-string option values (objects, numbers-as-ids): keep the legacy encoding
  (e.g. JSON strings) as the item `value` and parse in `update:model-value`.

## Checkbox / Switch / RadioGroup / Slider specifics

- `Checkbox` renders a button with `role="checkbox"`; bind `v-model="bool"`
  (`boolean | 'indeterminate'`). Label-wrapping keeps working — `<label>`
  activates a nested Checkbox because reka renders a real `<button>`, and
  `<button>` is a labelable element (text clicks toggle, as with native).
- `Switch` accepts `true-value`/`false-value` for 0/1 or string-backed state.
- `RadioGroup`: `v-model` on the root, `RadioGroupItem value="…"` per option.
- `Slider` binds `number[]` — adapt single-value refs with a small computed.
  jsdom caveat (verified against raw reka): chained arrow-key steps are broken
  in tests — after each step the thumb refocus resolves its collection index to
  -1, so the next step emits NaN. Drive ONE step per mount, or use Home/End.

## `v-model.number` — supported, keep it

`ui/Input` forwards the `.number` modifier to its inner native `<input>` (two-branch
render), so `v-model.number` keeps exact native semantics (looseToNumber,
intermediate typing states, empty-string). **Do not** strip the modifier and do
not write per-page parse adapters — migrate `<input v-model.number>` to
`<Input v-model.number>` verbatim. (`.trim`/`.lazy` are unused in this codebase.)

## Test updates

- Inputs/Textareas keep working with `setValue()` (real `<input>` under the hood).
- Buttons keep working with `trigger('click')`.
- Selects: use `src/shared/testing/select.ts` —
  `openSelect(wrapper, '#id')`, `pickSelectOption(wrapper, '#id', 'Label')`,
  `selectOptionTexts()`. It encodes the jsdom realities: keyboard-open (Enter),
  flush reka's one-shot open-gesture guard with a sacrificial body `pointerup`,
  then `pointerup` the `[role="option"]` element (options live in a body portal;
  query `document.body`, not the wrapper).
- Checkboxes/Switches: `trigger('click')` on `[role="checkbox"]`/`[role="switch"]`;
  assert through the store/model, not element classes.
- Replace assertions on dropped live classes (`.btn-primary` etc.) with the kept
  hook class, the id, or `[data-slot="button"]` scoped to a container.

## Verification (per page, before reporting done)

**Regex/sed batch edits are dangerous**: a pattern like `<button :class="x"` that
rewrites only part of a tag silently drops attributes that follow (`@click`,
`:disabled`, …). After ANY scripted replacement, diff every changed line and
confirm each tag kept all of its attributes. Prefer per-control edits.

```bash
cd frontend
pnpm vitest run pages/<page>            # page suite green
pnpm vitest run pages/<page> -- --typecheck 2>/dev/null || pnpm typecheck   # types
```

A page is done only when: no bare `<button>/<input>/<select>/<textarea>` with
hand-written chrome remains (or each has a `ui-migration: blocked` comment),
the page's `uiClasses.ts` no longer exports control helpers, and its tests pass
unmodified in behavior (selectors may be updated per above).
