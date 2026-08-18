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
});
