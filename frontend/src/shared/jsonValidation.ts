/**
 * JSON editor validation helpers — ports of frontend/js/editor_shared.js
 * :94-131 (message formatting + line/column math), :133-291 (the hand-rolled
 * syntax scanner engines use when a message carries no position), :293-352
 * (line detail + validateJsonText) and :84-92 (escapeHtml). The legacy file is
 * the spec. Shared so backtest/optimize editors (M-v7-9..17) reuse the exact
 * behaviour; editor_shared.js itself stays for the coin_data legacy fallback
 * (recon §0) until the module closeout deletes it.
 */

export interface JsonValidationMessages {
  readonly invalid: string;
  readonly cannotBeEmpty: string;
  readonly topLevelObject: string;
}

export interface JsonErrorLocation {
  readonly line: number | null;
  readonly column: number | null;
}

export interface JsonValidationError extends JsonErrorLocation {
  readonly message: string;
}

export interface JsonValidationResult {
  readonly parsed: unknown;
  readonly error: JsonValidationError | null;
}

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** formatJsonParseMessage (:94-100) — strip position suffix + engine prefix. */
export function formatJsonParseMessage(message: unknown, fallback = 'Invalid JSON'): string {
  if (!message) return fallback;
  return String(message)
    .replace(/\s+at position \d+(?:\s+\(line \d+ column \d+\))?/i, '')
    .replace(/^JSON\.parse:\s*/i, '')
    .trim();
}

/** getLineColumnFromJsonPos (:102-117). */
export function getLineColumnFromJsonPos(raw: string, pos: number): JsonErrorLocation {
  if (!Number.isFinite(pos) || pos < 0) return { line: null, column: null };
  const text = typeof raw === 'string' ? raw : '';
  let line = 1;
  let column = 1;
  const limit = Math.min(pos, text.length);
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/** getJsonErrorLocation (:119-131) — engine message → line/column. */
export function getJsonErrorLocation(raw: string, error: unknown): JsonErrorLocation {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColMatch) {
    return { line: parseInt(lineColMatch[1]!, 10), column: parseInt(lineColMatch[2]!, 10) };
  }
  const posMatch = message.match(/position\s+(\d+)/i);
  if (!posMatch) return { line: null, column: null };
  return getLineColumnFromJsonPos(raw, parseInt(posMatch[1]!, 10));
}

interface SyntaxFailure {
  pos: number;
  message: string;
}

/** findJsonSyntaxError (:133-291) — throws {pos, message} like the legacy. */
export function findJsonSyntaxError(raw: string): void {
  const text = typeof raw === 'string' ? raw : '';
  let idx = 0;
  const len = text.length;

  const fail = (pos: number, message: string): never => {
    throw { pos, message } as SyntaxFailure;
  };
  const skipWhitespace = (): void => {
    while (idx < len) {
      const ch = text.charCodeAt(idx);
      if (ch === 9 || ch === 10 || ch === 13 || ch === 32) idx += 1;
      else break;
    }
  };
  const parseString = (): void => {
    idx += 1;
    while (idx < len) {
      const ch = text[idx]!;
      if (ch === '"') {
        idx += 1;
        return;
      }
      if (ch === '\\') {
        idx += 1;
        if (idx >= len) fail(idx, 'Unterminated escape sequence in string');
        const escCh = text[idx]!;
        if ('"\\/bfnrt'.indexOf(escCh) >= 0) {
          idx += 1;
          continue;
        }
        if (escCh === 'u') {
          idx += 1;
          for (let i = 0; i < 4; i++) {
            const code = text[idx + i];
            if (!code || !/[0-9a-fA-F]/.test(code)) fail(idx + i, 'Invalid Unicode escape in string');
          }
          idx += 4;
          continue;
        }
        fail(idx, 'Invalid escape sequence in string');
      }
      if (ch === '\n' || ch === '\r') fail(idx, 'Unterminated string literal');
      idx += 1;
    }
    fail(idx, 'Unterminated string literal');
  };
  const parseNumber = (): void => {
    if (text[idx] === '-') idx += 1;
    if (idx >= len) fail(idx, 'Invalid number');
    if (text[idx] === '0') {
      idx += 1;
    } else if (text[idx]! >= '1' && text[idx]! <= '9') {
      while (idx < len && text[idx]! >= '0' && text[idx]! <= '9') idx += 1;
    } else {
      fail(idx, 'Invalid number');
    }
    if (text[idx] === '.') {
      idx += 1;
      if (idx >= len || text[idx]! < '0' || text[idx]! > '9') fail(idx, 'Invalid number');
      while (idx < len && text[idx]! >= '0' && text[idx]! <= '9') idx += 1;
    }
    if (text[idx] === 'e' || text[idx] === 'E') {
      idx += 1;
      if (text[idx] === '+' || text[idx] === '-') idx += 1;
      if (idx >= len || text[idx]! < '0' || text[idx]! > '9') fail(idx, 'Invalid number exponent');
      while (idx < len && text[idx]! >= '0' && text[idx]! <= '9') idx += 1;
    }
  };
  const parseArray = (): void => {
    idx += 1;
    skipWhitespace();
    if (idx >= len) fail(idx, 'Unterminated array');
    if (text[idx] === ']') {
      idx += 1;
      return;
    }
    while (idx < len) {
      parseValue();
      skipWhitespace();
      if (idx >= len) fail(idx, 'Unterminated array');
      if (text[idx] === ',') {
        idx += 1;
        skipWhitespace();
        if (idx >= len) fail(idx, 'Unexpected end of JSON after array comma');
        if (text[idx] === ']') fail(idx, 'Expected value after array comma');
        continue;
      }
      if (text[idx] === ']') {
        idx += 1;
        return;
      }
      fail(idx, 'Expected comma or closing bracket after array element');
    }
    fail(idx, 'Unterminated array');
  };
  const parseObject = (): void => {
    idx += 1;
    skipWhitespace();
    if (idx >= len) fail(idx, 'Unterminated object');
    if (text[idx] === '}') {
      idx += 1;
      return;
    }
    while (idx < len) {
      skipWhitespace();
      if (text[idx] !== '"') fail(idx, 'Expected double-quoted property name in JSON');
      parseString();
      skipWhitespace();
      if (idx >= len || text[idx] !== ':') fail(idx, 'Expected colon after property name');
      idx += 1;
      parseValue();
      skipWhitespace();
      if (idx >= len) fail(idx, 'Unterminated object');
      if (text[idx] === ',') {
        idx += 1;
        skipWhitespace();
        if (idx >= len) fail(idx, 'Unexpected end of JSON after object comma');
        if (text[idx] === '}') fail(idx, 'Expected property name after object comma');
        continue;
      }
      if (text[idx] === '}') {
        idx += 1;
        return;
      }
      fail(idx, 'Expected comma or closing brace after property value');
    }
    fail(idx, 'Unterminated object');
  };
  function parseValue(): void {
    skipWhitespace();
    if (idx >= len) fail(idx, 'Unexpected end of JSON');
    const ch = text[idx]!;
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    if (text.slice(idx, idx + 4) === 'true') {
      idx += 4;
      return;
    }
    if (text.slice(idx, idx + 5) === 'false') {
      idx += 5;
      return;
    }
    if (text.slice(idx, idx + 4) === 'null') {
      idx += 4;
      return;
    }
    fail(idx, 'Unexpected token');
  }

  parseValue();
}

