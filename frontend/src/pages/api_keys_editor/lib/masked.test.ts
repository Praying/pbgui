import { describe, expect, it } from 'vitest';
import { maskedFieldValue, newMaskedField } from './masked';

/* Provenance: setupMaskedField/getMaskedFieldValue api_keys_editor.html:2118-2165.

   Semantics preserved 1:1 (legacy comment at :2149):
     null  = unchanged (leave saved value as-is)
     ""    = revealed then explicitly cleared (validation sentinel)
     value = new value to write
*/

describe('maskedFieldValue (getMaskedFieldValue :2150-2165)', () => {
  it('null when the field was revealed via reveal-key and left unchanged', () => {
    const field = { ...newMaskedField('xx'), revealed: true, value: 'REALKEY' };
    expect(maskedFieldValue(field)).toBeNull();
  });

  it('empty string when revealed then explicitly cleared (realValue present)', () => {
    const field = { ...newMaskedField('xx'), realValue: 'REAL', value: '' };
    expect(maskedFieldValue(field)).toBe('');
  });

  it('null when a locally-shown value was re-hid unchanged (realValue deleted)', () => {
    const field = { ...newMaskedField('xx'), realValue: null, value: '' };
    expect(maskedFieldValue(field)).toBeNull();
  });

  it('null when an empty field was never revealed', () => {
    expect(maskedFieldValue(newMaskedField(''))).toBeNull();
    expect(maskedFieldValue(newMaskedField('maskedsecret'))).toBeNull();
  });

  it('returns the typed value when the user entered a new secret', () => {
    const field = { ...newMaskedField('xx'), value: 'new-secret' };
    expect(maskedFieldValue(field)).toBe('new-secret');
  });

  it('returns the edited value even when it differs from a fetched realValue', () => {
    const field = { ...newMaskedField('xx'), realValue: 'REAL', value: 'REAL2' };
    expect(maskedFieldValue(field)).toBe('REAL2');
  });
});

describe('newMaskedField (setupMaskedField :2122-2147)', () => {
  it('seeds the saved placeholder state from a masked value', () => {
    const field = newMaskedField('abc');
    expect(field.masked).toBe('abc');
    expect(field.value).toBe('');
    expect(field.revealed).toBe(false);
    expect(field.realValue).toBeNull();
    expect(field.hasSaved).toBe(true);
  });

  it('empty masked value means nothing saved yet', () => {
    const field = newMaskedField('');
    expect(field.hasSaved).toBe(false);
  });
});
