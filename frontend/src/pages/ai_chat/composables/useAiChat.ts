/*
 * AI Chat page state — the Vue port of the ai_chat.html IIFE.
 *
 * The legacy page drives the whole surface from one mutable `state` object
 * guarded by generation counters (request/list/proposal/chat/status/login/go);
 * those counters survive here as module-scope `let`s because they must not
 * trigger re-renders, while everything the template binds becomes a ref.
 * Behaviour (poll intervals, generation guards, retry bookkeeping) is kept
 * 1:1 with the legacy script so the drawer and this page stay
 * interchangeable against the same /api/ai contract.
 */
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { apiFetch } from '@/shared/api';
import { getBoot, apiPath } from '@/shared/boot';
import { analysisResultText, type AiProposal, type ProposalPreview } from '../lib/proposal';
import { reviewJevTransfer, discardJevTransfer } from '../lib/jevTransferPreview';

export interface ProviderInfo {
  connected?: boolean;
  available?: boolean;
  plan?: string;
  email?: string;
  profile?: string;
  profiles?: ChatgptProfile[];
  limits?: UsageLimit[];
}

export interface ProviderUsageSummary {
  [key: string]: unknown;
}

export interface ChatgptProfile {
  id: string;
  name: string;
}

export interface UsageLimit {
  usedPercent?: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

export interface ModelHealth {
  status?: string;
}

export interface ReasoningVariant {
  id: string;
  label?: string;
  description?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  free?: boolean;
  tools?: boolean;
  training?: boolean;
  default?: boolean;
  default_effort?: string;
  retention?: string;
  health?: ModelHealth;
  reasoning_variants?: ReasoningVariant[];
  service_tiers?: ReasoningVariant[];
  default_service_tier?: string;
}

export interface ChatMessage {
  role: string;
  content?: string;
}

export interface ResearchItem {
  id: string;
  digest?: string;
  kind?: string;
  status?: string;
  phase?: string;
  revision?: number;
  provider?: string;
  model?: string;
  prompt?: string;
  instructions?: string;
  answer?: string;
  jev_answer?: string;
  jev_questions?: unknown;
  jev_max_cost_usd?: number;
  jev_estimated_cost_usd?: number;
  jev_previous_budget_usd?: number;
  summary?: string;
  error?: string;
  jev_error?: string;
  summary_error?: string;
  resume_jev?: boolean;
}

export interface UiAction {
  type: string;
  action_id: string;
  payload?: { question?: string; choices?: Array<{ label?: string; value?: string }> };
}

export interface ConversationSummary {
  conversation_id: string;
  title?: string;
  model?: string;
  provider?: string;
  chatgpt_profile?: string;
  effort?: string;
  service_tier?: string;
  busy?: boolean;
  last_error?: string;
  activity?: string;
  reasoning_summary?: string;
  activity_history?: Array<{ message?: string }>;
  messages?: ChatMessage[];
  ui_actions?: UiAction[];
  retry_message?: string;
  analysis_only?: boolean;
  research_items?: ResearchItem[];
}

export interface Notice {
  message: string;
  error: boolean;
  working: boolean;
}

interface LoginBoxState {
  visible: boolean;
  instructions: string;
  url: string;
  code: string;
}

export interface ProviderUsage {
  email?: string;
  limits: UsageLimit[];
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

const AI_API_BASE = () => apiPath('/api/ai');

export function useAiChat(t: Translate) {
  /* ── Reactive surface ── */
  const providers = ref<Record<string, ProviderInfo>>({});
  const models = ref<ModelInfo[]>([]);
  const modelsById = ref<Record<string, ModelInfo>>({});
  const providerId = ref('');
  const chatgptProfileId = ref(new URLSearchParams(window.location.search).get('chatgpt_profile') || 'default');
  const modelId = ref('');
  const effort = ref('');
  const serviceTier = ref('');
  const conversations = ref<ConversationSummary[]>([]);
  const conversationId = ref('');
  const conversation = shallowRef<ConversationSummary | null>(null);
  const proposals = ref<AiProposal[]>([]);
  /** Proposal cards whose approve/reject request is in flight — hidden
   * immediately (legacy card.hidden = true, v1.99.9) and restored on error. */
  const resolvingProposalIds = ref<Set<string>>(new Set());
  const transitioning = ref(false);
  const busy = ref(false);
  const pendingMessage = ref('');
  const notice = ref<Notice>({ message: '', error: false, working: false });
  const loginBox = ref<LoginBoxState>({ visible: false, instructions: '', url: '', code: '' });
  const goKey = ref('');
  const retryMessages = ref<Record<string, string>>({});
  const activityStartedAt = ref(0);
  const includeContext = ref(true);
  const chatgptUsage = ref<ProviderUsage>({ email: '', limits: [] });
  const openrouterKey = ref('');
  const openrouterUsage = ref<ProviderUsageSummary | null>(null);
  const goUsage = ref<ProviderUsageSummary | null>(null);

  /* ── Generation guards (non-reactive on purpose) ── */
  let requestGeneration = 0;
  let listGeneration = 0;
  let proposalGeneration = 0;
  let statusGeneration = 0;
  let chatGeneration = 0;
  let loginGeneration = 0;
  let goGeneration = 0;
  const researchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let loginTimer: ReturnType<typeof setTimeout> | null = null;
  let activityTimer: ReturnType<typeof setTimeout> | null = null;
  let loginDeadline = 0;

  const PROVIDER_LABELS: Array<[string, string]> = [
    ['chatgpt', 'ChatGPT'],
    ['opencode-zen', 'OpenCode Zen'],
    ['opencode-go', 'OpenCode Go'],
    ['openrouter', 'OpenRouter'],
  ];

  const chatgpt = computed(() => providers.value.chatgpt || {});
  const chatgptProfiles = computed(() => chatgpt.value.profiles || [{ id: 'default', name: 'Default' }]);
  const go = computed(() => providers.value['opencode-go'] || {});
  const openrouter = computed(() => providers.value.openrouter || {});
  const selectedModel = computed<ModelInfo>(() => modelsById.value[modelId.value] || ({} as ModelInfo));
  const effortVariants = computed(() =>
    Array.isArray(selectedModel.value.reasoning_variants) ? selectedModel.value.reasoning_variants : [],
  );
  const serviceTierVariants = computed(() =>
    Array.isArray(selectedModel.value.service_tiers) ? selectedModel.value.service_tiers : [],
  );
  const messages = computed<ChatMessage[]>(() => {
    const rows = conversation.value?.messages || [];
    if (busy.value && pendingMessage.value && (!rows.length || rows[rows.length - 1]?.content !== pendingMessage.value)) {
      return [...rows, { role: 'user', content: pendingMessage.value }];
    }
    return rows;
  });
  const quickReplyAction = computed(() =>
    conversation.value?.analysis_only
      ? null
      : (conversation.value?.ui_actions || []).find((item) => item && item.type === 'chat.quick_replies') || null,
  );
  /** ProposalList binds this — cards in flight are hidden until they resolve or error. */
  const visibleProposals = computed(() =>
    proposals.value.filter((proposal) =>
      !resolvingProposalIds.value.has(proposal.proposal_id) &&
      (!conversation.value?.analysis_only || proposal.preview?.action === 'reviewed_config_change'),
    ),
  );
  const researchItems = computed(() => conversation.value?.research_items || []);
  const retryMessage = computed(() => retryMessages.value[conversationId.value || '__new__'] || '');
  const reasoningSummary = computed(() => String(conversation.value?.reasoning_summary || ''));
  const activityHistory = computed(() =>
    (conversation.value?.activity_history || [])
      .map((item) => String(item.message || ''))
      .filter(Boolean)
      .join('\n'),
  );
  const conversationLastError = computed(() => conversation.value?.last_error || '');
  const composerEnabled = computed(
    () => Boolean(providerId.value) && Boolean(modelId.value) && !busy.value && !transitioning.value,
  );

  function setNotice(message: string, error = false, working = false): void {
    notice.value = { message, error, working };
  }

  function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (chatgptProfileId.value !== 'default' &&
        (path === '/status' || path.startsWith('/models?') || path.startsWith('/providers/chatgpt/'))) {
      path += (path.includes('?') ? '&' : '?') + 'profile=' + encodeURIComponent(chatgptProfileId.value);
    }
    return apiFetch<T>(AI_API_BASE() + path, { credentials: 'same-origin', ...init });
  }

