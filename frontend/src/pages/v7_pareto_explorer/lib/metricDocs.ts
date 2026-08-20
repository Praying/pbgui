/**
 * Bilingual (zh/en) metric annotations for the Pareto Explorer's
 * "All Metrics & Statistics" panel (spec 2026-08-20). Metric names arrive
 * dynamically from PBv8 optimize results (suite_metrics keys), so instead of
 * enumerating every variant we keep ~34 base entries plus suffix entries and
 * compose: exact match first, else strip known suffixes longest-first and
 * look up the remaining base. English wording condensed from
 * pbgui_help.py:860-914.
 */
export interface MetricDoc {
  zh: string;
  en: string;
}

const BASE_METRIC_DOCS: Record<string, MetricDoc> = {
  // ── Returns & growth ──────────────────────────────────────────────
  adg: { zh: '平均日收益（ADG）：平滑几何平均的日盈利增长。', en: 'Average Daily Gain (ADG): smoothed geometric mean daily gain.' },
  mdg: { zh: '日收益中位数（MDG）：逐日收益的中位数，对离群值更稳健。', en: 'Median Daily Gain (MDG): median of daily gains, robust to outliers.' },
  gain: { zh: '最终余额收益：期末与期初余额之比。', en: 'Final balance gain: end/start balance ratio.' },
  adg_pnl: { zh: 'ADG 与 PnL 比值：平均日收益与盈亏比的加权组合，兼顾盈利能力与收益质量（pbgui 评分目标）。', en: 'ADG-to-PnL ratio: weighted combination of average daily gain and profit/loss ratio (a pbgui scoring objective).' },
  mdg_pnl: { zh: 'MDG 与 PnL 比值：日收益中位数与盈亏比的加权组合（pbgui 评分目标）。', en: 'MDG-to-PnL ratio: weighted combination of median daily gain and profit/loss ratio (a pbgui scoring objective).' },
  // ── Risk ──────────────────────────────────────────────────────────
  drawdown_worst: { zh: '最大回撤：从峰值到谷值的最大跌幅。', en: 'Maximum drawdown: worst peak-to-trough decline.' },
  drawdown_worst_mean_1pct: { zh: '最差 1% 回撤均值：每日回撤中最差 1% 的平均值。', en: 'Mean of the worst 1% drawdowns (daily).' },
  expected_shortfall_1pct: { zh: '期望损失（CVaR）：最差 1% 日亏损的均值。', en: 'Expected shortfall (CVaR): mean of the worst 1% daily losses.' },
  equity_balance_diff_neg_max: { zh: '权益-余额负偏离最大值：权益低于余额的最大幅度。', en: 'Largest negative equity-balance divergence.' },
  equity_balance_diff_neg_mean: { zh: '权益-余额负偏离均值：权益低于余额的平均幅度。', en: 'Average negative equity-balance divergence.' },
  equity_balance_diff_pos_max: { zh: '权益-余额正偏离最大值：权益高于余额的最大幅度。', en: 'Largest positive equity-balance divergence.' },
  equity_balance_diff_pos_mean: { zh: '权益-余额正偏离均值：权益高于余额的平均幅度。', en: 'Average positive equity-balance divergence.' },
  // ── Ratios & efficiency ───────────────────────────────────────────
  sharpe_ratio: { zh: '夏普比率：收益与波动率之比。', en: 'Sharpe ratio: return-to-volatility ratio.' },
  sortino_ratio: { zh: '索提诺比率：收益与下行波动率之比。', en: 'Sortino ratio: return-to-downside-volatility ratio.' },
  calmar_ratio: { zh: '卡玛比率：收益除以最大回撤。', en: 'Calmar ratio: return divided by maximum drawdown.' },
  sterling_ratio: { zh: '斯特林比率：收益除以最差 1% 回撤均值。', en: 'Sterling ratio: return divided by the average of the worst 1% drawdowns.' },
  omega_ratio: { zh: '欧米伽比率：正收益之和与亏损绝对值之和的比。', en: 'Omega ratio: sum of positive returns / sum of absolute negative returns.' },
  // ── Equity curve quality ──────────────────────────────────────────
  equity_choppiness: { zh: '权益曲线粗糙度：归一化总变差，越低越平滑。', en: 'Equity choppiness: normalized total variation (lower = smoother).' },
  equity_jerkiness: { zh: '权益曲线急动度：归一化的二阶导数绝对值均值。', en: 'Equity jerkiness: normalized mean absolute second derivative.' },
  exponential_fit_error: { zh: '指数拟合误差：对数线性权益曲线拟合的均方误差。', en: 'Exponential fit error: MSE from the log-linear equity fit.' },
  peak_recovery_hours: { zh: '峰值回补时长（小时）：权益停留在前峰值以下的最长时间。', en: 'Peak recovery (hours): longest time equity stayed below its prior peak.' },
  peak_recovery_days: { zh: '峰值回补时长（天）：权益停留在前峰值以下的最长时间（按天计）。', en: 'Peak recovery (days): longest time equity stayed below its prior peak, in days.' },
  // ── Position & execution ──────────────────────────────────────────
  positions_held_per_day: { zh: '日均开仓数：每天平均持有的仓位数量。', en: 'Average positions held per day.' },
  position_held_hours_max: { zh: '最长持仓时长（小时）。', en: 'Maximum holding time in hours.' },
  position_held_hours_mean: { zh: '平均持仓时长（小时）。', en: 'Average holding time in hours.' },
  position_held_hours_median: { zh: '持仓时长中位数（小时）。', en: 'Median holding time in hours.' },
  position_unchanged_hours_max: { zh: '最长未调仓时长（小时）：不修改仓位的最长连续时间。', en: 'Longest span without modifying a position (hours).' },
  volume_pct_per_day_avg: { zh: '日均成交量占比：每日成交量占账户权益百分比的平均值。', en: 'Average traded volume as % of account per day.' },
  n_fills_per_day: { zh: '日均成交笔数。', en: 'Average number of fills per day.' },
  loss_profit_ratio: { zh: '亏损/盈利比：亏损绝对值之和与盈利之和的比。', en: 'Loss/profit ratio: abs(sum of losses) / sum of profit.' },
  loss_streak_max: { zh: '最大连亏笔数：连续亏损交易的最大次数。', en: 'Maximum consecutive losing trades.' },
  hrs_stuck_avg: { zh: '平均卡仓时长（小时）：仓位滞留的平均小时数。', en: 'Average hours stuck in a position.' },
  hrs_stuck_max: { zh: '最大卡仓时长（小时）。', en: 'Maximum hours stuck in a position.' },
  n_positions_max: { zh: '最大同时持仓数。', en: 'Maximum concurrent positions.' },
  // ── Suite ─────────────────────────────────────────────────────────
  backtest_completion_ratio: { zh: '回测完成率：套件中已完成回测的占比。', en: 'Backtest completion ratio: fraction of suite backtests completed.' },
};

