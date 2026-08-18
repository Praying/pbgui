/** API payloads used by the Logging Monitor page. */
export interface LogFilesPayload {
  files: string[];
  sizes: Record<string, number>;
  rotated: Record<string, string[]>;
}

export interface RotationRule {
  max_mb: number;
  backup_count: number;
}

export interface ManagedRotationRule extends RotationRule {
  label: string;
  description: string;
}

export interface RotationPayload {
  default: RotationRule;
  per_service: Record<string, RotationRule>;
  managed_scopes: Record<string, ManagedRotationRule>;
  apply?: { message?: string };
}