  /* ── Activity polling (700ms while a turn is running) ── */
  function stopActivityPolling(): void {
    if (activityTimer) clearTimeout(activityTimer);
    activityTimer = null;
    activityStartedAt.value = 0;
  }

  function startActivityPolling(generation: number, id: string, providerLabel: string): void {
    stopActivityPolling();
    activityStartedAt.value = Date.now();
    async function poll(): Promise<void> {
      if (generation !== chatGeneration || !busy.value || id !== conversationId.value) return;
      try {
        const result = await api<ConversationSummary>('/conversations/' + encodeURIComponent(id));
        if (generation !== chatGeneration || !busy.value || id !== conversationId.value) return;
        applyConversationSnapshot(result);
        const elapsed = Math.max(1, Math.round((Date.now() - activityStartedAt.value) / 1000));
        const slowEffort = ['high', 'xhigh', 'max', 'ultra'].indexOf(effort.value) >= 0;
        const timingHint = slowEffort && elapsed >= 60 ? ' · ' + t('ai.chat.slowEffortHint') : '';
        if (result.busy) {
          setNotice(String(result.activity || t('ai.chat.waitingFor', { provider: providerLabel })) + ' · ' + elapsed + 's' + timingHint, false, true);
        } else {
          return;
        }
      } catch {
        // Transient poll errors retry below.
      }
      if (generation === chatGeneration && busy.value && id === conversationId.value) {
        activityTimer = setTimeout(poll, 700);
      }
    }
    void poll();
  }

