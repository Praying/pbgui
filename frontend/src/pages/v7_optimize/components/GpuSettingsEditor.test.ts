import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import GpuSettingsEditor from './GpuSettingsEditor.vue';

describe('GpuSettingsEditor', () => {
  it('restores runtime defaults without deleting unknown future GPU keys', async () => {
    const wrapper = mount(GpuSettingsEditor, {
      props: {
        gpu: {
          population_size: 120,
          future_gpu_key: 17,
          successive_halving: { enabled: false, future_halving_key: 'keep' },
        },
        optimizeDefaults: {
          gpu: {
            population_size: null,
            batch_size: null,
            successive_halving: { enabled: true, survival_fraction: 0.5 },
          },
        },
        contract: null,
      },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('[data-action="reset-gpu"]').trigger('click');

    expect(wrapper.emitted('update:gpu')?.[0]?.[0]).toMatchObject({
      population_size: null,
      batch_size: null,
      future_gpu_key: 17,
      successive_halving: {
        enabled: true,
        survival_fraction: 0.5,
        future_halving_key: 'keep',
      },
    });
  });

  it('keeps automatic sizing nullable and exposes unavailable hosts as editable previews', async () => {
    const wrapper = mount(GpuSettingsEditor, {
      props: {
        gpu: { population_size: 100 },
        optimizeDefaults: { gpu: { population_size: null } },
        contract: { items: { gpu: { recognized: true, available: false, reason: 'Apple MPS unavailable' } } },
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.text()).toContain('Apple MPS unavailable');
    expect(wrapper.find('[data-field="gpu-population-size"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-field="gpu-population-size"]').setValue('');
    expect(wrapper.emitted('update:gpu')?.at(-1)?.[0]).toMatchObject({ population_size: null });
  });
});
