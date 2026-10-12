import { apiFetch } from '@/shared/api';

export interface VastValidationIssue {
  path?: string;
  message: string;
  suggestions?: string[];
  pending_coin_count?: number;
}

export interface VastValidationResult {
  valid: boolean;
  errors: VastValidationIssue[];
  warnings: VastValidationIssue[];
  revision?: string;
  image?: string;
}

export class VastValidationError extends Error {
  constructor(public readonly validation: VastValidationResult) {
    super(validation.errors.map((issue) => issue.message).join(' ') || 'Resolve the GPU compatibility errors before queueing.');
    this.name = 'VastValidationError';
  }
}

function normalizeIssue(value: unknown): VastValidationIssue {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const issue = value as Record<string, unknown>;
    return {
      path: typeof issue.path === 'string' ? issue.path : undefined,
      message: String(issue.message || issue.path || 'Unknown compatibility issue'),
      suggestions: Array.isArray(issue.suggestions) ? issue.suggestions.map(String) : [],
      pending_coin_count: typeof issue.pending_coin_count === 'number' ? issue.pending_coin_count : undefined,
    };
  }
  return { message: String(value) };
}

export async function validateVastConfig(config: Record<string, unknown>): Promise<VastValidationResult> {
  const response = await apiFetch<{
    valid?: boolean;
    errors?: unknown[];
    warnings?: unknown[];
    revision?: string;
    image?: string;
  }>('/api/vast/validate-config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
  const errors = (response.errors ?? []).map(normalizeIssue);
  const warnings = (response.warnings ?? []).map(normalizeIssue).filter((issue) => issue.pending_coin_count === undefined);
  return { valid: response.valid !== false && errors.length === 0, errors, warnings, revision: response.revision, image: response.image };
}

export function resolveVastWorkerCount(config: Record<string, unknown>, fallback = 4): number {
  const optimize = config.optimize && typeof config.optimize === 'object' && !Array.isArray(config.optimize)
    ? config.optimize as Record<string, unknown>
    : {};
  const gpu = optimize.gpu && typeof optimize.gpu === 'object' && !Array.isArray(optimize.gpu)
    ? optimize.gpu as Record<string, unknown>
    : {};
  const configured = Number(gpu.exact_workers || optimize.n_cpus || fallback);
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

export async function queueVastConfig(
  configName: string,
  config: Record<string, unknown>,
  iterations = 512,
  workers?: number,
  useAdg = false,
): Promise<void> {
  const validation = await validateVastConfig(config);
  if (!validation.valid) throw new VastValidationError(validation);
  const resolvedWorkers = workers ?? resolveVastWorkerCount(config);
  await apiFetch('/api/vast/jobs/prepare', {
    method: 'POST',
    body: JSON.stringify({ config_name: configName, iterations, workers: resolvedWorkers, use_adg: useAdg }),
  });
}
