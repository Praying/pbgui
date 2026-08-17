/**
 * Bot-JSON param-status highlight model — the pure half of
 * _applyBotJsonHighlight (v7_edit.html:3531-3576). The legacy built an HTML
 * string; this returns a per-line model the component renders as escaped
 * spans (XSS class R1).
 */

export interface BotHighlightLine {
  readonly text: string;
  /** 'neutralized' (amber) | 'pb_default' (red) | null. */
  readonly status: string | null;
  readonly error: boolean;
}

export function botHighlightLines(
  text: string,
  statusMap: Record<string, string>,
  errorLine?: number | null
): BotHighlightLine[] {
  let blockStatus: string | null = null;
  let blockDepth = 0;
  let depth = 0;
  return String(text ?? '')
    .split('\n')
    .map((line, index) => {
      const opens = (line.match(/\{/g) ?? []).length;
      const closes = (line.match(/\}/g) ?? []).length;
      const depthBefore = depth;
      depth += opens - closes;

      let status: string | null = null;
      if (blockStatus && depthBefore > blockDepth) {
        status = blockStatus;
      } else {
        const key = line.match(/^\s*"([^"]+)":/);
        status = key ? (statusMap[key[1]!] ?? null) : null;
      }

      if (status && opens > closes) {
        blockStatus = status;
        blockDepth = depthBefore;
      }
      if (blockStatus && depth <= blockDepth) {
        blockStatus = null;
      }

      return {
        text: line,
        status,
        error: errorLine === index + 1,
      };
    });
}
