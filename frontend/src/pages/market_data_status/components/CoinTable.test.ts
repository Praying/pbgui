import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import CoinTable from './CoinTable.vue';
import type { CoinRow } from '../types';

enableAutoUnmount(afterEach);

function mountTable(rows: CoinRow[], received: boolean, lang: 'en' | 'zh' = 'en') {
  return mount(CoinTable, { props: { rows, received }, global: { plugins: [createI18n(lang)] } });
}

function row(overrides: Partial<CoinRow> = {}): CoinRow {
  return {
    coin: 'BTC',
    last_fetch: '',
    result: '',
    lookback_days: '',
    minutes_written: '',
    newest_day: '',
    next_run_in_s: '',
    note: '',
    ...overrides,
  };
}

describe('CoinTable empty states', () => {
  it('shows the waiting state before the first status message', () => {
    const table = mountTable([], false);

    expect(table.find('.mds-empty-state').text()).toContain('Waiting for market data status...');
  });

  it('shows the no-coin state after a status message with no rows', () => {
    const table = mountTable([], true);

    expect(table.find('.mds-empty-state').text()).toContain('No coin status available yet');
  });

  it('renders the empty state across all eight columns', () => {
    const table = mountTable([], true);

    expect(table.find('td[colspan="8"]').exists()).toBe(true);
  });

  it('localizes the waiting state in zh', () => {
    const table = mountTable([], false, 'zh');

    expect(table.find('.mds-empty-state').text()).toContain('正在等待行情数据状态...');
  });
});

describe('CoinTable rows (legacy updateCoinTable cells)', () => {
  it('renders the eight legacy column headers', () => {
    const table = mountTable([row()], true);
    const headers = table.findAll('th').map((th) => th.text());

    expect(headers).toEqual([
      'Coin',
      'Last Fetch',
      'Result',
      'Lookback Days',
      'Minutes Written',
      'Newest Day',
      'Next Run (s)',
      'Note',
    ]);
  });

  it('renders a full row: strong coin, formatted fetch, result class, note title', () => {
    const table = mountTable(
      [
        row({
          coin: 'BTC',
          last_fetch: '2024-01-02T03:04:05',
          result: 'success',
          lookback_days: 30,
          minutes_written: 1440,
          newest_day: '2024-01-02',
          next_run_in_s: 45,
          note: 'all good',
        }),
      ],
      true,
    );

    const cells = table.findAll('td');
    expect(cells[0]!.find('strong').text()).toBe('BTC');
    expect(cells[1]!.text()).toBe('02.01.2024, 03:04:05');
    expect(cells[2]!.text()).toBe('success');
    expect(cells[2]!.classes()).toContain('mds-result-success');
    expect(cells[3]!.text()).toBe('30');
    expect(cells[4]!.text()).toBe('1440');
    expect(cells[5]!.text()).toBe('2024-01-02');
    expect(cells[6]!.text()).toBe('45s');
    expect(cells[7]!.text()).toBe('all good');
    expect(cells[7]!.attributes('title')).toBe('all good');
    expect(cells[7]!.classes()).toContain('mds-note-cell');
  });

  it('colors error results and leaves other results unstyled', () => {
    const table = mountTable(
      [row({ coin: 'A', result: 'error' }), row({ coin: 'B', result: 'partial' })],
      true,
    );
    const rows = table.findAll('tbody tr');

    expect(rows[0]!.findAll('td')[2]!.classes()).toContain('mds-result-error');
    expect(rows[1]!.findAll('td')[2]!.classes()).not.toContain('mds-result-error');
  });

  it('renders falsy numeric cells as empty strings like the legacy || fallback', () => {
    const table = mountTable([row({ lookback_days: 0, minutes_written: 0 })], true);
    const cells = table.findAll('td');

    expect(cells[3]!.text()).toBe('');
    expect(cells[4]!.text()).toBe('');
  });

  it('formats next-run values: empty, ready and minutes', () => {
    const table = mountTable(
      [row({ coin: 'A', next_run_in_s: '' }), row({ coin: 'B', next_run_in_s: 0 }), row({ coin: 'C', next_run_in_s: 125 })],
      true,
    );
    const rows = table.findAll('tbody tr');

    expect(rows[0]!.findAll('td')[6]!.text()).toBe('');
    expect(rows[1]!.findAll('td')[6]!.text()).toBe('Ready');
    expect(rows[2]!.findAll('td')[6]!.text()).toBe('2m 5s');
  });

  it('renders multiple rows in order', () => {
    const table = mountTable([row({ coin: 'BTC' }), row({ coin: 'ETH' })], true);

    const coins = table.findAll('tbody td strong').map((s) => s.text());
    expect(coins).toEqual(['BTC', 'ETH']);
  });
});
