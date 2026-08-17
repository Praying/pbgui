/* Masked credential-field state machine ported from setupMaskedField /
   getMaskedFieldValue (api_keys_editor.html:2118-2165).

   Vue port note: the legacy stored state on the DOM input (dataset.masked,
   dataset.revealed, dataset.realValue); here it is one reactive object per
   field with identical semantics:

     null  = unchanged (keep the saved value)
     ""    = revealed then explicitly cleared (validation sentinel)
     value = replace with this value
*/

export interface MaskedField {
  /** Typed input value ('' while showing the masked placeholder). */
  value: string;
  /** Non-empty when the server sent a *_masked sentinel (has a saved value). */
  masked: string;
  /** True while the value was fetched via reveal-key and left unchanged. */
  revealed: boolean;
  /** Real value fetched by the eye toggle (local show); null when re-hid unchanged. */
  realValue: string | null;
  /** Input type mirrors the eye toggle. */
  visible: boolean;
  /** Convenience: a saved value exists (placeholder 'saved' check). */
  hasSaved: boolean;
}

export function newMaskedField(masked: string): MaskedField {
  return {
    value: '',
    masked,
    revealed: false,
    realValue: null,
    visible: false,
    hasSaved: Boolean(masked),
  };
}

/** Legacy placeholder state: '••• (saved — leave blank to keep)' only when saved. */
export function maskedPlaceholder(field: MaskedField, savedLabel: string): string {
  return field.masked ? '••••••••••• ' + savedLabel : '';
}

/** A saved value exists (legacy placeholder.includes('saved') check :1843). */
export function hasSavedValue(field: MaskedField): boolean {
  return Boolean(field.masked);
}

/** Resolve the field for a save payload — see module doc (:2150-2165). */
export function maskedFieldValue(field: MaskedField): string | null {
  if (field.revealed) return null;
  if (!field.value && field.realValue !== null) return '';
  if (field.realValue !== null && field.value === field.realValue) return null;
  if (!field.value) return null;
  return field.value;
}
