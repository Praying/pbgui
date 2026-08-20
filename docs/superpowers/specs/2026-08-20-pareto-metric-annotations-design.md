# 帕累托浏览器指标中英注解 — 设计文档

日期：2026-08-20
分支：`feature/frontend-vue3-migration`
状态：已获用户批准（设计对话）

## 背景与目标

PBv8 帕累托浏览器在展示 Passivbot 优化结果时，"全部指标与统计"折叠面板列出
`suite_metrics` 的全部键值（如 `adg_pnl`、`sharpe_ratio`），但指标名是
passivbot 术语缩写，用户难以理解含义。本设计为该面板中的每个指标增加
中/英文注解，悬停显示。

## 需求决策记录

| 决策点 | 选择 |
|---|---|
| 展示形式 | 悬停 Tooltip（指标名带 data-tip 虚线下划线提示） |
| 双语策略 | Tooltip 内中英同时显示（不随界面语言切换） |
| 覆盖范围 | 仅"全部指标与统计"折叠面板；顶部指标 mini-grid、风险画像、场景指标不加 |
| 数据存放层 | 前端 TypeScript 词典模块（不动 vue-i18n 字典、不改后端 API） |

## 探索发现（关键代码位置）

- 渲染组件：`frontend/src/pages/v7_pareto_explorer/components/ConfigDetail.vue:135-145`
  （"全部指标与统计"折叠面板，`vm.allMetrics` 循环）
- ViewModel：`frontend/src/pages/v7_pareto_explorer/lib/viewModels.ts:160-193`
  （`detailViewModel()`，allMetrics 截断 24 条）
- 后端来源：`api/pareto_explorer.py:2622-2625`（`all_metrics` 由
  `config.suite_metrics` 排序生成，键动态来自 PBv8 结果 JSON）
- 指标语义底稿：`pbgui_help.py:860-914`（收益/风险/比率/持仓执行四组指标英文说明）
- 回退指标名单：`api/pareto_explorer.py:1149-1157`、
  `frontend/src/shared/suiteEditor/suiteModel.ts:70-81`
- 现有 tooltip 机制：`frontend/src/pages/market_data/components/DataTipTooltip.vue`
  （document 级事件委托，光标跟随 + 视口边缘翻转）；
  `pareto-base.css:217-230` 已预留 `[data-tip]` 与 `#data-tip-tooltip` 样式
  （帕累托页未挂载驱动组件）

指标名动态、由后缀组合产生大量变体（`adg_w_usd` = `adg` + `_w` + `_usd`），
静态枚举无法穷举 → 采用"基础词条 + 后缀分解组合"策略。

## 架构

```
frontend/src/
├── shared/components/
│   └── DataTipTooltip.vue          ← 从 market_data/components/ 移入（零逻辑改动）
├── pages/market_data/App.vue       ← 更新 import 路径
└── pages/v7_pareto_explorer/
    ├── App.vue                     ← 挂载 <DataTipTooltip />
    ├── lib/metricDocs.ts           ← 新增：词典 + 纯函数解析器（无框架依赖）
    ├── lib/metricDocs.test.ts      ← 新增：解析器单测
    └── components/ConfigDetail.vue ← allMetrics 指标名绑定 :data-tip
```

数据流：PBv8 结果 JSON `suite_metrics` →（已有）后端 `all_metrics` →
（已有）`detailViewModel().allMetrics` →（新增）渲染时 `metricTooltip(name)`
查词典 → 生成 `data-tip` 文本 → `DataTipTooltip` 事件委托显示。

复用理由：`DataTipTooltip.vue` 是 market_data 已验证实现；
`pareto-base.css` 已有 `[data-tip]` 样式。移动到 `shared/components/`
两页共享一份，不复制代码。

## 词典与解析逻辑（metricDocs.ts）

```ts
export interface MetricDoc { zh: string; en: string; }
```

### 基础词条（~35 个，完整名精确匹配优先）

