/*
 * Shared integrity-layer types — split out of useIntegrity.ts together with
 * useIntegrityGapDetails.ts so both composables stay under the 800-line cap
 * without a type-only import cycle.
 */

/** Legacy fetchJson slice the integrity store needs (useApi().fetchJson). */
export interface IntegrityApi {
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Panel/gap feedback callout state (setIntegrityFeedback :4252-4258). */
export interface IntegrityFeedback {
  message: string;
  level: 'info' | 'error';
}

/** A select option (fillArchiveSelect :4260-4276, gap day select :4765-4771). */
export interface ArchiveOption {
  value: string;
  label: string;
}