  /* ── Provider / model plumbing ── */
  function rebuildProviders(): void {
    const current = providerId.value;
    const connected = PROVIDER_LABELS.filter(([id]) => (providers.value[id] || {}).connected);
    if (!connected.some(([id]) => id === current)) providerId.value = connected[0]?.[0] || '';
  }

  function selectedProviderIsConnected(): boolean {
    return Boolean(providerId.value && (providers.value[providerId.value] || {}).connected);
  }

  async function loadModels(preferredModel?: string): Promise<void> {
    const provider = providerId.value;
    const generation = ++requestGeneration;
    const current = preferredModel || modelId.value;
    models.value = [];
    modelsById.value = {};
    if (!provider) {
      modelId.value = '';
      return;
    }
    if (!(providers.value[provider] || {}).connected) {
      modelId.value = '';
      setNotice(t('ai.chat.providerNotConnected'), true);
      return;
    }
    try {
      const result = await api<{ models?: ModelInfo[] }>('/models?provider=' + encodeURIComponent(provider));
      if (generation !== requestGeneration) return;
      models.value = result.models || [];
      const byId: Record<string, ModelInfo> = {};
      let defaultId = '';
      for (const model of models.value) {
        byId[model.id] = model;
        if (model.default) defaultId = model.id;
      }
      modelsById.value = byId;
      if (current && models.value.some((model) => model.id === current)) {
        modelId.value = current;
      } else {
        modelId.value = defaultId;
      }
      const selected = byId[modelId.value];
      serviceTier.value = selected?.default_service_tier || '';
      if (!models.value.length) setNotice(t('ai.chat.noModels'), true);
      else showSelectedModelNotice();
    } catch (error) {
      if (generation === requestGeneration) setNotice((error as Error).message, true);
    }
  }

  function showSelectedModelNotice(): void {
    const model = modelsById.value[modelId.value];
    if (model?.training) {
      setNotice(t('ai.chat.trainingNotice'), true);
    } else if (model && !model.tools) {
      setNotice(t('ai.chat.chatOnlyNotice'), false);
    } else {
      setNotice('', false);
    }
  }

  async function refreshStatus(): Promise<void> {
    const generation = ++statusGeneration;
    try {
      const result = await api<{ providers?: Record<string, ProviderInfo> }>('/status');
      if (generation !== statusGeneration) return;
      providers.value = result.providers || {};
      const selectedProfile = chatgpt.value.profile || chatgptProfileId.value;
      if (selectedProfile) chatgptProfileId.value = selectedProfile;
      chatgptUsage.value = {
        email: chatgpt.value.email || '',
        limits: Array.isArray(chatgpt.value.limits) ? chatgpt.value.limits : [],
      };
      await Promise.all([refreshProviderUsage('openrouter', openrouterUsage), refreshProviderUsage('opencode-go', goUsage)]);
      rebuildProviders();
      await loadModels();
      if (loginBox.value.visible && chatgpt.value.connected) {
        stopLoginPolling();
        hideLoginBox();
        setNotice(t('ai.chat.chatgptConnected'));
      }
    } catch (error) {
      if (generation === statusGeneration) setNotice((error as Error).message, true);
    }
  }

  async function refreshProviderUsage(provider: string, target: { value: ProviderUsageSummary | null }): Promise<void> {
    if (!(providers.value[provider] || {}).connected) {
      target.value = null;
      return;
    }
    try {
      target.value = await api<ProviderUsageSummary>('/usage?provider=' + encodeURIComponent(provider));
    } catch {
      target.value = null;
    }
  }

