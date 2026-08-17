import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  findJsonSyntaxError,
  formatJsonParseMessage,
  getJsonErrorLocation,
  getJsonLineDetail,
  getLineColumnFromJsonPos,
  validateJsonText,
} from './jsonValidation';

/*
 * Ports of frontend/js/editor_shared.js:94-131/133-352 (JSON parse-error
 * location + syntax fallback + line detail + validateJsonText). The legacy
 * file is the spec; these tests pin the observable behaviour shared by the
 * v7_edit raw/bot JSON validation surfaces (M-v7-2).
 */

describe('formatJsonParseMessage', () => {
  it('returns the fallback for empty input', () => {
    expect(formatJsonParseMessage('', 'Invalid JSON')).toBe('Invalid JSON');
  });

  it('strips position suffixes and the JSON.parse prefix', () => {
    expect(formatJsonParseMessage('Unexpected token } in JSON at position 42')).toBe('Unexpected token } in JSON');
    expect(formatJsonParseMessage('JSON.parse: bad control character in JSON at position 3 (line 2 column 4)')).toBe(
      'bad control character in JSON'
    );
  });
});

describe('getLineColumnFromJsonPos', () => {
  it('returns nulls for non-finite or negative positions', () => {
    expect(getLineColumnFromJsonPos('{}', Number.NaN)).toEqual({ line: null, column: null });
    expect(getLineColumnFromJsonPos('{}', -1)).toEqual({ line: null, column: null });
  });

  it('counts lines and columns from the start', () => {
    expect(getLineColumnFromJsonPos('{\n  "a": 1\n}', 5)).toEqual({ line: 2, column: 4 });
    expect(getLineColumnFromJsonPos('{}', 0)).toEqual({ line: 1, column: 1 });
  });
});

describe('getJsonErrorLocation', () => {
  it('prefers explicit "line x column y" messages', () => {
    expect(getJsonErrorLocation('{}', new Error('x at line 3 column 7'))).toEqual({ line: 3, column: 7 });
  });

  it('derives the location from a position-only message', () => {
    expect(getJsonErrorLocation('{\n"a" 1}', new Error('Unexpected number at position 6'))).toEqual({
      line: 2,
      column: 5,
    });
  });

  it('returns nulls when the message carries neither', () => {
    expect(getJsonErrorLocation('{}', new Error('nope'))).toEqual({ line: null, column: null });
  });
});

describe('findJsonSyntaxError', () => {
  it('passes valid JSON (whitespace-only input throws like the legacy scanner)', () => {
    expect(() => findJsonSyntaxError('{"a": [1, true, null, "x\\u0041"]}')).not.toThrow();
    // legacy parseValue fails on empty input (:139) — the blank case is
    // handled earlier by validateJsonText's empty check
    expect(() => findJsonSyntaxError('   ')).toThrow('Unexpected end of JSON');
  });

  it('reports the failing position for truncated input', () => {
    try {
      findJsonSyntaxError('{"a": ');
      expect.unreachable();
    } catch (error) {
      expect((error as { message: string }).message).toBe('Unexpected end of JSON');
      expect((error as { pos: number }).pos).toBe(6);
    }
  });

  it('parses only the first value (legacy leaves trailing garbage to JSON.parse)', () => {
    expect(() => findJsonSyntaxError('{} x')).not.toThrow();
  });
});

describe('getJsonLineDetail', () => {
  it('computes the selection window of a line', () => {
    const detail = getJsonLineDetail('{\n  "a": 1,\n  "b": 2\n}', 2, 8);
    expect(detail).not.toBeNull();
    expect(detail!.lineText).toBe('  "a": 1,');
    expect(detail!.line).toBe(2);
    expect(detail!.column).toBe(8);
    // selectionStart clamps into the line, selectionEnd runs to its end
    expect(detail!.selectionEnd).toBe(detail!.lineStart + detail!.lineText.length);
  });

  it('returns null for out-of-range lines', () => {
    expect(getJsonLineDetail('{}', 0, 1)).toBeNull();
    expect(getJsonLineDetail('{}', 9, 1)).toBeNull();
    expect(getJsonLineDetail('', 1, 1)).toBeNull();
  });
});

describe('validateJsonText', () => {
  const messages = {
    cannotBeEmpty: 'JSON cannot be empty',
    topLevelObject: 'Top-level JSON value must be an object',
  };

  it('accepts a well-formed object', () => {
    const result = validateJsonText('{"a":1}', { expectObject: true, messages });
    expect(result.parsed).toEqual({ a: 1 });
    expect(result.error).toBeNull();
  });

  it('rejects blank text with line/column 1', () => {
    const result = validateJsonText('   ', { messages });
    expect(result.parsed).toBeNull();
    expect(result.error).toEqual({ line: 1, column: 1, message: 'JSON cannot be empty' });
  });

  it('rejects non-object top-level values when expectObject', () => {
    const result = validateJsonText('[1]', { expectObject: true, messages });
    expect(result.parsed).toBeNull();
    expect(result.error?.message).toBe('Top-level JSON value must be an object');
    expect(result.error?.line).toBeNull();
  });

  it('locates a syntax error with the fallback scanner when the engine gives no position', () => {
    const result = validateJsonText('{"a": "b",}', { expectObject: true, messages });
    expect(result.parsed).toBeNull();
    expect(result.error?.line).not.toBeNull();
    expect(result.error?.column).not.toBeNull();
  });

  it('formats the engine message when it carries the position', () => {
    const result = validateJsonText('{"a": undefined}', { messages });
    expect(result.parsed).toBeNull();
    expect(typeof result.error?.message).toBe('string');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });
});
