import { afterEach, describe, expect, it } from 'vitest';
import { apiBase, dashboardsUrl, fromTemplateUrl, initialCurrent, templatesUrl, usersUrl } from './config';

function setUrl(path: string): void {
  // Relative URLs only: jsdom history.replaceState rejects cross-origin URLs.
  window.history.replaceState(null, '', path);
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('dashboard_templates config', () => {
  it('reads the api_base query param like the legacy %%API_BASE%% injection', () => {
    setUrl('/api/dashboard/templates_page?api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi');

    expect(apiBase()).toBe('http://pbgui.test:8000/api');
  });

  it('falls back to an empty base when api_base is missing (legacy relative fetches)', () => {
    setUrl('/api/dashboard/templates_page?current=B');

    expect(apiBase()).toBe('');
    expect(dashboardsUrl()).toBe('/dashboards');
  });

  it('derives the dashboard endpoints from the api base', () => {
    setUrl('/api/dashboard/templates_page?api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi');

    expect(dashboardsUrl()).toBe('http://pbgui.test:8000/api/dashboards');
    expect(templatesUrl()).toBe('http://pbgui.test:8000/api/dashboards/templates');
    expect(usersUrl()).toBe('http://pbgui.test:8000/api/dashboards/users');
    expect(fromTemplateUrl()).toBe('http://pbgui.test:8000/api/dashboards/from_template');
  });

  it('reads the current query param like the legacy %%CURRENT%% injection', () => {
    setUrl('/api/dashboard/templates_page?current=My%20Dash');

    expect(initialCurrent()).toBe('My Dash');
  });

  it('defaults current to an empty string', () => {
    setUrl('/api/dashboard/templates_page');

    expect(initialCurrent()).toBe('');
  });
});
