# 前端控件统一：Vue 3 + Tailwind + shadcn-vue(ui/ 层)

**日期:** 2026-08-25
**状态:** 已完成 — 全部 26 个页面 + shared 模块迁至 ui/ 控件层;全量验证通过
**范围:** `frontend/src` 下全部 Vue 3 页面的表单控件与按钮

## 背景诊断(2026-08-25 审计)

三份全量审计(按钮 / 表单控件 / 复合组件)发现的核心问题:

### 按钮:5 套并存体系,788 处原生 `<button>`,共享 `ui/Button` 零使用

1. 页面级 Tailwind 助手模块(market_data、welcome、v7_backtest、dashboard_editor 各自的 `uiClasses.ts`)
2. 文件内局部助手(vps_manager `btnClass`、cluster_sync `btn*` 常量、hl_data_actions `jbtnClass` 等)
3. 全局遗留类(`components.css` 的 `.btn`/`.pbgui-btn`/`.sb-btn`/`pbgui-action`)
4. 页面/组件 `<style>` 块自定义类(services_monitor 的 `.form-btn` **复制粘贴进 6 个文件**;dashboard_main **页面级重定义共享类名** `.sb-btn`;dashboard_templates 重定义 `.btn`)
5. 每个按钮手写一遍 Tailwind(ai_chat、jobs_monitor、vps_monitor、v7_optimize…)

自定义变体名散落各处:`browse`、`save-setup`、`summary-action`、`warn`、`small`、`file`、`yes/no`、`view/run`、`active-sim`……

### 表单控件:438 `<input>` / 137 `<select>` / 29 `<textarea>`,三种体系竞争

- `ui/` 表单套件实际使用仅 3 个文件(都在 v7_edit);`ui/select` 的 reka listbox **零使用**(137 处原生 `<select>`)
- 三套体系:遗留全局类 + 未 scoped 的页面 CSS(v7_edit/v7_backtest/services_monitor/api_keys_editor)、Tailwind-over-基础层(多数页面)、页面私有类系(dashboard_templates `.tpl-input`、dashboard_main `.dlg-field`、root_login scoped)
- 日期选择器两套实现(共享 `DatePicker.vue` vs v7_strategy_explorer 的 `window.__dp` 命令式遗留)+ 6 处原生 `type="date"`
- 唯一的自定义 switch(v7_pareto_explorer Playground)与一堆无 CSS 的"钩子类"开关

### 复合组件(本轮不迁移,记录为后续阶段)

- **~30 个手写 modal**,无共享 `ui/dialog`(四种方案竞争,含 `.cmc-modal-*` 复制)
- **7 套独立 toast 系统**(都重复 `/api/notify_log` 中继)
- **3 份相同的 `[data-tip]` tooltip 层** + 289 处 `title=` 回退
- 5 套 tabs、11+ 自定义下拉(`ms-dropdown` 系列)
- 死全局 CSS:`.modal*`/`.tabs`/`.toast*`/`.notice*` 无任何 Vue 页面使用

## 迁移标准(落点)

控件层 = `frontend/src/shared/components/ui/`(AGENTS.md §"Vue 3 form controls" 钦定):
Button(CVA 变体)/ Input / Textarea / Label / Field / Select(reka listbox)/ Slider / Switch / Checkbox / RadioGroup。

操作手册:**`frontend/src/shared/components/ui/MIGRATION.md`**(映射表、硬性规则、select/checkbox 测试模式、验证命令)。

测试辅助:`frontend/src/shared/testing/select.ts`(`openSelect` / `pickSelectOption` / `selectOptionTexts`,封装 reka 在 jsdom 下的 keyboard-open + 一次性 pointerup 守卫冲洗)。

### 关键约定

- **保留** id 与测试选中的钩子 class(`class` 透传);**丢弃** 带活样式的类(`.btn`/`.btn-primary`/`.form-input`…)与手写 chrome
- 每个 `<Button>` 显式 `type`(组件不设默认,防表单内误提交)
- 视觉一致性由构造保证:cva 工具类与 `.btn`/`.form-input` 规则共享同一组 `@theme` 令牌,且 Tailwind utilities 层优先于 components 层
- reka `SelectItem` 禁止 `value=""`(运行时报错)——遗留的空占位 option 变为触发器占位文本,不可作为"重置"行(记录在页面头部注释)

