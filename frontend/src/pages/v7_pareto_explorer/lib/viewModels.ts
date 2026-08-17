import type {
  ChampionItem,
  CommandCenterPayload,
  ConfigDetailPayload,
  InsightItem,
  MetricEntry,
  PlaygroundMetrics,
  PlaygroundPayload,
} from '../types';
import type { Translate } from '../types';

/**
 * Render-surface view models — the data halves of renderChampions
 * (:2944-2973), renderInsights (:2975-2990), renderPreview (:2890-2909),
 * renderPlayground's text lines (:3355-3364) and renderDetail (:3849-3893).
 * Pure: components bind these; no DOM, no i18n side effects.
 */

function valueText(value: unknown): string {
  return value == null ? '-' : String(value);
}

export interface ChampionRow {
  configIndex: number | null;
  style: string;
  rankText: string;
  scoreText: string;
  perfText: string;
  robText: string;
  riskText: string;
  active: boolean;
}

export function championRows(payload: CommandCenterPayload | null, selectedConfigIndex: number | null, t: Translate): ChampionRow[] {
  const champions: ChampionItem[] = payload && Array.isArray(payload.champions) ? payload.champions : [];
  return champions.map((item, index) => ({
    configIndex: item.config_index ?? null,
    style: item.style || '',
    rankText: t('v7explore.rank', { rank: index + 1 }),
    scoreText: t('v7explore.score', { score: item.composite_score == null ? '-' : item.composite_score }),
    perfText: t('v7explore.perf', { perf: item.performance == null ? '-' : item.performance }),
    robText: t('v7explore.rob', { rob: item.robustness == null ? '-' : item.robustness }),
    riskText: t('v7explore.risk', { risk: item.risk_overall == null ? '-' : item.risk_overall }),
    active: selectedConfigIndex != null && selectedConfigIndex === item.config_index,
  }));
}

export interface InsightRow {
  levelClass: string;
  levelText: string;
  text: string;
}

export function insightRows(payload: CommandCenterPayload | null): InsightRow[] {
  const insights: InsightItem[] = payload && Array.isArray(payload.insights) ? payload.insights : [];
  return insights.map((item) => ({
    levelClass: item.level === 'warning' ? 'warn' : item.level === 'success' ? 'good' : 'info',
    levelText: String(item.level || 'info'),
    text: item.text || '',
  }));
}

export interface PreviewSummaries {
  left: string;
  right: string;
}

/** renderPreview's two summary lines (:2904-2909; placeholders :2895-2902). */
export function previewSummaries(payload: PlaygroundPayload | null, t: Translate): PreviewSummaries {
  const preview = payload && payload.visualizations ? payload.visualizations.preview : null;
  if (!preview) {
    return { left: t('v7explore.paretoPreviewWillAppear'), right: t('v7explore.robustnessPreviewWillAppear') };
  }
  const counts = preview.counts || {};
  const previewConfigs = counts.configs || 0;
  const totalConfigs = counts.total_configs != null ? counts.total_configs : previewConfigs;
  const modeLabel = counts.show_all
    ? t('v7explore.configsCountLabel', { shown: previewConfigs, total: totalConfigs })
    : t('v7explore.paretoConfigsCount', { count: previewConfigs });
  const pareto = counts.pareto || 0;
  return {
    left: t('v7explore.paretoAnalysisSummary', { mode: modeLabel, pareto }),
    right: t('v7explore.robustnessVsPerformanceSummary', { mode: modeLabel, pareto }),
  };
}

/** The best-match line (:3355-3357). */
export function bestMatchText(payload: PlaygroundPayload | null, t: Translate): string {
  const best = payload && payload.best_match ? payload.best_match : null;
  return best && best.config_index != null
    ? t('v7explore.bestMatchDetail', {
        config: best.config_index,
        score: best.score == null ? '-' : best.score,
        style: best.style || '',
      })
    : t('v7explore.noBestMatch');
}

