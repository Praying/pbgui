import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import UsagePanel from './UsagePanel.vue';

/* UsagePanel — legacy renderTiingoUsage (market_data_main.html:5676-5723):
   the configure-profile empty state, the 429 warning callout with the
   compact wait suffix, and the three usage cards with clamped progress. */

function mountUsage(usage: Record<string, unknown> | null, configured: boolean) {
  return mount(UsagePanel, {
    props: { usage: usage ?? {}, configured },
    global: { plugins: [createI18n('en')] },
  });
}

describe('renderTiingoUsage (:5676-5723)', () => {
  it('shows the configure-profile empty state when not configured (:5679-5681)', () => {
    const wrapper = mountUsage(null, false);
    expect(wrapper.find('.settings-empty').text()).toBe(
      'Configure an active Tiingo vault profile in API Keys to use provider actions.'
    );
    expect(wrapper.find('.usage-grid').exists()).toBe(false);
  });

  it('renders the callout plus the three usage cards (:5702-5722)', () => {
    const wrapper = mountUsage(
      {
        hour_requests: 30,
        hour_limit: 60,
        hour_remaining: 30,
        day_requests: 5,
        day_limit: 100,
        day_remaining: 95,
        month_bytes: 1536,
        month_bytes_limit: 1024,
        month_bytes_remaining: 0,
      },
      true
    );
    expect(wrapper.find('.callout').text()).toContain('PBGui-local successful request counters');
    const cards = wrapper.findAll('.usage-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.find('.usage-title').text()).toBe('Hour (local)');
    expect(cards[0]!.find('.usage-meta').text()).toBe('30/60 locally tracked, 30 local remaining');
    expect((cards[0]!.find('progress').element as HTMLProgressElement).value).toBe(0.5);
    expect(cards[1]!.find('.usage-title').text()).toBe('Day (local)');
    expect(cards[2]!.find('.usage-meta').text()).toBe(
      '1.5 KB/1.0 KB locally tracked, 0 B local remaining'
    );
    expect((cards[2]!.find('progress').element as HTMLProgressElement).value).toBe(1);
  });

  it('escalates the callout while the server reports a 429 wait (:5696-5700)', () => {
    const wrapper = mountUsage({ server_429_wait_remaining_s: 3661 }, true);
    const callout = wrapper.find('.callout');
    expect(callout.classes()).toContain('warning');
    expect(callout.text()).toContain('exceeded');
    expect(callout.text()).toContain('1h 1m');
  });

  it('keeps the neutral callout without a wait', () => {
    const wrapper = mountUsage({ hour_requests: 1 }, true);
    expect(wrapper.find('.callout').classes()).not.toContain('warning');
  });
});
