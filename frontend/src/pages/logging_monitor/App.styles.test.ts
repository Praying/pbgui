import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Height-chain guard for the log viewer page.
 *
 * This page locks the document (`html, body, #app { height: 100%; overflow:
 * hidden }`), so it must be a `.core-workbench-shell`: components.css is the
 * only place that threads the viewport height all the way down
 * (workspace → main → primary → #page-body). Overriding just
 * `.app-shell__workspace` is not enough — `.app-shell__primary` stays a block
 * box, `#page-body` collapses to the selected log's content height, and the
 * viewer's bottom edge moves with every file (a short log ended ~640px above a
 * long one).
 */
const page_source = readFileSync(
  resolve(process.cwd(), 'src/pages/logging_monitor/App.vue'),
  'utf8',
);

/** Strip HTML/CSS block comments so prose about the chain is not mistaken for
 *  a re-declaration of it. */
function mask_comments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('logging monitor height chain', () => {
  it('renders AppShell as a core-workbench-shell', () => {
    expect(page_source).toMatch(/class="core-workbench-shell[^"]*"/);
  });

  it('leaves the shell height chain to components.css', () => {
    // A page-local copy of the chain is how the chain broke before: it can
    // easily cover only part of it and silently disagree with the shared one.
    const declarations = mask_comments(page_source);
    expect(declarations).not.toContain('.app-shell__workspace');
    expect(declarations).not.toContain('.app-shell__main');
    expect(declarations).not.toContain('.app-shell__primary');
  });

  it('renders the settings tables through the shared Table/Th contract', () => {
    // The header tone, uppercase micro labels and 2px separator live in
    // components.css. Hand-written <th> cells drifted to bg-elevated here,
    // which read as a heavier band than every other table in the app.
    const declarations = mask_comments(page_source);
    expect(declarations.match(/<Table[\s>]/g)?.length).toBe(2);
    expect(declarations).not.toMatch(/<th[\s>]/);
    expect(declarations).not.toContain('bg-elevated px-2.5');
  });
});
