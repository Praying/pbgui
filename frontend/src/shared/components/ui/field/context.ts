import { inject, provide, type ComputedRef, type InjectionKey } from 'vue';

/**
 * Field context — the label/id/feedback wiring shared between Field and
 * the form controls it wraps. Controls inject it and apply the ids
 * themselves, so pages can write `<Field label="…"><Input /></Field>`
 * with no manual id plumbing. Custom controls can still read the slot
 * props Field passes; both stay in sync.
 */
export interface FieldContext {
  /** The id the Field's <label for> points at. */
  inputId: string;
  /** The feedback element id (hint or error), if any. */
  describedBy: string | undefined;
  invalid: boolean;
}

export const FIELD_CONTEXT_KEY: InjectionKey<ComputedRef<FieldContext>> = Symbol('PbFieldContext');

export function provideFieldContext(context: ComputedRef<FieldContext>): void {
  provide(FIELD_CONTEXT_KEY, context);
}

export function useFieldContext(): ComputedRef<FieldContext> | undefined {
  return inject(FIELD_CONTEXT_KEY, undefined);
}