## 试点(已完成,验证手册可行性)

| 页面 | 代表模式 | 结果 |
|---|---|---|
| balance_calc | 纯手写 Tailwind 控件(含 `text-[#0b1526]` 硬编码) | 5/5 测试过;2 select → reka listbox |
| welcome | `btnClass` 助手页(6 变体) | 11/11 过;uiClasses.ts 删掉全部控件助手 |
| root_login | scoped CSS 类系(`.submit-btn`/`.lang-btn`) | 9/9 过;scoped 控件 CSS 全删 |
| dashboard_main | **页面级重定义共享 `.sb-btn`** + `.dlg-btn` 对话框类系 | 78/78 过;删除重定义,dialog 用 Field+Input |
| cluster_sync | 脚本常量按钮族 + 包裹式 label | 4/4 过 |

共享组件:EmptyState/ErrorState 已迁到 `ui/Button`;`ui/Input` 增加 `size` 变体(与 Button 对齐)与 `focus()/blur()/select()` 暴露(保持遗留 `ref.value.focus()` 调用点不变);`ui/Textarea` 同样暴露。

## 批量迁移(已完成)

全部 26 个页面(逐页门禁 = `pnpm vitest run pages/<page>` + `pnpm typecheck`)+ shared 模块(SuiteEditor / CoinOverridesPanel / DatePicker / KvCoinSources)迁移完毕,含宿主死 CSS 退役(v7_edit 的 `.act-btn`/`.cov-param-*`/`.chk-row input`;v7_backtest 的 `.act-btn` 因自身测试钉住而保留至复合组件阶段)。

**最终验证(2026-08-25):**
- `pnpm typecheck` — 0 错误
- `pnpm test` — 340 文件 / 4264 测试全绿,0 unhandled error(连续两轮;修复了 3 处 enableAutoUnmount 钩子顺序竞态 + 全局 IntersectionObserver stub)
- `pnpm build` — 通过
- `tests/test_i18n.py` — 仅 3 个基线缺失键(与迁移前一致)

**迁移中有意保留为原生的控件**(均带 `ui-migration: blocked` 注释):`<select multiple>`(v7_backtest ×3、v7_pareto_explorer ×1)、各自定义下拉的芯片筛选输入(`.ms-input`)与选项复选框、v7_strategy_explorer 的 `window.__dp` 日期选择桥接按钮、页面 tab 条与行选择模式(`.sb-item`/`.coin-picker-row` 等)。

**行为偏差(均已在代码注释记录)**:reka listbox 无空值选项 → 遗留 `<option value="">` 重置行改为触发器占位文本(v7_backtest/v7_optimize/market_data 等若干处);`v-model.number` 现由 `ui/Input` 原生透传。

## 后续阶段(不在本轮)

- `ui/dialog`(吸收 ~30 个手写 modal,统一 focus-trap/Esc,遵守"不得点击外部关闭"规则)
- `ui/toast`(7 套并一套,共用 `/api/notify_log` 中继)
- `ui/dropdown`/`ui/popover`(11+ 自定义下拉)
- `[data-tip]` tooltip 三层合一;`title=` 策略
- `ui/tabs`(5 套)、`ui/badge`(8+ 色调映射)、`ui/card`/`ui/panel`
- v7_strategy_explorer 的 `window.__dp` 命令式 datepicker → 共享 `DatePicker.vue`
- 死全局 CSS 退役(`.modal*`/`.tabs*`/`.toast*`/`.notice*`;`.btn*`/`.form-*` 待最后一批引用消失后)
- 5 个未用 AppShell 的页面(dashboard_editor、dashboard_templates、market_data_status、root_login、hl_data_actions)

## 已知基线问题(非本次引入)

- `tests/test_i18n.py::test_all_statically_referenced_keys_exist` 在干净树上即失败:缺 `misc.dbtools.sbTitle`、`v7optimize.applyFilters`、`v7run.applyFilters` 三键。
- 曾因 `frontend/node_modules` 部分安装导致 11 个测试文件编译失败;`pnpm install` 修复。