/** The chart-mode summary line — plain legacy concatenation, no i18n (:3362-3364). */
export function playgroundMetricSummary(payload: PlaygroundPayload | null): string {
  if (!payload) return '';
  if (payload.viz_type === 'Radar Chart') return 'Radar Chart: ' + String(payload.quick_view || 'Top Comparison');
  const metrics: PlaygroundMetrics = payload.metrics || {};
  const zSuffix = metrics.z_metric ? ' vs ' + String(metrics.z_metric) : '';
  const colorSuffix = metrics.color_metric ? ' | Color: ' + String(metrics.color_metric) : '';
  return (
    String(payload.viz_type || '2D Scatter') + ': ' + String(metrics.x_metric || '-') + ' vs ' + String(metrics.y_metric || '-') + zSuffix + colorSuffix
  );
}

export interface MiniMetricRow {
  name: string;
  value: string;
}

function miniMetrics(items: unknown): MiniMetricRow[] {
  const list = Array.isArray(items) ? (items as MetricEntry[]) : [];
  return list.map((item) => ({ name: String((item || {}).name || '-'), value: valueText((item || {}).value) }));
}

function findMetricValue(allMetrics: unknown, name: string): string {
  const list = Array.isArray(allMetrics) ? (allMetrics as MetricEntry[]) : [];
  const found = list.find ? list.find((item) => (item || {}).name === name) : undefined;
  return found && found.value != null ? String(found.value) : '-';
}

export interface ScenarioRow {
  name: string;
  metricsShown: number;
  chips: { key: string; value: string }[];
}

/** renderScenarioMetrics (:3041-3063) — ≤8 scenarios, ≤6 sorted metric chips. */
export function scenarioMetricRows(metrics: ConfigDetailPayload['scenario_metrics']): ScenarioRow[] {
  const names = Object.keys(metrics || {}).sort();
  return names.slice(0, 8).map((name) => {
    const scenario = (metrics || {})[name] || {};
    const metricNames = Object.keys(scenario).sort().slice(0, 6);
    return {
      name,
      metricsShown: metricNames.length,
      chips: metricNames.map((metricName) => ({ key: metricName, value: valueText(scenario[metricName]) })),
    };
  });
}

export interface DetailViewModel {
  title: string;
  topMetrics: MiniMetricRow[];
  riskProfile: MiniMetricRow[];
  styleRows: { strong: string; chip: string }[];
  robustnessText: string;
  allMetrics: { name: string; value: string }[];
  hasAllMetrics: boolean;
  scenarioRows: ScenarioRow[];
  fullConfigText: string;
}

/** renderDetail's whole data layer (:3849-3893). */
export function detailViewModel(detail: ConfigDetailPayload | null, t: Translate): DetailViewModel {
  if (!detail) {
    return {
      title: t('v7explore.noConfigSelected'),
      topMetrics: [],
      riskProfile: [],
      styleRows: [],
      robustnessText: '-',
      allMetrics: [],
      hasAllMetrics: false,
      scenarioRows: [],
      fullConfigText: t('v7explore.noConfigSelected'),
    };
  }
  return {
    title: '#' + String(detail.config_index),
    topMetrics: miniMetrics(detail.top_metrics),
    riskProfile: Object.keys(detail.risk_profile || {}).map((key) => ({ name: key, value: valueText((detail.risk_profile || {})[key]) })),
    styleRows: [
      { strong: detail.style || '-', chip: t('v7explore.style') },
      { strong: t('v7explore.positionsPerDay'), chip: findMetricValue(detail.all_metrics, 'positions_held_per_day') },
      { strong: t('v7explore.avgHoldHours'), chip: findMetricValue(detail.all_metrics, 'position_held_hours_mean') },
      { strong: t('v7explore.explorerScore'), chip: valueText(detail.explorer_score) },
    ],
    robustnessText: valueText(detail.robustness),
    allMetrics: (Array.isArray(detail.all_metrics) ? detail.all_metrics : []).slice(0, 24).map((item) => ({
      name: (item || {}).name || '-',
      value: valueText((item || {}).value),
    })),
    hasAllMetrics: (Array.isArray(detail.all_metrics) ? detail.all_metrics : []).length > 0,
    scenarioRows: detail.has_scenarios ? scenarioMetricRows(detail.scenario_metrics) : [],
    fullConfigText: detail.full_config ? JSON.stringify(detail.full_config, null, 2) : t('v7explore.fullConfigUnavailable'),
  };
}
