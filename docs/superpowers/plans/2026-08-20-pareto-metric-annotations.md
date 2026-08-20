# 帕累托浏览器指标中英注解 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在帕累托浏览器"全部指标与统计"面板为每个指标名提供中英双语悬停注解。

**Architecture:** 前端 TypeScript 词典模块（基础词条 + 后缀分解组合的纯函数解析器）驱动；渲染复用现有 `data-tip` 悬停机制（把 market_data 的 `DataTipTooltip.vue` 提升到 `shared/components/`，帕累托页挂载）。后端 API 与 vue-i18n 字典零改动。

**Tech Stack:** Vue 3 (Composition API) + TypeScript + vitest + @vue/test-utils。

**Spec:** `docs/superpowers/specs/2026-08-20-pareto-metric-annotations-design.md`

## Global Constraints

- 只改 `frontend/` 下文件；`api/pareto_explorer.py`、`frontend/i18n/en.json`、`frontend/i18n/zh.json` 不动
- 注解仅绑定在 ConfigDetail.vue 的 allMetrics 循环（"全部指标与统计"面板）；顶部指标 mini-grid、风险画像、场景指标不加
- Tooltip 固定中英同显（中文段 + 空行 + 英文段），不随界面语言切换
- 无注解的指标不得渲染 `data-tip` 属性（无虚线下划线提示）
- 所有命令在 `/Users/quran/SourceCode/pbgui/frontend` 目录下执行；测试命令 `npx vitest run <file>`，类型检查 `npm run typecheck`
- 词条英文语义源自 `pbgui_help.py:860-914`；中文为忠实翻译
- 对 spec 的两处已批准细化：(1) 新增 `_equity` 后缀（按权益口径），使 `peak_recovery_hours_equity` 与 `peak_recovery_hours_strategy_eq` 都能命中，词条收录裸名 `peak_recovery_hours`/`peak_recovery_days` 而非 `_equity` 结尾的完整名——比 spec 的完整词条方案更 DRY；(2) 后缀显示顺序与指标名中的书写顺序一致（如 `adg_w_usd` 显示 `· 近期加权 · 美元计价`），实现上剥离后 `reverse()`

---

### Task 1: metricDocs 词典与解析器

**Files:**
- Create: `frontend/src/pages/v7_pareto_explorer/lib/metricDocs.ts`
- Test: `frontend/src/pages/v7_pareto_explorer/lib/metricDocs.test.ts`

**Interfaces:**
- Consumes: 无（纯函数模块，零框架依赖）
- Produces: `export interface MetricDoc { zh: string; en: string; }`；`export function metricTooltip(name: string): string | undefined`（Task 3 的 ConfigDetail.vue 依赖此签名）

- [ ] **Step 1: Write the failing test**

创建 `frontend/src/pages/v7_pareto_explorer/lib/metricDocs.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { metricTooltip } from './metricDocs';

/* Spec 2026-08-20: exact-match-first resolution, then suffix decomposition
 * (longest-first), bilingual output "zh block\n\nen block", undefined for
 * unknown names. */

describe('metricTooltip exact match', () => {
  it('matches full names that look like base+suffix (position_held_hours_max)', () => {
    const tip = metricTooltip('position_held_hours_max');
    expect(tip).toContain('最长持仓时长');
    expect(tip).toContain('Maximum holding time');
  });

  it('matches scoring objectives like adg_pnl as whole entries', () => {
    const tip = metricTooltip('adg_pnl');
    expect(tip).toContain('评分目标');
    expect(tip).toContain('scoring objective');
  });
});

describe('metricTooltip suffix decomposition', () => {
  it('decomposes multi-suffix names with qualifiers in name order', () => {
    const tip = metricTooltip('adg_w_usd');
    expect(tip).toContain('平均日收益');
    expect(tip).toContain('\n· 近期加权（偏向近期表现） · 美元计价\n');
    expect(tip).toContain('\n· recency-weighted · USD-denominated\n');
  });

  it('decomposes _strategy_eq variants down to the bare base', () => {
    const tip = metricTooltip('peak_recovery_hours_strategy_eq');
    expect(tip).toContain('峰值回补');
    expect(tip).toContain('按策略权益口径');
    expect(tip).toContain('strategy-equity basis');
  });

  it('decomposes exposure-suffixed gain variants', () => {
    const tip = metricTooltip('adg_per_exposure_long');
    expect(tip).toContain('除以多头敞口限额');
    expect(tip).toContain('per long exposure limit');
  });
});

describe('metricTooltip output format and degradation', () => {
  it('emits the zh block, a blank line, then the en block', () => {
    const [zhBlock, enBlock] = metricTooltip('sharpe_ratio')!.split('\n\n');
    expect(zhBlock).toContain('夏普比率');
    expect(enBlock).toContain('Sharpe ratio');
  });

  it('returns undefined for unknown metrics without throwing', () => {
    expect(metricTooltip('mystery_metric')).toBeUndefined();
    expect(metricTooltip('')).toBeUndefined();
    expect(metricTooltip('_w')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npx vitest run src/pages/v7_pareto_explorer/lib/metricDocs.test.ts`