收益类：`adg`、`mdg`、`gain`、`adg_pnl`、`mdg_pnl`
风险类：`drawdown_worst`、`drawdown_worst_mean_1pct`、`expected_shortfall_1pct`、
`equity_balance_diff_neg_max`、`equity_balance_diff_neg_mean`、
`equity_balance_diff_pos_max`、`equity_balance_diff_pos_mean`
比率类：`sharpe_ratio`、`sortino_ratio`、`calmar_ratio`、`sterling_ratio`、`omega_ratio`
权益曲线质量：`equity_choppiness`、`equity_jerkiness`、`exponential_fit_error`、
`peak_recovery_hours_equity`、`peak_recovery_days_equity`
持仓执行类：`positions_held_per_day`、`position_held_hours_max`、
`position_held_hours_mean`、`position_held_hours_median`、
`position_unchanged_hours_max`、`volume_pct_per_day_avg`、`n_fills_per_day`、
`loss_profit_ratio`、`loss_streak_max`、`hrs_stuck_avg`、`hrs_stuck_max`、
`n_positions_max`
其他：`backtest_completion_ratio`

注意：`position_held_hours_max` 等是完整词条，不是 base+后缀 —— 因此解析时
**先完整名精确匹配，再走后缀分解**。

英文段取 `pbgui_help.py:860-914` 原文精炼版；中文段为忠实翻译。

### 后缀词条

```ts
const SUFFIX_DOCS: Record<string, MetricDoc> = {
  _w:                  { zh: '近期加权（偏向近期表现）', en: 'recency-weighted' },
  _usd:                { zh: '美元计价', en: 'USD-denominated' },
  _btc:                { zh: 'BTC 计价', en: 'BTC-denominated' },
  _per_exposure_long:  { zh: '除以多头敞口限额', en: 'per long exposure limit' },
  _per_exposure_short: { zh: '除以空头敞口限额', en: 'per short exposure limit' },
  _strategy_eq:        { zh: '按策略权益口径', en: 'strategy-equity basis' },
};
```

### 解析算法（纯函数，导出 `metricTooltip(name): string | undefined`）

1. 完整名精确匹配词条 → 直接返回
2. 从尾部依次剥离已知后缀（先长后短：`_per_exposure_long`/`_per_exposure_short`
   → `_strategy_eq` → `_w` → `_usd`/`_btc`），收集命中的后缀
3. 剩余部分作为 base 查基础词条
4. 命中则组合输出；任一步未命中 → 返回 `undefined`

### 组合格式（CSS 已有 `white-space: pre-wrap`，换行生效）

```
平均日收益（ADG）：平滑几何平均的日盈利增长。
· 近期加权 · 美元计价

Average Daily Gain (ADG): smoothed geometric mean daily gain.
· recency-weighted · USD-denominated
```

即：中文段 + 后缀行（`·` 分隔）+ 空行 + 英文段 + 后缀行。无后缀时省略后缀行。

## 渲染集成与降级

`ConfigDetail.vue` 的 allMetrics 循环（仅此一处）：

```html
<strong :data-tip="metricTooltip(metric.name) || undefined">{{ metric.name }}</strong>
```

- `|| undefined`：无注解指标不渲染 `data-tip` 属性 → 不显示虚线下划线，
  视觉上区分"有说明/无说明"
- 未知指标（词典未覆盖的未来新指标）优雅降级为现状，无报错
- 不改动后端 API、不改动 i18n 字典、不影响 24 条截断逻辑

## 错误处理

- 解析器为纯函数：未知名返回 `undefined`，无异常路径
- `MetricDoc` 类型强制 zh/en 两段齐全，杜绝半截词条
- Tooltip 定位边界（视口翻转）由 `DataTipTooltip.vue` 现有逻辑处理

## 测试计划

- `metricDocs.test.ts`（vitest）：
  - 精确命中：`adg_pnl`、`position_held_hours_max`
  - 多层后缀组合：`adg_w_usd`、`drawdown_worst_w_usd`、`adg_strategy_eq`
  - 未知名返回 `undefined`
  - 输出含中英两段与后缀行格式
- ConfigDetail 渲染测试：有注解指标渲染 `data-tip` 属性；无注解指标不渲染
- market_data 现有 `DataTipTooltip.test.ts` 随组件移动更新引用，保证回归
- 验收命令：`npm test`（vitest）+ `tsc` 类型检查全部通过

## 范围外（明确不做）

- 顶部指标 mini-grid、风险画像、场景指标 chips 的注解
- 注解内容本地化为可切换单语（当前固定双语同显）
- 后端词典或 API 下发注解
- 提升词典到 shared 供其他页面复用（YAGNI；如需后续再移动）
