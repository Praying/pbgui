import { apiFetch } from '@/shared/api';

export async function queueVastConfig(
  configName: string,
  config: Record<string, unknown>,
  iterations = 512,
  workers = 4,
  useAdg = false,
): Promise<void> {
  const validation = await apiFetch<{ valid?: boolean; errors?: string[] }>('/api/vast/validate-config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
  if (validation.valid === false) {
    throw new Error(validation.errors?.join(' ') || 'Resolve the GPU compatibility errors before queueing.');
  }
  await apiFetch('/api/vast/jobs/prepare', {
    method: 'POST',
    body: JSON.stringify({ config_name: configName, iterations, workers, use_adg: useAdg }),
  });
}