Expected: FAIL — "Failed to resolve import ./metricDocs"（模块不存在）

- [ ] **Step 3: Write the implementation**

创建 `frontend/src/pages/v7_pareto_explorer/lib/metricDocs.ts`：

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npx vitest run src/pages/v7_pareto_explorer/lib/metricDocs.test.ts`
Expected: PASS — 8 tests passed

- [ ] **Step 5: Commit**

```bash
cd /Users/quran/SourceCode/pbgui
git add frontend/src/pages/v7_pareto_explorer/lib/metricDocs.ts frontend/src/pages/v7_pareto_explorer/lib/metricDocs.test.ts
git commit -m "feat: add pareto metric annotations dictionary and resolver"
```

---

### Task 2: DataTipTooltip 提升到 shared/components

**Files:**
- Move: `frontend/src/pages/market_data/components/DataTipTooltip.vue` → `frontend/src/shared/components/DataTipTooltip.vue`
- Move: `frontend/src/pages/market_data/components/DataTipTooltip.test.ts` → `frontend/src/shared/components/DataTipTooltip.test.ts`
- Modify: `frontend/src/pages/market_data/App.vue:88`（import 路径）

**Interfaces:**
- Consumes: 无（组件零 props、零逻辑改动，纯移动）
- Produces: `frontend/src/shared/components/DataTipTooltip.vue` 默认导出 Vue 组件（Task 3 的 pareto `App.vue` 以 `import DataTipTooltip from '@/shared/components/DataTipTooltip.vue'` 依赖它）。组件渲染 `<div id="data-tip-tooltip">`，由各页面 CSS（`pareto-base.css:217-230` 已就绪）提供样式

注意：测试文件内 `import DataTipTooltip from './DataTipTooltip.vue'` 是相对路径，两文件同目录一起移动后无需改动。grep 已确认全仓引用仅此三处（App.vue、组件、组件测试）。

- [ ] **Step 1: Move the component and its test**

```bash
cd /Users/quran/SourceCode/pbgui
git mv frontend/src/pages/market_data/components/DataTipTooltip.vue frontend/src/shared/components/DataTipTooltip.vue
git mv frontend/src/pages/market_data/components/DataTipTooltip.test.ts frontend/src/shared/components/DataTipTooltip.test.ts
```

- [ ] **Step 2: Update the market_data import**

`frontend/src/pages/market_data/App.vue:88`：

```ts
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
```

- [ ] **Step 3: Run regression tests**

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npx vitest run src/pages/market_data`
Expected: PASS — market_data 全部测试通过（含移动后的 DataTipTooltip.test.ts）

- [ ] **Step 4: Commit**

```bash
cd /Users/quran/SourceCode/pbgui
git add frontend/src/pages/market_data/App.vue
git commit -m "refactor: promote DataTipTooltip to shared components"
```

（`git mv` 的两个文件已暂存，随本提交一起进入。）

---

### Task 3: ConfigDetail 绑定 data-tip + 帕累托页挂载 tooltip

**Files:**
- Modify: `frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.vue`（import + allMetrics `<strong>` 绑定，约 :13-58 与 :140-142）
- Modify: `frontend/src/pages/v7_pareto_explorer/App.vue`（import :53 一带 + template 首部挂载）
- Test: `frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.test.ts`（新增一个用例）

