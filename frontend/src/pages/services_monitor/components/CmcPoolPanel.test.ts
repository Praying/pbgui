import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, selectOptionTexts } from '@/shared/testing/select';
import CmcPoolPanel from './CmcPoolPanel.vue';
import type { CmcLeasesResponse, CmcPool } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

const POOL: CmcPool = {
  keys: [
    {
      id: 'k1',
      label: 'Primary',
      active: true,
      desired_state: 'active',
      materialized_generation: 2,
      desired_generation: 3,
      generation: 3,
      source: 'local',
      shared: true,
      used_credits: 50,
      provider_used: 100,
      provider_limit: 1000,
      quota_domain_id: 'd1',
    },
    { id: 'k2', label: 'Backup', active: false },
  ],
  ready: true,
  active_credentials: 1,
  total_credentials: 2,
  health: 'ok',
  warnings: ['pool warning'],
  day: '2026-08-15',
  soft_credit_limit: 10000,
  eligible_authority_nodes: [
    { node_id: 'n1', name: 'Alpha' },
    { node_id: 'n2' },
  ],
};

const LEASES: CmcLeasesResponse = {
  authority: { available: true, active_leases: 2, lease_count: 5 },
  key_usage: [{ credential_id: 'k1', reserved_credits: 10, reserved_requests: 3 }],
  domains: [
    {
      quota_domain_id: 'd1',
      authority_node: 'pb1',
      authority_node_id: 'n1',
      authority_epoch: 3,
      authority_reachable: true,
      authority_updated_at: 1700000000,
      authority_state_age_seconds: 3600,
      uncertain_credits: 5,
      provider_remaining: 900,
      provider_reset_at: 1700000000,
      provider_stale_age_seconds: 60,
    },
  ],
  leases: [
    {
      lease_id: 'l1',
      credential_id: 'k1',
      generation: 2,
      quota_domain_id: 'd1',
      authority_epoch: 3,
      recipient: 'worker-1',
      credits: 100,
      request_count: 4,
      granted_at: 1700000000,
      expires_at: 1700003600,
      outcome: 'active',
    },
  ],
  warnings: ['lease warning'],
};

type DialogsGlobal = typeof globalThis & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } };

function mountPanel(
  props: {
    pool?: CmcPool;
    leases?: CmcLeasesResponse;
    loaded?: boolean;
    loadNotice?: { text: string; error: boolean } | null;
  } = {}
) {
  return mount(CmcPoolPanel, {
    props: {
      pool: props.pool ?? POOL,
      leases: props.leases ?? LEASES,
      loaded: props.loaded ?? true,
      loadNotice: props.loadNotice ?? null,
    },
    global: { plugins: [createI18n('en')] },
  });
}

function rowByKey(wrapper: ReturnType<typeof mountPanel>, keyId: string) {
  const row = wrapper.findAll('.cmc-table tbody tr').find((tr) => tr.attributes('data-key-id') === keyId);
  expect(row, `pool row ${keyId}`).toBeDefined();
  return row!;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
  (window as DialogsGlobal).PBGuiDialogs = { confirm: vi.fn(async () => true) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as DialogsGlobal).PBGuiDialogs;
  // The reka select portals its listbox into document.body — clear it so a
  // stale list from a previous test cannot intercept option lookups.
  document.body.innerHTML = '';
});

