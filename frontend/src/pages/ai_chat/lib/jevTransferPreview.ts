import { dialogsConfirm } from './dialogs';

interface JevPreviewResponse {
  preview_id?: string;
  payload?: unknown;
}

type AiApi = <Response>(path: string, init?: RequestInit) => Promise<Response>;

interface JevReviewOptions {
  api: AiApi;
  conversationId: string;
  model: string;
  message: string;
}

interface JevReviewResult {
  previewId: string;
  cancelled?: boolean;
}

function containsJevSources(message: string): boolean {
  const trimmedMessage = message.trim();
  const jsonCandidate = trimmedMessage.startsWith('```jev') && trimmedMessage.endsWith('```')
    ? trimmedMessage.slice(6, -3).trim()
    : trimmedMessage;
  if (!jsonCandidate.startsWith('{')) return false;
  try {
    const request = JSON.parse(jsonCandidate) as { sources?: unknown };
    return Array.isArray(request.sources) && request.sources.length > 0;
  } catch {
    return false;
  }
}

export async function discardJevTransfer<Response>(
  api: AiApi,
  conversationId: string,
  previewId: string,
): Promise<Response | undefined> {
  if (!previewId) return undefined;
  return api<Response>(
    `/conversations/${encodeURIComponent(conversationId)}/jev-preview/${encodeURIComponent(previewId)}`,
    { method: 'DELETE' },
  );
}

export async function reviewJevTransfer(options: JevReviewOptions): Promise<JevReviewResult> {
  if (!containsJevSources(options.message)) return { previewId: '' };
  const preview = await options.api<JevPreviewResponse>(
    `/conversations/${encodeURIComponent(options.conversationId)}/jev-preview`,
    {
      method: 'POST',
      body: JSON.stringify({ message: options.message, model: options.model }),
    },
  );
  const previewId = String(preview.preview_id || '');
  let confirmed = false;
  try {
    confirmed = await dialogsConfirm({
      title: 'Review Jev data transfer',
      message: 'PBGui will send the listed PBGui data to OpenRouter. Review the full payload before approving.',
      detail: JSON.stringify(preview.payload, null, 2),
      confirmText: 'Send to OpenRouter',
    });
  } finally {
    if (!confirmed) {
      await discardJevTransfer(options.api, options.conversationId, previewId).catch(() => undefined);
    }
  }
  return confirmed ? { previewId } : { previewId: '', cancelled: true };
}