  /* ── Conversation snapshot application ── */
  function applyConversationSnapshot(snapshot: ConversationSummary | null): void {
    if (!snapshot || snapshot.conversation_id !== conversationId.value) return;
    conversation.value = snapshot;
    (snapshot.research_items || []).forEach(scheduleResearchPolling);
    busy.value = Boolean(snapshot.busy);
    if (!busy.value) {
      pendingMessage.value = '';
      stopActivityPolling();
    }
    if (snapshot.retry_message) retryMessages.value[snapshot.conversation_id] = snapshot.retry_message;
    if (snapshot.busy) setNotice(snapshot.activity || t('ai.chat.modelWorking'), false, true);
    else setNotice(snapshot.last_error || (snapshot.analysis_only ? t('ai.chat.analysisOnly') : ''), Boolean(snapshot.last_error), false);
    const summary = conversations.value.find((item) => item.conversation_id === snapshot.conversation_id);
    if (summary) Object.assign(summary, snapshot);
    if (!snapshot.busy && !snapshot.last_error) delete retryMessages.value[snapshot.conversation_id];
  }

  async function reconcileProposals(id: string): Promise<void> {
    if (!id || id !== conversationId.value) {
      proposals.value = [];
      resolvingProposalIds.value = new Set();
      return;
    }
    const generation = ++proposalGeneration;
    if (busy.value) {
      proposals.value = [];
      resolvingProposalIds.value = new Set();
      return;
    }
    try {
      const pending = await api<{ proposals?: AiProposal[] }>('/proposals?conversation_id=' + encodeURIComponent(id));
      if (generation === proposalGeneration && id === conversationId.value && !busy.value) {
        proposals.value = pending.proposals || [];
        resolvingProposalIds.value = new Set();
      }
    } catch (error) {
      if (id === conversationId.value) setNotice((error as Error).message, true);
    }
  }

  function clearResearchTimer(id: string): void {
    const timer = researchTimers.get(id);
    if (timer) clearTimeout(timer);
    researchTimers.delete(id);
  }

  function scheduleResearchPolling(item: ResearchItem): void {
    clearResearchTimer(item.id);
    if (item.status !== 'running' || item.id === '') return;
    researchTimers.set(item.id, setTimeout(() => { void refreshResearchItem(item.id); }, 1500));
  }

  async function refreshResearchItem(id: string): Promise<void> {
    if (!id || !conversationId.value) return;
    const generation = chatGeneration;
    try {
      const item = await api<ResearchItem>('/research/' + encodeURIComponent(id));
      if (generation !== chatGeneration || !conversation.value || conversation.value.conversation_id !== conversationId.value) return;
      const items = (conversation.value.research_items || []).map((current) => current.id === id ? item : current);
      conversation.value = { ...conversation.value, research_items: items };
      if (item.status === 'running') scheduleResearchPolling(item);
      else clearResearchTimer(id);
    } catch (error) {
      clearResearchTimer(id);
      setNotice((error as Error).message, true);
    }
  }

  async function actResearch(id: string, action: 'start' | 'cancel'): Promise<void> {
    const item = researchItems.value.find((candidate) => candidate.id === id);
    if (!item) return;
    clearResearchTimer(id);
    try {
      const updated = await api<ResearchItem>('/research/' + encodeURIComponent(id) + '/' + action, {
        method: 'POST',
        body: JSON.stringify(action === 'start' ? { digest: item.digest } : {}),
      });
      if (conversation.value) {
        conversation.value = {
          ...conversation.value,
          research_items: (conversation.value.research_items || []).map((current) => current.id === id ? updated : current),
        };
      }
      scheduleResearchPolling(updated);
    } catch (error) {
      setNotice((error as Error).message, true);
      if (action === 'start') scheduleResearchPolling({ ...item, status: 'running' });
    }
  }

  async function loadConversation(id: string): Promise<void> {
    if (!id) return;
    const generation = ++chatGeneration;
    stopActivityPolling();
    conversationId.value = id;
    pendingMessage.value = '';
    transitioning.value = true;
    try {
      const snapshot = await api<ConversationSummary>('/conversations/' + encodeURIComponent(id));
      if (generation !== chatGeneration || id !== conversationId.value) return;
      if (PROVIDER_LABELS.some(([provider]) => provider === snapshot.provider)) {
        providerId.value = snapshot.provider || '';
        if (snapshot.chatgpt_profile) chatgptProfileId.value = snapshot.chatgpt_profile;
        await loadModels(snapshot.model);
      }
      if (generation !== chatGeneration || id !== conversationId.value) return;
      const model = modelsById.value[modelId.value] || ({} as ModelInfo);
      const variantIds = (model.reasoning_variants || []).map((variant: ReasoningVariant) => variant && variant.id);
      effort.value = variantIds.indexOf(snapshot.effort || '') >= 0 ? snapshot.effort || '' : '';
      const tierIds = (model.service_tiers || []).map((tier: ReasoningVariant) => tier && tier.id);
      serviceTier.value = tierIds.indexOf(snapshot.service_tier || '') >= 0
        ? snapshot.service_tier || ''
        : model.default_service_tier || '';
      applyConversationSnapshot(snapshot);
      await reconcileProposals(id);
      if (snapshot.busy) {
        const label = (PROVIDER_LABELS.find(([provider]) => provider === providerId.value) || ['', providerId.value])[1];
        startActivityPolling(generation, id, label);
      }
    } catch (error) {
      if (generation === chatGeneration) setNotice((error as Error).message, true);
    } finally {
      if (generation === chatGeneration) transitioning.value = false;
    }
  }

