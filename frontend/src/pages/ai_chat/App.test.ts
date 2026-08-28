import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, selectOptionTexts } from '@/shared/testing/select';
import App from './App.vue';
import { detectedQuickReplies, proposalActionLabel, proposalDetail, proposalReviewText, proposalDiffValue } from './lib/proposal';

/* Page-shell integration: mount, provider/model plumbing, conversation
   list, send flow and proposal approval (the contract the legacy
   ai_chat.html script implemented). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

const STATUS = {
  providers: {
    chatgpt: { connected: true, available: true, plan: 'plus' },
    'opencode-go': { connected: true, available: true },
  },
};

const MODELS = {
  models: [
    { id: 'gpt-x', name: 'GPT X', tools: true, free: false, default: true },
    { id: 'zen-free', name: 'Zen Free', tools: true, free: true },
  ],
};

const CONVERSATIONS = {
  conversations: [
    {
      conversation_id: 'c1',
      title: 'Optimizer talk',
      model: 'gpt-x',
      provider: 'chatgpt',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    },
  ],
};

const PROPOSALS = {
  proposals: [
    {
      proposal_id: 'p1',
      payload_digest: 'digest-1',
      preview: {
        action: 'save',
        name: 'cfg-v8',
        changed_count: 3,
        changes: [{ path: 'backtest.n_days', before: 180, after: 365 }],
      },
    },
  ],
};

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/ai/main_page');
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/status')) return Promise.resolve(jsonResponse(STATUS));
    if (u.includes('/models?provider=')) return Promise.resolve(jsonResponse(MODELS));
    if (u.endsWith('/conversations') && (!init || init.method !== 'POST')) {
      return Promise.resolve(jsonResponse(CONVERSATIONS));
    }
    if (u.endsWith('/conversations') && init?.method === 'POST') {
      return Promise.resolve(jsonResponse({ conversation_id: 'c2' }));
    }
    if (/\/conversations\/[^/]+$/.test(u)) return Promise.resolve(jsonResponse(CONVERSATIONS.conversations[0]));
    if (u.includes('/proposals?')) return Promise.resolve(jsonResponse(PROPOSALS));
    void init;
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('AI Chat page shell', () => {
  it('renders connected providers and the conversation list', async () => {
    const wrapper = await mountApp();

    // ChatGPT connected: login buttons hidden, disconnect shown.
    expect(wrapper.text()).toContain('Connected · plus');
    expect(wrapper.text()).toContain('Optimizer talk');

    // Provider/model selects are populated from /status + /models.
    await openSelect(wrapper, '#provider-select');
    expect(selectOptionTexts()).toEqual(['ChatGPT', 'OpenCode Go']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await openSelect(wrapper, '#model-select');
    expect(selectOptionTexts().map((text) => text.split(' · ')[0])).toEqual(['Zen Free', 'GPT X']);
    expect(document.title).toBe('AI Chat - PBGui');
  });

  it('renders conversation messages', async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain('hello');
    expect(wrapper.text()).toContain('hi there');
  });

  it('submits a turn to the loaded conversation on send', async () => {
    const wrapper = await mountApp();

    const textarea = wrapper.find('#prompt');
    await textarea.setValue('what optimizer configs exist?');
    await wrapper.find('#send').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The mount flow selected conversation c1, so the turn extends it.
    const turn = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/c1/turns'));
    expect(turn).toBeTruthy();
    const turnBody = JSON.parse(String(turn![1]!.body));
    expect(turnBody.message).toBe('what optimizer configs exist?');
    expect(turnBody.provider).toBe('chatgpt');
    expect(turnBody.model).toBe('gpt-x');
    // v1.99.2 extends the context with actions/controls; the core page
    // identity fields stay the contract under test here.
    expect(turnBody.context).toMatchObject({
      schema_version: 1,
      page_key: 'info_ai_chat',
      title: 'AI Chat',
      guide_topic: '',
      section: 'Conversations',
      entities: [],
    });
    expect(turnBody.context.actions).toContainEqual({ id: 'activate', entity_kind: 'ui_control' });
  });

  it('creates a conversation when none exists yet', async () => {
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/status')) return Promise.resolve(jsonResponse(STATUS));
      if (u.includes('/models?provider=')) return Promise.resolve(jsonResponse(MODELS));
      if (u.endsWith('/conversations') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ conversation_id: 'c2' }));
      }
      if (u.endsWith('/conversations')) return Promise.resolve(jsonResponse({ conversations: [] }));
      if (/\/conversations\/[^/]+$/.test(u)) return Promise.resolve(jsonResponse({ conversation_id: 'c2', messages: [] }));
      if (u.includes('/proposals?')) return Promise.resolve(jsonResponse({ proposals: [] }));
      void init;
      return Promise.resolve(jsonResponse({}));
    });

    const wrapper = await mountApp();

    const textarea = wrapper.find('#prompt');
    await textarea.setValue('first message');
    await wrapper.find('#send').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const post = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/conversations') && call[1]?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post![1]!.body))).toEqual({ provider: 'chatgpt', model: 'gpt-x', effort: '' });

    const turn = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/c2/turns'));
    expect(turn).toBeTruthy();
    expect(JSON.parse(String(turn![1]!.body)).message).toBe('first message');
  });

  it('renders pending proposals with review and approval controls', async () => {
    const wrapper = await mountApp();

    const approveSpy = vi.fn(() => Promise.resolve(true));
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm: approveSpy };

    const proposal = wrapper.text();
    expect(proposal).toContain('Save PB8 optimizer config: cfg-v8');
    expect(proposal).toContain('3 changed fields');

    const approveButtons = wrapper.findAll('button').filter((button) => button.text() === 'Review & approve');
    expect(approveButtons.length).toBe(1);
    await approveButtons[0]!.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(approveSpy).toHaveBeenCalled();
    const approveCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/p1/approve'));
    expect(approveCall).toBeTruthy();
    expect(JSON.parse(String(approveCall![1]!.body))).toEqual({ payload_digest: 'digest-1', conversation_id: 'c1' });

    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
  });

  it('hides the proposal card the moment its approve request leaves (v1.99.9)', async () => {
    const wrapper = await mountApp();
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm: vi.fn(() => Promise.resolve(true)) };

    let releaseApprove!: (response: Response) => void;
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/p1/approve')) {
        return new Promise<Response>((resolve) => {
          releaseApprove = resolve;
        });
      }
      if (u.includes('/proposals?')) return Promise.resolve(jsonResponse(PROPOSALS));
      return Promise.resolve(jsonResponse({}));
    });

    const approveButton = wrapper.findAll('button').filter((button) => button.text() === 'Review & approve')[0]!;
    await approveButton.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // request in flight: the card is hidden, not just its buttons disabled
    expect(wrapper.text()).not.toContain('Save PB8 optimizer config');

    releaseApprove(jsonResponse({ status: 'executed', action: 'save' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
  });

  it('restores the proposal card when the approve request fails (v1.99.9)', async () => {
    const wrapper = await mountApp();
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm: vi.fn(() => Promise.resolve(true)) };

    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/p1/approve')) {
        return Promise.resolve(new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }));
      }
      if (u.includes('/proposals?')) return Promise.resolve(jsonResponse(PROPOSALS));
      return Promise.resolve(jsonResponse({}));
    });

    const approveButton = wrapper.findAll('button').filter((button) => button.text() === 'Review & approve')[0]!;
    await approveButton.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // the failure surfaces in the notice AND restores the card so the user can retry
    expect(wrapper.text()).toContain('API 500: boom');
    expect(wrapper.text()).toContain('Save PB8 optimizer config: cfg-v8');
    const retryButtons = wrapper.findAll('button').filter((button) => button.text() === 'Review & approve');
    expect(retryButtons.length).toBe(1);

    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
  });
});

describe('AI proposal pure helpers', () => {
  it('labels known actions and defaults unknown ones', () => {
    const t = (key: string) => key;
    expect(proposalActionLabel('save', t)).toBe('ai.proposal.actionSave');
    expect(proposalActionLabel('python_analysis', t)).toBe('ai.proposal.actionPythonAnalysis');
    expect(proposalActionLabel('mystery', t)).toBe('ai.proposal.actionDefault');
  });

  it('details python analysis and changed-field previews', () => {
    const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);
    expect(proposalDetail({ action: 'python_analysis', code_bytes: 120, input_summary: { bytes: 80 } }, t)).toContain('120');
    expect(proposalDetail({ action: 'python_analysis', code_bytes: 120, input_summary: { bytes: 80 } }, t)).toContain('80');
    expect(proposalDetail({ action: 'save', changed_count: 2 }, t)).toContain('2');
  });

  it('reviews proposals as JSON and diffs missing values', () => {
    const review = proposalReviewText({ proposal_id: 'p9', payload_digest: 'd9', preview: { action: 'save', changed_count: 1 } });
    expect(review).toContain('"payload_digest"');
    expect(review).toContain('"changed_count": 1');
    expect(proposalDiffValue(undefined)).toBe('(missing)');
    expect(proposalDiffValue('x')).toBe('x');
    expect(proposalDiffValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('detects numbered quick-reply choices only in question phrasings', () => {
    const text = 'Should I continue?\n1. **Use the current config**\n2. **Switch to the new config**';
    expect(detectedQuickReplies(text)).toEqual(['Use the current config', 'Switch to the new config']);
    expect(detectedQuickReplies('plain answer\n1. one\n2. two')).toEqual([]);
    expect(detectedQuickReplies('choose:\n1. only-one-choice')).toEqual([]);
  });
});
