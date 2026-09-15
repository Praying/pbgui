import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { apiFetch } from '@/shared/api';
import VastCloudPanel from './VastCloudPanel.vue';

vi.mock('@/shared/api', () => ({
  apiFetch: vi.fn(),
}));

describe('VastCloudPanel', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === '/api/vast/settings') return { configured: true };
      if (url === '/api/vast/gpu-preferences') return { gpu_name: 'RTX 4090', max_price: 0.8 };
      if (url === '/api/vast/configs') return { configs: [{ name: 'cloud-config' }] };
      if (url === '/api/vast/jobs') return { jobs: [{ id: 'job-1', config_name: 'cloud-config', status: 'queued' }], worker: null };
      return {};
    });
  });

  it('loads saved metadata without revealing stored credentials', async () => {
    const wrapper = mount(VastCloudPanel, { global: { plugins: [createI18n('en')] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Vast credentials are configured.');
    expect((wrapper.find('#vast-gpu-name').element as HTMLInputElement).value).toBe('RTX 4090');
    expect((wrapper.find('#vast-api-key').element as HTMLInputElement).value).toBe('');
    expect(wrapper.text()).toContain('cloud-config');
    wrapper.unmount();
  });

  it('posts a newly entered API key and clears it after success', async () => {
    const wrapper = mount(VastCloudPanel, { global: { plugins: [createI18n('en')] } });
    await flushPromises();

    const apiKeyInput = wrapper.find('#vast-api-key');
    await apiKeyInput.setValue('new-api-key');
    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save');
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(vi.mocked(apiFetch).mock.calls).toContainEqual([
      '/api/vast/credentials',
      { method: 'POST', body: JSON.stringify({ api_key: 'new-api-key' }) },
    ]);
    expect((apiKeyInput.element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('rents the explicitly selected compatible offer without starting a replacement queue job', async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === '/api/vast/settings') return { configured: true };
      if (url === '/api/vast/gpu-preferences') return { gpu_name: '', max_price: 0.8 };
      if (url === '/api/vast/configs') return { configs: [] };
      if (url === '/api/vast/jobs') return { jobs: [], worker: null };
      if (url.startsWith('/api/vast/offers?')) {
        return { offers: [{ id: 42, gpu_name: 'RTX 4090', vram_gb: 24, price_hour_usd: 0.4, location: 'EU' }] };
      }
      return {};
    });
    const wrapper = mount(VastCloudPanel, { global: { plugins: [createI18n('en')] } });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === 'Find GPU offers')!.trigger('click');
    await flushPromises();
    await wrapper.find('tbody tr').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Rent selected offer')!.trigger('click');
    await flushPromises();

    expect(vi.mocked(apiFetch).mock.calls).toContainEqual([
      '/api/vast/queue/start',
      {
        method: 'POST',
        body: JSON.stringify({
          use_saved_settings: true,
          accept_rental_and_cleanup: true,
          rent_only: true,
          offer_id: 42,
        }),
      },
    ]);
    wrapper.unmount();
  });
});