export interface JsonLineDetail {
  readonly lineText: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly column: number;
  readonly line: number;
}

/** getJsonLineDetail (:293-311) — the reveal-line selection window. */
export function getJsonLineDetail(raw: string, line: number | null, column: number | null): JsonLineDetail | null {
  if (!raw || !line || line < 1) return null;
  const lines = raw.split('\n');
  if (line > lines.length) return null;
  const lineText = (lines[line - 1] ?? '').replace(/\r$/, '');
  const safeColumn = Math.max(1, Math.min(column || 1, lineText.length + 1));
  let lineStart = 0;
  for (let i = 0; i < line - 1; i++) lineStart += (lines[i] ?? '').length + 1;
  const lineEnd = lineStart + lineText.length;
  return {
    lineText,
    lineStart,
    lineEnd,
    selectionStart: Math.max(lineStart, Math.min(lineEnd, lineStart + safeColumn - 1)),
    selectionEnd: lineEnd,
    column: safeColumn,
    line,
  };
}

export interface ValidateJsonTextOptions {
  /** Require a top-level object (raw + structured field textareas). */
  readonly expectObject?: boolean;
  /** Message for blank input (defaults to messages.cannotBeEmpty). */
  readonly emptyMessage?: string;
  readonly messages: Pick<JsonValidationMessages, 'cannotBeEmpty' | 'topLevelObject'>;
}

/** validateJsonText (:313-352). */
export function validateJsonText(raw: string, opts: ValidateJsonTextOptions): JsonValidationResult {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) {
    return {
      parsed: null,
      error: { line: 1, column: 1, message: opts.emptyMessage ?? opts.messages.cannotBeEmpty },
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (opts.expectObject && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      return {
        parsed: null,
        error: { line: null, column: null, message: opts.messages.topLevelObject },
      };
    }
    return { parsed, error: null };
  } catch (error) {
    let location = getJsonErrorLocation(text, error);
    let fallbackError: SyntaxFailure | null = null;
    if (!location.line || !location.column) {
      try {
        findJsonSyntaxError(text);
      } catch (syntaxError) {
        fallbackError = syntaxError as SyntaxFailure;
      }
    }
    if (fallbackError) {
      const fallbackLocation = getLineColumnFromJsonPos(text, fallbackError.pos);
      location = { line: fallbackLocation.line, column: fallbackLocation.column };
    }
    return {
      parsed: null,
      error: {
        line: location.line,
        column: location.column,
        message: fallbackError?.message ?? formatJsonParseMessage(error instanceof Error ? error.message : error),
      },
    };
  }
}

/* ─── Textarea anchors (editor_shared.js:22-43) ────────────────────────── */

export interface TextareaAnchor {
  readonly top: number;
  readonly scrollTop: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** captureTextareaAnchor — only meaningful while the element has focus. */
export function captureTextareaAnchor(el: HTMLTextAreaElement | null): TextareaAnchor | null {
  if (!el || document.activeElement !== el) return null;
  return {
    top: el.getBoundingClientRect().top,
    scrollTop: el.scrollTop,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd,
  };
}

/** restoreTextareaAnchor — re-pin scroll + selection after a re-render. */
export function restoreTextareaAnchor(el: HTMLTextAreaElement | null, anchor: TextareaAnchor | null): void {
  if (!anchor || !el) return;
  const delta = el.getBoundingClientRect().top - anchor.top;
  if (delta) window.scrollBy(0, delta);
  el.scrollTop = anchor.scrollTop;
  try {
    el.setSelectionRange(anchor.selectionStart, anchor.selectionEnd);
  } catch {
    /* legacy ignored setSelectionRange failures on non-text inputs */
  }
}