describe('CmcPoolPanel rendering (legacy renderCmcPool)', () => {
  it('renders the seven summary cards with legacy values', () => {
    const wrapper = mountPanel();

    const cards = wrapper.findAll('.cmc-summary-card');
    expect(cards).toHaveLength(7);
    expect(cards.map((c) => c.find('.cmc-summary-label').text())).toEqual([
      'Active Keys',
      'Health',
      'Usage Day',
      'Soft Limit',
      'Assigned Authorities',
      'Active Leases',
      'Uncertain Spend',
    ]);
    expect(cards[0]!.find('.cmc-summary-value').text()).toBe('1 / 2');
    expect(cards[1]!.find('.cmc-summary-value').text()).toBe('ok');
    expect(cards[2]!.find('.cmc-summary-value').text()).toBe('2026-08-15');
    expect(cards[4]!.find('.cmc-summary-value').text()).toContain('pb1 (epoch 3)');
    expect(cards[5]!.find('.cmc-summary-value').text()).toBe('2');
  });

  it('concatenates pool and lease warnings', () => {
    const wrapper = mountPanel();

    expect(wrapper.findAll('.cmc-pool-warning').map((w) => w.text())).toEqual([
      'pool warning',
      'lease warning',
    ]);
  });

  it('renders the 20-column key table with usage/domain fallbacks', () => {
    const wrapper = mountPanel();

    const headers = wrapper.findAll('.cmc-pool-wrap .cmc-table-wrap')[0]!.findAll('thead th');
    expect(headers).toHaveLength(20);
    expect(headers[0]!.text()).toBe('Label');
    const row = rowByKey(wrapper, 'k1');
    const cells = row.findAll('td');
    expect(cells).toHaveLength(20);
    expect(cells[0]!.text()).toBe('Primary');
    expect(cells[1]!.find('.cmc-state').classes()).toContain('active');
    expect(cells[3]!.text()).toBe('2 / 3');
    expect(cells[5]!.text()).toBe('Yes');
    expect(cells[7]!.text()).toBe('10 / 3 req'); // key_usage join
    expect(cells[8]!.text()).toBe('5'); // domain uncertain_credits
    expect(cells[11]!.text()).toBe('900'); // domain provider_remaining wins over key
    expect(cells[15]!.text()).toBe('d1');
    expect(cells[16]!.text()).toBe('pb1');
    expect(cells[17]!.text()).toBe('3 / yes');
  });

  it('marks disabled keys with the disabled state badge', () => {
    const wrapper = mountPanel();

    const badge = rowByKey(wrapper, 'k2').findAll('td')[1]!.find('.cmc-state');
    expect(badge.classes()).toContain('disabled');
  });

  it('renders the 11-column lease table', () => {
    const wrapper = mountPanel();

    const leasesWrap = wrapper.findAll('.cmc-pool-wrap .cmc-table-wrap')[1]!;
    expect(leasesWrap.findAll('thead th')).toHaveLength(11);
    const cells = leasesWrap.findAll('tbody tr')[0]!.findAll('td');
    expect(cells[0]!.text()).toBe('l1');
    expect(cells[5]!.text()).toBe('worker-1');
    expect(cells[10]!.text()).toBe('active');
  });

  it('shows the legacy empty states when lists are empty', () => {
    const wrapper = mountPanel({
      pool: { keys: [], eligible_authority_nodes: [] },
      leases: { authority: {}, domains: [], leases: [] },
    });

    expect(wrapper.findAll('.cmc-table-wrap')[0]!.text()).toContain('No CMC keys configured.');
    expect(wrapper.findAll('.cmc-table-wrap')[1]!.text()).toContain('No lease records.');
  });

  it('shows the loading placeholders before the first payload (legacy initial tbody)', () => {
    const wrapper = mountPanel({ loaded: false, pool: {}, leases: {} });

    expect(wrapper.findAll('.cmc-table-wrap')[0]!.text()).toContain('Loading pool');
    expect(wrapper.findAll('.cmc-table-wrap')[1]!.text()).toContain('Loading leases');
  });

  it('mirrors the load notice into the inline message area', async () => {
    const wrapper = mountPanel({ loadNotice: { text: '5 lease records', error: false } });
    expect(wrapper.find('.cmc-pool-message').text()).toBe('5 lease records');
    expect(wrapper.find('.cmc-pool-message').classes()).not.toContain('error');

    await wrapper.setProps({ loadNotice: { text: 'boom', error: true } });
    expect(wrapper.find('.cmc-pool-message').text()).toBe('boom');
    expect(wrapper.find('.cmc-pool-message').classes()).toContain('error');
  });
});

