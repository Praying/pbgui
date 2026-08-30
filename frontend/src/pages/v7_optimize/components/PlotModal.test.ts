import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import PlotModal from './PlotModal.vue';

describe('PlotModal', () => {
  it('exposes a draggable header and all eight resize directions', () => {
    const wrapper = mount(PlotModal, {
      props: { plot: { open: true, kind: 'html', title: 'Plot', html: '<div />', url: '', text: '', sessionId: '' } },
      global: { plugins: [createI18n('en')] },
    });
    expect(wrapper.find('[data-test="plot-header"]').exists()).toBe(true);
    for (const direction of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']) {
      expect(wrapper.find(`[data-dir="${direction}"]`).exists()).toBe(true);
    }
  });

  it('keeps embedded plots inside a full-size modal content frame', () => {
    const wrapper = mount(PlotModal, {
      props: { plot: { open: true, kind: 'url', title: 'Pareto Dash', html: '', url: '/dash/session', text: '', sessionId: 'session-1' } },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('.opt-plot-modal').classes()).toContain('opt-plot-modal');
    expect(wrapper.find('.opt-plot-body').exists()).toBe(true);
    expect(wrapper.find('.opt-plot-body iframe').attributes('src')).toBe('/dash/session');
  });
});
