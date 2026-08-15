import { describe, expect, it, vi } from 'vitest';
import { dashboardsUrl, editorPageUrl, templatesPageUrl } from './config';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

describe('dashboard_main config', () => {
  it('derives the api base from the boot origin like the legacy %%API_BASE%%', () => {
    expect(dashboardsUrl()).toBe('http://pbgui.test:8000/api/dashboards');
  });

  it('builds the view-mode editor url with name, api_base and view_only=1', () => {
    expect(editorPageUrl('My Dash', 'view')).toBe(
      'http://pbgui.test:8000/api/dashboard/editor_page?name=My+Dash&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&view_only=1'
    );
  });

  it('builds the standalone editor url without view_only', () => {
    const url = editorPageUrl('My Dash', 'editor');

    expect(url).toContain('name=My+Dash');
    expect(url).toContain('standalone=1');
    expect(url).not.toContain('view_only');
  });

  it('builds the templates page url with current and api_base', () => {
    expect(templatesPageUrl('My Dash')).toBe(
      'http://pbgui.test:8000/api/dashboard/templates_page?current=My+Dash&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi'
    );
  });
});
