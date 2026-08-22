import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ApiError, apiFetch } from '@/shared/api';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

const { apiFetchMock, replaceTopLocationMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  replaceTopLocationMock: vi.fn(),
}));

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: '', origin: 'https://pbgui.test', version: '1.0.0', serial: '' }),
}));

vi.mock('@/shared/api', () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public detail: string,
    ) {
      super(`API ${status}: ${detail}`);
    }
  },
}));

vi.mock('@/shared/nav', () => ({
  replaceTopLocation: replaceTopLocationMock,
}));

function mountApp(lang: 'en' | 'zh' = 'en') {
  return mount(App, { global: { plugins: [createI18n(lang)] } });
}

describe('root_login App', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    replaceTopLocationMock.mockReset();
    delete (window as { PBGuiI18n?: unknown }).PBGuiI18n;
  });

  it('renders the login form with english i18n text', async () => {
    const wrapper = mountApp();
    await flushPromises();

    // Standalone auth boundary: login must not render the workbench rail.
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    const input = wrapper.find('input[type=password]');
    expect(wrapper.find('form').exists()).toBe(true);
    expect(input.attributes('placeholder')).toBe('Password');
    expect(input.attributes('aria-label')).toBe('Password');
    expect(input.attributes('autocomplete')).toBe('current-password');
    expect(wrapper.find('.lang-btn').text()).toBe('中文');
    expect(document.title).toBe('PBGui - Login');
  });

  it('renders the login form with chinese i18n text', async () => {
    const wrapper = mountApp('zh');
    await flushPromises();

    expect(wrapper.find('input[type=password]').attributes('placeholder')).toBe('密码');
    expect(wrapper.find('.lang-btn').text()).toBe('English');
    expect(document.title).toBe('PBGui - 登录');
  });

  it('submits the password to the login endpoint and redirects to the main page', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    const wrapper = mountApp();

    await wrapper.find('input[type=password]').setValue('pw');
    await wrapper.find('form').trigger('submit');

    expect(apiFetch).toHaveBeenCalledWith('https://pbgui.test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'pw' }),
    });
    expect(replaceTopLocationMock).toHaveBeenCalledWith('https://pbgui.test/api/auth/main_page');
    expect(wrapper.find('#banner').classes()).not.toContain('show');
  });

  it('shows the server error in the banner when login fails', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(401, 'Invalid password'));
    const wrapper = mountApp();

    await wrapper.find('input[type=password]').setValue('wrong');
    await wrapper.find('form').trigger('submit');

    const banner = wrapper.find('#banner');
    expect(banner.classes()).toContain('show');
    expect(banner.text()).toBe('Invalid password');
    expect(replaceTopLocationMock).not.toHaveBeenCalled();
  });

  it('clears the banner before resubmitting', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, 'Invalid password'));
    const wrapper = mountApp();

    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('#banner').text()).toBe('Invalid password');

    apiFetchMock.mockResolvedValueOnce({ ok: true });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('#banner').classes()).not.toContain('show');
  });

  it('toggles language through the legacy engine when present', async () => {
    const toggleLang = vi.fn();
    (window as { PBGuiI18n?: unknown }).PBGuiI18n = { lang: 'en', toggleLang };
    const wrapper = mountApp();

    await wrapper.find('.lang-btn').trigger('click');

    expect(toggleLang).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