**Interfaces:**
- Consumes: Task 1 的 `metricTooltip(name: string): string | undefined`；Task 2 的 `@/shared/components/DataTipTooltip.vue`
- Produces: 无下游依赖（终端 UI 任务）

- [ ] **Step 1: Write the failing test**

在 `frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.test.ts` 的 `describe('detail render (:3863-3893)', ...)` 内（`'renders title, metrics, style rows, robustness and all metrics'` 用例之后）新增：

```ts
  it('binds bilingual metric tooltips on all-metrics names', () => {
    const store = makeStore();
    store.state.selectedDetail = {
      ...DETAIL,
      all_metrics: [{ name: 'adg_w_usd', value: 1.5 }, { name: 'mystery_metric', value: 2 }],
    };
    const { wrapper } = mountDetail(store);
    const names = wrapper.findAll('#detail-all-metrics .detail-item strong');
    const tip = names[0]!.attributes('data-tip');
    expect(tip).toContain('平均日收益');
    expect(tip).toContain('Average Daily Gain');
    expect(tip).toContain('近期加权');
    expect(names[1]!.attributes('data-tip')).toBeUndefined();
    wrapper.unmount();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npx vitest run src/pages/v7_pareto_explorer/components/ConfigDetail.test.ts`
Expected: FAIL — `tip` 为 `undefined`（`attributes('data-tip')` 返回 undefined，`toContain` 断言失败）

- [ ] **Step 3: Bind data-tip in ConfigDetail.vue**

`frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.vue` script 区，在 `import { detailViewModel } ...`（:15）之后加：

```ts
import { metricTooltip } from '../lib/metricDocs';
```

template 的 allMetrics 循环（:140-142）改为：

```html
            <div v-for="metric in vm.allMetrics" :key="metric.name" class="detail-item">
              <div class="detail-head"><strong :data-tip="metricTooltip(metric.name) || undefined">{{ metric.name }}</strong><span class="chip">{{ metric.value }}</span></div>
            </div>
```

（`|| undefined`：词典未命中时不渲染 `data-tip` 属性，`[data-tip]` 的虚线下划线样式随之不出现。）

- [ ] **Step 4: Mount DataTipTooltip on the pareto page**

`frontend/src/pages/v7_pareto_explorer/App.vue`：import 区（`import MigrationWatermark ...` :53 之后）加：

```ts
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
```

template 首部（`<MigrationWatermark />` 之后）加一行：

```html
  <DataTipTooltip />
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npx vitest run src/pages/v7_pareto_explorer/components/ConfigDetail.test.ts`
Expected: PASS — 全部用例通过（原有用例不受影响：加 `data-tip` 属性不改变文本断言）

- [ ] **Step 6: Full frontend verification**

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npm test`
Expected: PASS — 全量 vitest 通过，无回归

Run: `cd /Users/quran/SourceCode/pbgui/frontend && npm run typecheck`
Expected: 无错误退出（vue-tsc --noEmit 通过）

- [ ] **Step 7: Commit**

```bash
cd /Users/quran/SourceCode/pbgui
git add frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.vue frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.test.ts frontend/src/pages/v7_pareto_explorer/App.vue
git commit -m "feat: show bilingual metric tooltips in pareto config detail"
```

---

## Self-Review 记录

- **Spec coverage**：词典+后缀解析（Task 1）、组件提升复用（Task 2）、渲染绑定+挂载+降级（Task 3）、测试计划三块全部覆盖；spec 的"范围外"未引入
- **Placeholder scan**：所有代码步骤含完整代码；命令含预期输出；无 TBD/TODO
- **Type consistency**：`MetricDoc`/`metricTooltip(name: string): string | undefined` 在 Task 1 定义、Task 3 以同名同签名消费；`@/shared/components/DataTipTooltip.vue` 路径在 Task 2 产出、Task 3 消费一致
- **现有测试影响**：ConfigDetail.test.ts 的 DETAIL fixture `all_metrics` 三项（`adg`、`positions_held_per_day`、`position_held_hours_mean`）均在词典中，仅新增属性不影响既有文本断言；market_data 回归由 Task 2 Step 3 覆盖