  async function loadConversations(preferredId?: string): Promise<void> {
    const generation = ++listGeneration;
    try {
      const result = await api<{ conversations?: ConversationSummary[] }>('/conversations');
      if (generation !== listGeneration) return;
      conversations.value = result.conversations || [];
      let selectedId = preferredId || conversationId.value;
      if (!conversations.value.some((item) => item.conversation_id === selectedId)) {
        selectedId = conversations.value[0]?.conversation_id || '';
      }
      if (selectedId) await loadConversation(selectedId);
      else await newChat();
    } catch (error) {
      setNotice((error as Error).message, true);
    }
  }

  async function loadConversationSummary(): Promise<void> {
    const generation = ++listGeneration;
    const result = await api<{ conversations?: ConversationSummary[] }>('/conversations');
    if (generation !== listGeneration) return;
    conversations.value = result.conversations || [];
  }

  async function newChat(keepTransition = false): Promise<void> {
    transitioning.value = true;
    ++chatGeneration;
    stopActivityPolling();
    conversationId.value = '';
    conversation.value = null;
    busy.value = false;
    pendingMessage.value = '';
    delete retryMessages.value.__new__;
    proposals.value = [];
    resolvingProposalIds.value = new Set();
    if (modelId.value) showSelectedModelNotice();
    else if (!selectedProviderIsConnected()) setNotice(t('ai.chat.providerNotConnected'), true);
    else setNotice('', false);
    if (!keepTransition) transitioning.value = false;
  }

  /* ── Turn lifecycle ── */
async function sendMessage(retryText?: string): Promise<void> {
    const message = String(retryText == null ? draft.value : retryText).trim();
    if (!message || busy.value) return;
    if (!selectedProviderIsConnected() || !modelId.value) {
      setNotice(t('ai.chat.providerNotConnected'), true);
      return;
    }
    const generation = chatGeneration;
    const retryKey = conversationId.value || '__new__';
    busy.value = true;
    pendingMessage.value = message;
    retryMessages.value[retryKey] = message;
    if (retryText == null) draft.value = '';
    setNotice(t('ai.chat.startingConversation'), false, true);
    try {
      if (!conversationId.value) {
        const conversationPayload: { provider: string; model: string; effort: string; profile?: string } = {
          provider: providerId.value,
          model: modelId.value,
          effort: effort.value,
        };
        if (chatgptProfileId.value !== 'default') conversationPayload.profile = chatgptProfileId.value;
        const created = await api<{ conversation_id: string }>('/conversations', {
          method: 'POST',
          body: JSON.stringify(
            serviceTier.value
              ? { ...conversationPayload, service_tier: serviceTier.value }
              : conversationPayload,
          ),
        });
        if (generation !== chatGeneration) return;
        conversationId.value = created.conversation_id;
        retryMessages.value[conversationId.value] = retryMessages.value[retryKey];
        if (retryKey === '__new__') delete retryMessages.value[retryKey];
        await loadConversationSummary();
      }
      retryMessages.value[conversationId.value] = message;
      if (generation !== chatGeneration) return;
      conversation.value = null;
      const providerLabel = (PROVIDER_LABELS.find(([provider]) => provider === providerId.value) || ['', providerId.value])[1];
      setNotice(t('ai.chat.waitingFor', { provider: providerLabel }), false, true);
      const conversationKey = conversationId.value;
      let jevPreviewId = '';
      if (providerId.value === 'openrouter') {
        const review = await reviewJevTransfer({
          api,
          conversationId: conversationKey,
          model: modelId.value,
          message,
        });
        if (review.cancelled) {
          busy.value = false;
          pendingMessage.value = '';
          draft.value = message;
          setNotice(t('ai.chat.jevTransferCancelled'));
          return;
        }
        jevPreviewId = review.previewId;
      }
      try {
        await api('/conversations/' + encodeURIComponent(conversationKey) + '/turns', {
          method: 'POST',
          body: JSON.stringify({
            message: message,
            effort: effort.value,
            service_tier: serviceTier.value,
            model: modelId.value,
            provider: providerId.value,
            jev_preview_id: jevPreviewId || null,
            context:
              includeContext.value && window.PBGuiAI && typeof window.PBGuiAI.collectContext === 'function'
                ? window.PBGuiAI.collectContext()
                : null,
          }),
        });
      } catch (error) {
        if (jevPreviewId) await discardJevTransfer(api, conversationKey, jevPreviewId).catch(() => undefined);
        throw error;
      }
      if (generation !== chatGeneration) return;
      startActivityPolling(generation, conversationId.value, providerLabel);
    } catch (error) {
      if (generation === chatGeneration) {
        stopActivityPolling();
        busy.value = false;
        pendingMessage.value = '';
        setNotice((error as Error).message, true);
      }
    }
  }

