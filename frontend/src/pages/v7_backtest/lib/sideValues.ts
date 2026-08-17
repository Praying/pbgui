import type { BacktestVersion } from '../types';

/**
 * Side-value + HSL adapter fns — the structural port of
 * backtest_editor_adapter.js:114-137 (the M-v7-8 adapter kept the shell
 * surface; these editor fns land with M-v7-9 per the recon). v8 nests bot
 * side params under `risk.*` and HSL values under `hsl.*`; v7 keeps them
 * flat at the side root with the `hsl_` prefix.
 */

type SideConfig = Record<string, unknown>;

function sideObject(sideConfig: unknown): SideConfig {
  return sideConfig && typeof sideConfig === 'object' && !Array.isArray(sideConfig) ? (sideConfig as SideConfig) : {};
}

/** sideRisk (:114-119): the v7 side root or the v8 risk sub-object. */
function sideRisk(version: BacktestVersion, sideConfig: unknown): SideConfig {
  const side = sideObject(sideConfig);
  if (version !== 'v8') return side;
  if (!side.risk || typeof side.risk !== 'object' || Array.isArray(side.risk)) side.risk = {};
  return side.risk as SideConfig;
}

/** getSideValue (:124-127). */
export function getSideValue(version: BacktestVersion, sideConfig: unknown, key: string, fallback: unknown): unknown {
  const value = sideRisk(version, sideConfig)[key];
  return value === undefined || value === null ? fallback : value;
}

/** setSideValue (:128-130) — writes through the flavor path. */
export function setSideValue(version: BacktestVersion, sideConfig: unknown, key: string, value: unknown): void {
  sideRisk(version, sideConfig)[key] = value;
}

/**
 * getHslValue (:131-137) — the HSL path remap: v8 reads `side.hsl.X`,
 * v7 reads `side.hsl_X`.
 */
export function getHslValue(version: BacktestVersion, sideConfig: unknown, key: string, fallback: unknown): unknown {
  const side = sideObject(sideConfig);
  const source: SideConfig =
    version === 'v8' && side.hsl && typeof side.hsl === 'object' && !Array.isArray(side.hsl) ? (side.hsl as SideConfig) : side;
  const sourceKey = version === 'v8' ? key : 'hsl_' + key;
  const value = source[sourceKey];
  return value === undefined || value === null ? fallback : value;
}
