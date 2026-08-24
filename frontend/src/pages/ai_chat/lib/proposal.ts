/*
 * Pure render helpers for AI proposals, ported 1:1 from ai_chat.html
 * (proposalActionLabel / proposalDetail / proposalReviewText /
 * proposalDiffValue / analysisResultText / detectedQuickReplies) — the
 * strings are user-facing review surfaces, so keep them byte-identical
 * with the legacy page to avoid re-testing approval copy.
 */

export interface ProposalChange {
  path?: string;
  before?: unknown;
  after?: unknown;
}

export interface ProposalPreview {
  action?: string;
  name?: string;
  changes?: ProposalChange[];
  may_start_immediately?: boolean;
  changed_count?: number;
  code?: string;
  code_bytes?: number;
  input_data?: unknown;
  input_summary?: { bytes?: number };
  input_resource?: unknown;
  job_count?: number;
  exchanges?: string[];
  template?: string;
  layout?: { rows?: number; columns?: number };
}

export interface AiProposal {
  proposal_id: string;
  payload_digest: string;
  preview?: ProposalPreview;
}

export interface AnalysisResult {
  analysis_status?: string;
  exit_code?: number | string;
  output?: { format?: string; value?: unknown; text?: string };
  stderr?: string;
  stdout_truncated?: boolean;
  stderr_truncated?: boolean;
}

export function proposalActionLabel(action: string | undefined, t: (key: string) => string): string {
  switch (action) {
    case 'save':
      return t('ai.proposal.actionSave');
    case 'save_and_queue':
      return t('ai.proposal.actionSaveAndQueue');
    case 'queue':
      return t('ai.proposal.actionQueue');
    case 'queue_backtests':
      return t('ai.proposal.actionQueueBacktests');
    case 'create_dashboard':
      return t('ai.proposal.actionCreateDashboard');
    case 'save_dashboard_layout':
      return t('ai.proposal.actionSaveDashboardLayout');
    case 'python_analysis':
      return t('ai.proposal.actionPythonAnalysis');
    default:
      return t('ai.proposal.actionDefault');
  }
}

export function proposalDetail(preview: ProposalPreview, t: (key: string, params?: Record<string, unknown>) => string): string {
  if (preview.action === 'python_analysis') {
    return t('ai.proposal.detailPython', {
      codeBytes: String(preview.code_bytes || 0),
      inputBytes: String((preview.input_summary || {}).bytes || 0),
    });
  }
  if (preview.action === 'queue_backtests') {
    return (
      t('ai.proposal.detailBacktests', {
        jobs: String(preview.job_count || 0),
        exchanges: String((preview.exchanges || []).length),
      }) + (preview.may_start_immediately ? ' · ' + t('ai.proposal.mayStart') : '')
    );
  }
  if (preview.action === 'create_dashboard') {
    return t('ai.proposal.detailCreateDashboard', { template: String(preview.template || '') });
  }
  if (preview.action === 'save_dashboard_layout') {
    return t('ai.proposal.detailSaveLayout', {
      rows: String((preview.layout || {}).rows || 0),
      columns: String((preview.layout || {}).columns || 0),
      changes: String(preview.changed_count || 0),
    });
  }
  return t('ai.proposal.detailChangedFields', { count: String(preview.changed_count || 0) }) + (preview.may_start_immediately ? ' · ' + t('ai.proposal.mayStart') : '');
}

export function proposalReviewText(proposal: AiProposal): string {
  const preview = proposal.preview || {};
  if (preview.action === 'python_analysis') {
    const inputReview = preview.input_resource
      ? 'Bound PBGui input resource:\n' + JSON.stringify(preview.input_resource, null, 2)
      : 'Sanitized JSON input:\n' + JSON.stringify(preview.input_data, null, 2);
    return (
      'Code:\n' +
      String(preview.code || '') +
      '\n\nInput summary:\n' +
      JSON.stringify(preview.input_summary || {}, null, 2) +
      '\n\n' +
      inputReview +
      '\n\nPayload digest:\n' +
      String(proposal.payload_digest || '')
    );
  }
  return JSON.stringify({ preview: preview, payload_digest: proposal.payload_digest || '' }, null, 2);
}

export function proposalDiffValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function analysisResultText(result: AnalysisResult): string {
  const output = result.output || {};
  const rendered = output.format === 'json' ? JSON.stringify(output.value, null, 2) : String(output.text || '');
  const stderr = String(result.stderr || '');
  return (
    'Python analysis ' +
    String(result.analysis_status || 'completed') +
    ' (exit ' +
    String(result.exit_code) +
    ').\n\n' +
    rendered +
    (stderr ? '\n\nstderr:\n' + stderr : '') +
    (result.stdout_truncated || result.stderr_truncated ? '\n\nOutput was truncated by PBGui limits.' : '')
  );
}

/** Detect numbered clarification lists the model phrased as a question. */
export function detectedQuickReplies(text: string | undefined): string[] {
  const value = String(text || '');
  if (!/(soll ich|möchtest du|welche option|choose|should i|would you like)/i.test(value)) return [];
  const choices: string[] = [];
  value.split('\n').forEach((line) => {
    const match = line.match(/^\s*\d+[.)]\s*(?:\*\*)?(.+?)(?:\*\*)?\s*$/);
    if (!match) return;
    const choice = String(match[1] || '').replace(/\*\*/g, '').trim();
    if (choice && choices.length < 5) choices.push(choice);
  });
  return choices.length >= 2 ? choices : [];
}