  async function stopCurrentTurn(): Promise<void> {
    if (!busy.value) return;
    const id = conversationId.value;
    setNotice(t('ai.chat.stopping'), false);
    if (!id) {
      ++chatGeneration;
      busy.value = false;
      pendingMessage.value = '';
      stopActivityPolling();
      setNotice(t('ai.chat.responseStopped'));
      return;
    }
    if (id) {
      try {
        await api('/conversations/' + encodeURIComponent(id) + '/cancel', { method: 'POST' });
        await loadConversation(id);
      } catch (error) {
        setNotice((error as Error).message, true);
      }
    }
  }

  async function deleteCurrentConversation(): Promise<void> {
    if (!conversationId.value) return;
    const id = conversationId.value;
    transitioning.value = true;
    try {
      await api('/conversations/' + encodeURIComponent(id), { method: 'DELETE' });
      delete retryMessages.value[id];
      conversationId.value = '';
      await loadConversations();
    } catch (error) {
      setNotice((error as Error).message, true);
    } finally {
      transitioning.value = false;
    }
  }

  async function rewindToMessage(messageIndex: number): Promise<{ restored: string }> {
    const restored = { restored: '' };
    if (!conversationId.value || busy.value) return restored;
    try {
      const result = await api<ConversationSummary & { restored_prompt?: string }>(
        '/conversations/' + encodeURIComponent(conversationId.value) + '/rewind',
        { method: 'POST', body: JSON.stringify({ message_index: messageIndex }) },
      );
      restored.restored = String(result.restored_prompt || '');
      applyConversationSnapshot(result);
      setNotice(t('ai.chat.rewound'));
    } catch (error) {
      setNotice((error as Error).message, true);
    }
    return restored;
  }

  /* ── Proposal approval ── */
  async function resolveProposal(proposal: AiProposal, approve: boolean, reviewToken = ''): Promise<void> {
    const preview = (proposal.preview || {}) as ProposalPreview;
    const id = conversationId.value;
    // v1.99.9 (ai_chat.html / ai_drawer.js): hide the card and show a working
    // notice the moment the request leaves; only an error restores it.
    const resolving = new Set(resolvingProposalIds.value);
    resolving.add(proposal.proposal_id);
    resolvingProposalIds.value = resolving;
    setNotice(approve ? t('ai.chat.applyingAction') : t('ai.chat.rejectingProposal'), false, true);
    try {
      const suffix = approve ? '/approve' : '/reject';
      const result = await api<{ status?: string; action?: string }>(
        '/proposals/' + encodeURIComponent(proposal.proposal_id) + suffix,
        {
          method: 'POST',
          body: JSON.stringify({ payload_digest: proposal.payload_digest, conversation_id: id, ...(reviewToken ? { review_token: reviewToken } : {}) }),
        },
      );
      const executed = result.status === 'executed';
      if (executed && result.action === 'python_analysis') {
        appendAssistantAnalysis(result as unknown as Parameters<typeof analysisResultText>[0]);
      }
      if (executed) {
        window.PBGuiAI?.openQueuedBacktestCompare?.(result);
        window.dispatchEvent(new CustomEvent('pbgui:ai-action-completed', { detail: result }));
      }
      setNotice(
        executed
          ? t('ai.chat.actionCompleted', { action: String(result.action || 'approved') })
          : t('ai.chat.proposalStatus', { status: String(result.status || 'rejected') }),
      );
    } catch (error) {
      if (id === conversationId.value) {
        const restored = new Set(resolvingProposalIds.value);
        restored.delete(proposal.proposal_id);
        resolvingProposalIds.value = restored;
      }
      setNotice((error as Error).message, true);
    } finally {
      if (id === conversationId.value) await reconcileProposals(id);
    }
  }

