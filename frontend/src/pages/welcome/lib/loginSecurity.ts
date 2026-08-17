/**
 * The login-security summary — the port of welcome.html loginSecuritySummary
 * (:1248-1264), pure so the wording rules are directly testable.
 */

export interface LoginSecurity {
  blocked_attempts?: number;
  active_blocks?: number;
  acknowledged?: boolean;
  last_block?: { client?: string; blocked_at?: string };
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export function loginSecuritySummary(security: LoginSecurity, t: TranslateFn): string {
  const blockedAttempts = Number(security.blocked_attempts || 0);
  const activeBlocks = Number(security.active_blocks || 0);
  if (!blockedAttempts) return t('misc.welcome.noLoginLockouts'); // :1251
  const message =
    blockedAttempts === 1
      ? t('misc.welcome.loginLockoutDetectedSingle')
      : t('misc.welcome.loginLockoutsDetected', { count: blockedAttempts });
  const parts = [message];
  const lastBlock = security.last_block || {};
  if (lastBlock.client) parts.push(t('misc.welcome.lastClient', { client: String(lastBlock.client) }));
  if (lastBlock.blocked_at) {
    const parsed = new Date(lastBlock.blocked_at);
    parts.push(
      t('misc.welcome.lastEvent', {
        time: isNaN(parsed.getTime()) ? String(lastBlock.blocked_at) : parsed.toLocaleString(),
      })
    );
  }
  if (activeBlocks) parts.push(t('misc.welcome.activeBlocks', { count: activeBlocks }));
  if (security.acknowledged) parts.push(t('misc.welcome.alertAcknowledged'));
  return parts.join('');
}