describe('CmcPoolPanel selection and toolbar (legacy updateCmcButtons/selectCmcKey)', () => {
  it('disables the selection-gated buttons until a key is selected', () => {
    const wrapper = mountPanel();

    for (const id of ['cmc-rotate-btn', 'cmc-edit-btn', 'cmc-disable-btn', 'cmc-delete-btn', 'cmc-authority-btn']) {
      expect((wrapper.find(`#${id}`).element as HTMLButtonElement).disabled, id).toBe(true);
    }
    expect((wrapper.find('#cmc-add-key-btn').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('selects a row on click and enables the buttons', async () => {
    const wrapper = mountPanel();

    await rowByKey(wrapper, 'k1').trigger('click');

    expect(rowByKey(wrapper, 'k1').classes()).toContain('selected');
    for (const id of ['cmc-rotate-btn', 'cmc-edit-btn', 'cmc-delete-btn', 'cmc-authority-btn']) {
      expect((wrapper.find(`#${id}`).element as HTMLButtonElement).disabled, id).toBe(false);
    }
    expect(wrapper.find('#cmc-disable-btn').text()).toBe('Disable');
  });

  it('shows Re-enable for inactive keys (legacy hardcoded label)', async () => {
    const wrapper = mountPanel();

    await rowByKey(wrapper, 'k2').trigger('click');

    expect(wrapper.find('#cmc-disable-btn').text()).toBe('Re-enable');
  });

  it('keeps the authority button disabled when only the current authority node is eligible', async () => {
    const wrapper = mountPanel({
      pool: { ...POOL, eligible_authority_nodes: [{ node_id: 'n1', name: 'Alpha' }] },
    });

    await rowByKey(wrapper, 'k1').trigger('click');

    expect((wrapper.find('#cmc-authority-btn').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops the selection when the key disappears from the payload', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');
    expect(rowByKey(wrapper, 'k1').classes()).toContain('selected');

    await wrapper.setProps({ pool: { ...POOL, keys: [POOL.keys![1]!] } });

    expect(wrapper.find('#cmc-delete-btn').attributes('disabled')).toBeDefined();
  });

  it('emits refresh from the toolbar refresh button', async () => {
    const wrapper = mountPanel();

    await wrapper.find('#cmc-refresh-btn').trigger('click');

    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });
});

describe('CmcPoolPanel key mutations (legacy openCmcKeyModal/submitCmcKey)', () => {
  it('adds a key: POSTs the payload with operation_id and refreshes', async () => {
    const wrapper = mountPanel();

    await wrapper.find('#cmc-add-key-btn').trigger('click');
    expect(wrapper.findComponent({ name: 'CmcKeyModal' }).exists()).toBe(true);
    await wrapper.find('#cmc-key-secret').setValue('sec-1');
    await wrapper.find('#cmc-key-label').setValue('New');
    await wrapper.find('#cmc-key-submit').trigger('click');
    await flushPromises();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ api_key: 'sec-1', label: 'New', imported: false, shared: false, active: true });
    expect(typeof body.operation_id).toBe('string');
    expect(wrapper.find('.cmc-modal-backdrop').exists()).toBe(false);
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('rotates the selected key with the same operation id across retries', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-rotate-btn').trigger('click');
    expect(wrapper.find('.cmc-modal-title').text()).toBe('Rotate Primary');
    await wrapper.find('#cmc-key-secret').setValue('sec-2');
    // The first submit 409s (operation in flight server-side): the modal stays
    // open and the pending context keeps the operation id for the retry.
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'in flight' }, 409));
    await wrapper.find('#cmc-key-submit').trigger('click');
    await flushPromises();

    let [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys/k1/rotate');
    const firstOpId = JSON.parse(init.body as string).operation_id;

    // Retry the same rotate: the operations record is resolved first and the
    // pending operation id is replayed, not a new one.
    await wrapper.find('#cmc-key-submit').trigger('click');
    await flushPromises();
    [url, init] = fetchMock.mock.calls[2]!;
    expect(url).toContain('/cmc-pool/keys/k1/rotate');
    expect(JSON.parse(init.body as string).operation_id).toBe(firstOpId);
  });

  it('edits the selected key with a PATCH and no secret', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-edit-btn').trigger('click');
    await wrapper.find('#cmc-key-label').setValue('Renamed');
    await wrapper.find('#cmc-key-submit').trigger('click');
    await flushPromises();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys/k1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ label: 'Renamed', imported: false, shared: true, active: true });
    expect(body.api_key).toBeUndefined();
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('shows the mutation error inside the modal on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'rejected' }, 400));
    const wrapper = mountPanel();

    await wrapper.find('#cmc-add-key-btn').trigger('click');
    await wrapper.find('#cmc-key-secret').setValue('sec');
    await wrapper.find('#cmc-key-submit').trigger('click');
    await flushPromises();

    expect(wrapper.find('.cmc-modal-error').text()).toBe('rejected');
    expect(wrapper.emitted('refresh')).toBeUndefined();
  });

  it('disables every mutation button while a mutation is in flight', async () => {
    let release!: (v: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-disable-btn').trigger('click');
    await flushPromises();

    expect((wrapper.find('#cmc-add-key-btn').element as HTMLButtonElement).disabled).toBe(true);
    expect((wrapper.find('#cmc-delete-btn').element as HTMLButtonElement).disabled).toBe(true);

    release(jsonResponse({}));
    await flushPromises();
    expect((wrapper.find('#cmc-add-key-btn').element as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('CmcPoolPanel enable/disable/delete (legacy toggle/delete flows)', () => {
  it('disables an active key via POST /disable with a query operation id', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-disable-btn').trigger('click');
    await flushPromises();

    expect(wrapper.find('.cmc-pool-message').text()).toBe('Disabling Primary...');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/^http:\/\/pbgui\.test:8000\/api\/services\/cmc-pool\/keys\/k1\/disable\?operation_id=/);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('re-enables an inactive key via PATCH with active:true in the body', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k2').trigger('click');

    await wrapper.find('#cmc-disable-btn').trigger('click');
    await flushPromises();

    expect(wrapper.find('.cmc-pool-message').text()).toBe('Re-enabling Backup...');
    // Re-enable is a body-transport PATCH: the operation id rides in the body.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys/k2');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toMatchObject({ active: true });
    expect(typeof JSON.parse(init.body as string).operation_id).toBe('string');
  });

  it('deletes behind the legacy confirm dialog and clears the selection on success', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-delete-btn').trigger('click');
    await flushPromises();

    expect((window as DialogsGlobal).PBGuiDialogs!.confirm).toHaveBeenCalledWith({
      title: 'Delete CMC key',
      message: 'Delete "Primary" from the pool?',
      detail: 'This publishes a cluster tombstone. The secret cannot be revealed or restored from this UI.',
      confirmText: 'Delete',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/^http:\/\/pbgui\.test:8000\/api\/services\/cmc-pool\/keys\/k1\?operation_id=/);
    expect(init.method).toBe('DELETE');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.find('#cmc-delete-btn').attributes('disabled')).toBeDefined();
  });

  it('skips the request when the delete confirm is rejected', async () => {
    (window as DialogsGlobal).PBGuiDialogs!.confirm.mockResolvedValue(false);
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-delete-btn').trigger('click');
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces non-abort failures in the inline message area', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'denied' }, 403));
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-disable-btn').trigger('click');
    await flushPromises();

    expect(wrapper.find('.cmc-pool-message').text()).toBe('denied');
    expect(wrapper.find('.cmc-pool-message').classes()).toContain('error');
  });
});

describe('CmcPoolPanel authority transfer (legacy openCmcAuthorityModal/submit)', () => {
  it('offers only non-current nodes and transfers behind the confirm dialog', async () => {
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-authority-btn').trigger('click');

    await openSelect(wrapper, '#cmc-authority-target');
    expect(selectOptionTexts()).toEqual(['n2 (n2)']); // n1 holds the authority
    expect(wrapper.find('#cmc-authority-domain').text()).toBe('d1');
    expect(wrapper.find('#cmc-authority-current').text()).toBe('pb1 · epoch 3 · reachable yes');

    await wrapper.find('#cmc-authority-submit').trigger('click');
    await flushPromises();

    expect((window as DialogsGlobal).PBGuiDialogs!.confirm).toHaveBeenCalledWith({
      title: 'Transfer CMC Authority',
      message: 'Transfer quota domain d1 to n2?',
      detail:
        'This authenticated operation advances the authority epoch with compare-and-set. Existing leases remain bound to their original epoch.',
      confirmText: 'Transfer Authority',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/authority/transfer');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ quota_domain_id: 'd1', authority_node_id: 'n2', expected_epoch: 3 });
    expect(typeof body.request_id).toBe('string');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('keeps the modal open and clears the operation id when the confirm is rejected', async () => {
    (window as DialogsGlobal).PBGuiDialogs!.confirm.mockResolvedValue(false);
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-authority-btn').trigger('click');
    await wrapper.find('#cmc-authority-submit').trigger('click');
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('.cmc-modal-backdrop').exists()).toBe(true);
  });

  it('shows the transferred message with the server operation id on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ operation_id: 'srv-op' }));
    const wrapper = mountPanel();
    await rowByKey(wrapper, 'k1').trigger('click');

    await wrapper.find('#cmc-authority-btn').trigger('click');
    await wrapper.find('#cmc-authority-submit').trigger('click');
    await flushPromises();

    expect(wrapper.find('.cmc-pool-message').text()).toContain('srv-op');
    expect(wrapper.find('.cmc-modal-backdrop').exists()).toBe(false);
  });
});