  async function reviewProposal(proposal: AiProposal): Promise<{ proposal: AiProposal; reviewToken: string }> {
    const id = conversationId.value;
    const result = await api<{ proposal: AiProposal; review_token: string }>(
      '/proposals/' + encodeURIComponent(proposal.proposal_id) + '/review',
      {
        method: 'POST',
        body: JSON.stringify({ payload_digest: proposal.payload_digest, conversation_id: id }),
      },
    );
    return { proposal: result.proposal, reviewToken: result.review_token };
  }

  function appendAssistantAnalysis(result: Parameters<typeof analysisResultText>[0]): void {
    const snapshot = conversation.value;
    if (!snapshot) return;
    snapshot.messages = [...(snapshot.messages || []), { role: 'assistant', content: analysisResultText(result) }];
    conversation.value = { ...snapshot };
  }

  /* ── Provider connection flows ── */
  function hideLoginBox(): void {
    loginBox.value = { visible: false, instructions: '', url: '', code: '' };
  }

  function stopLoginPolling(): void {
    if (loginTimer) clearTimeout(loginTimer);
    loginTimer = null;
    loginDeadline = 0;
    ++statusGeneration;
  }

  function scheduleLoginPoll(): void {
    if (!loginBox.value.visible) return;
    if (Date.now() >= loginDeadline) {
      stopLoginPolling();
      hideLoginBox();
      setNotice(t('ai.chat.loginTimeout'), true);
      return;
    }
    loginTimer = setTimeout(async () => {
      await refreshStatus();
      if (loginDeadline) scheduleLoginPoll();
    }, 2000);
  }

  async function startChatgptLogin(mode: 'browser' | 'device'): Promise<void> {
    const generation = ++loginGeneration;
    try {
      const path = mode === 'device' ? '/providers/chatgpt/device-login' : '/providers/chatgpt/browser-login';
      const login = await api<{ verification_url?: string; auth_url?: string; user_code?: string }>(path, {
        method: 'POST',
      });
      if (generation !== loginGeneration) return;
      const loginUrl = mode === 'device' ? login.verification_url : login.auth_url;
      loginBox.value = {
        visible: true,
        instructions: mode === 'device' ? t('ai.chat.loginDeviceInstructions') : t('ai.chat.loginBrowserInstructions'),
        url: String(loginUrl || ''),
        code: mode === 'device' ? String(login.user_code || '') : '',
      };
      stopLoginPolling();
      loginDeadline = Date.now() + 10 * 60 * 1000;
      scheduleLoginPoll();
    } catch (error) {
      if (generation === loginGeneration) setNotice((error as Error).message, true);
    }
  }

  async function cancelChatgptLogin(): Promise<void> {
    ++loginGeneration;
    stopLoginPolling();
    hideLoginBox();
    try {
      await api('/providers/chatgpt/login-cancel', { method: 'POST' });
    } catch {
      // Cancellation is best-effort; the server also expires the flow.
    }
  }

  async function disconnectChatgpt(): Promise<void> {
    transitioning.value = true;
    try {
      await newChat(true);
      await api('/providers/chatgpt/connection', { method: 'DELETE' });
      await refreshStatus();
    } catch (error) {
      setNotice((error as Error).message, true);
    } finally {
      transitioning.value = false;
    }
  }

  async function onChatgptProfileChange(profile: string): Promise<void> {
    if (!profile || profile === chatgptProfileId.value) return;
    chatgptProfileId.value = profile;
    const url = new URL(window.location.href);
    if (profile === 'default') url.searchParams.delete('chatgpt_profile');
    else url.searchParams.set('chatgpt_profile', profile);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    await newChat();
    await refreshStatus();
    await loadConversations();
  }

  async function connectGo(): Promise<void> {
    const key = goKey.value.trim();
    if (!key) {
      setNotice(t('ai.chat.enterGoKey'), true);
      return;
    }
    const generation = ++goGeneration;
    transitioning.value = true;
    try {
      await api('/providers/opencode-go/connect', {
        method: 'POST',
        body: JSON.stringify({ api_key: key }),
      });
      if (generation !== goGeneration) return;
      goKey.value = '';
      setNotice(t('ai.chat.goConnected'));
      await refreshStatus();
    } catch (error) {
      if (generation === goGeneration) {
        goKey.value = '';
        setNotice((error as Error).message, true);
      }
    } finally {
      if (generation === goGeneration) transitioning.value = false;
    }
  }