const SUFFIX_DOCS: Record<string, MetricDoc> = {
  _w: { zh: '近期加权（偏向近期表现）', en: 'recency-weighted' },
  _usd: { zh: '美元计价', en: 'USD-denominated' },
  _btc: { zh: 'BTC 计价', en: 'BTC-denominated' },
  _per_exposure_long: { zh: '除以多头敞口限额', en: 'per long exposure limit' },
  _per_exposure_short: { zh: '除以空头敞口限额', en: 'per short exposure limit' },
  _strategy_eq: { zh: '按策略权益口径', en: 'strategy-equity basis' },
  _equity: { zh: '按权益口径', en: 'equity basis' },
};

/** Longest first so _per_exposure_long wins over shorter tails. */
const SUFFIX_ORDER: readonly string[] = [
  '_per_exposure_long',
  '_per_exposure_short',
  '_strategy_eq',
  '_equity',
  '_w',
  '_usd',
  '_btc',
];

interface Decomposed {
  base: string;
  suffixes: MetricDoc[];
}

function stripSuffixes(name: string): Decomposed {
  const suffixes: MetricDoc[] = [];
  let rest = name;
  for (;;) {
    const suffix = SUFFIX_ORDER.find((s) => rest.endsWith(s) && rest.length > s.length);
    if (!suffix) break;
    suffixes.push(SUFFIX_DOCS[suffix]!);
    rest = rest.slice(0, -suffix.length);
  }
  // Stripped tail-first; display in the order the suffixes appear in the name.
  suffixes.reverse();
  return { base: rest, suffixes };
}

function segment(base: MetricDoc, suffixes: MetricDoc[], lang: 'zh' | 'en'): string {
  if (!suffixes.length) return base[lang];
  return `${base[lang]}\n· ${suffixes.map((s) => s[lang]).join(' · ')}`;
}

/**
 * Resolve a suite-metric name to its bilingual tooltip text:
 * "zh block\n\nen block", each block optionally followed by a
 * "· qualifier · …" line for stripped suffixes. Unknown names → undefined
 * (the caller then omits the data-tip attribute entirely).
 */
export function metricTooltip(name: string): string | undefined {
  const exact = BASE_METRIC_DOCS[name];
  const { base, suffixes } = exact ? { base: name, suffixes: [] as MetricDoc[] } : stripSuffixes(name);
  const baseDoc = exact ?? BASE_METRIC_DOCS[base];
  if (!baseDoc) return undefined;
  return `${segment(baseDoc, suffixes, 'zh')}\n\n${segment(baseDoc, suffixes, 'en')}`;
}
