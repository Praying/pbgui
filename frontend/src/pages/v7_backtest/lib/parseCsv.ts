import type { ParsedCsv } from '../types';

/**
 * parseCsv (:5422-5437) — the results CSV reader for equity and fills
 * files streamed from `/results/{file}?path=`. Parity notes: headers come
 * back untrimmed (consumers trim, :7251/:7381) but record keys and values
 * are trimmed; blank lines are skipped; short rows pad with ''.
 */
export function parseCsv(text: string): ParsedCsv {
  const lines = String(text ?? '').split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0]!.split(',');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const values = line.split(',');
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!.trim()] = (values[j] ?? '').trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}