  async function disconnectGo(): Promise<void> {
    ++goGeneration;
    transitioning.value = true;
    try {
      await newChat(true);
      await api('/providers/opencode-go/connection', { method: 'DELETE' });
      await refreshStatus();
    } catch (error) {
      setNotice((error as Error).message, true);
    } finally {
      transitioning.value = false;
    }
  }

  async function refreshModelHealth(): Promise<void> {
    try {
      await api('/models/health-refresh', { method: 'POST' });
      setNotice(t('ai.chat.healthQueued'));
    } catch (error) {
      setNotice((error as Error).message, true);
    }
  }

  async function onProviderChange(): Promise<void> {
    transitioning.value = true;
    try {
      await loadModels();
    } finally {
      transitioning.value = false;
    }
  }

  function onModelChange(): void {
    const model = modelsById.value[modelId.value] || ({} as ModelInfo);
    const variantIds = (model.reasoning_variants || []).map((variant: ReasoningVariant) => variant && variant.id);
    if (variantIds.indexOf(effort.value) < 0) effort.value = '';
    const tierIds = (model.service_tiers || []).map((tier: ReasoningVariant) => tier && tier.id);
    if (tierIds.indexOf(serviceTier.value) < 0) serviceTier.value = model.default_service_tier || '';
    showSelectedModelNotice();
  }

  /* Composer draft lives here so New chat / rewind can seed it. */
  const draft = ref('');

  function onQuickReplyAck(actionId: string, value: string): Promise<void> {
    const id = conversationId.value;
    return api('/conversations/' + encodeURIComponent(id) + '/ui-actions/' + encodeURIComponent(actionId) + '/ack', {
      method: 'POST',
    })
      .then(() => sendMessage(value))
      .catch((error: Error) => setNotice(error.message, true));
  }

  async function connectOpenrouter(): Promise<void> {
    const key = openrouterKey.value.trim();
    if (!key) {
      setNotice(t('ai.chat.enterOpenrouterKey'), true);
      return;
    }
    transitioning.value = true;
    try {
      await api('/providers/openrouter/connect', { method: 'POST', body: JSON.stringify({ api_key: key }) });
      openrouterKey.value = '';
      setNotice(t('ai.chat.openrouterConnected'));
      await refreshStatus();
    } catch (error) {
      openrouterKey.value = '';
      setNotice((error as Error).message, true);
    } finally {
      transitioning.value = false;
    }
  }

  async function disconnectOpenrouter(): Promise<void> {
    transitioning.value = true;
    try {
      await newChat(true);
      await api('/providers/openrouter/connection', { method: 'DELETE' });
      await refreshStatus();
    } catch (error) {
      setNotice((error as Error).message, true);
    } finally {
      transitioning.value = false;
    }
  }

  onBeforeUnmount(() => {
    stopLoginPolling();
    stopActivityPolling();
    researchTimers.forEach((timer) => clearTimeout(timer));
    researchTimers.clear();
  });

  async function initialize(): Promise<void> {
    await refreshStatus();
    await loadConversations();
  }

  return {
    providers,
    chatgpt,
    chatgptProfiles,
    chatgptProfileId,
    chatgptUsage,
    go,
    goUsage,
    openrouter,
    openrouterKey,
    openrouterUsage,
    models,
    modelsById,
    providerId,
    modelId,
    effort,
    effortVariants,
    serviceTier,
    serviceTierVariants,
    selectedModel,
    conversations,
    conversationId,
    conversation,
    messages,
    quickReplyAction,
    proposals,
    visibleProposals,
    transitioning,
    busy,
    pendingMessage,
    notice,
    loginBox,
    goKey,
    includeContext,
    draft,
    retryMessage,
    reasoningSummary,
    activityHistory,
    researchItems,
    conversationLastError,
    composerEnabled,
    setNotice,
    initialize,
    loadModels,
    loadConversation,
    loadConversations,
    newChat,
    sendMessage,
    stopCurrentTurn,
    deleteCurrentConversation,
    rewindToMessage,
    resolveProposal,
    reviewProposal,
    refreshResearchItem,
    actResearch,
    startChatgptLogin,
    cancelChatgptLogin,
    disconnectChatgpt,
    connectGo,
    disconnectGo,
    connectOpenrouter,
    disconnectOpenrouter,
    refreshModelHealth,
    onProviderChange,
    onChatgptProfileChange,
    onModelChange,
    onQuickReplyAck,
  };
}
