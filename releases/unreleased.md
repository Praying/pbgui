# Unreleased

## 系统 / API 密钥 / 日志页面现代化重构（Vue 3 + Tailwind CSS）

- **全面移除遗留 LogViewerPanel DOM 注入，重构为纯 Vue 3 + Tailwind CSS 响应式组件**：
  - 彻底淘汰 `LogPanel.vue` 中对旧版全局 `window.LogViewerPanel` 的 DOM 包装，解决原页面默认请求不存在的 `ApiKeys.log` 导致异常回退显示 `BacktestV8.log` 的缺陷。
  - 接入 PBGui 现代深色主题设计系统规范（`@theme` 设计令牌、`hl-expiry-panel` 容器布局与精致面板边框）。
- **实时日志流与智能过滤系统**：
  - 通过 `/ws/vps` WebSocket 原生对接后端，自动探测获取本地全部日志文件列表（`{ cmd: 'list_local_logs' }`），支持随时切换查看其他日志。
  - 默认自动订阅 `PBGui.log`，并默认激活 `[ApiKeys]` 预设过滤，精准呈现 API 密钥的创建、编辑、同步、权限变动及安全生命周期操作。
  - 工具栏提供预设过滤快速切换：`全部 (All)`、`[ApiKeys]`、`错误 (Errors)`、`警告 (Warnings)`。
  - 支持快捷过滤日志级别（`DBG`、`INF`、`WRN`、`ERR`、`CRT`），动态高亮 WARNING / ERROR / CRITICAL 重音左边框与底色。
- **丰富的日志浏览与排查工具**：
  - 集成带防抖（debounce）的关键字实时搜索与过滤切换，支持命中词 `<mark>` 高亮展示及上下匹配项逐条平滑跳转（Match stepper）。
  - 支持实时流（Stream）与暂停（Pause）控制、控制台清屏（Clear）、日志行号切换（Line numbers）以及一键导出下载日志文本文件（Download）。
  - 支持视口智能吸底（Pin to bottom）与浮动快速回到底部按钮（Scroll to bottom），并在 WebSocket 连接状态改变（连接中/已连接/已断开/会话过期）时提供动态状态徽标提示。
- **完善的单元测试保障**：
  - 新增 `frontend/src/pages/api_keys_editor/components/LogPanel.test.ts`，涵盖组件渲染、文件选择、日志预设过滤、级别切换、流控暂停/恢复、清屏、行号及会话过期等 12 项测试，并通过 `vue-tsc` 与 Vite 生产构建校验。

## Vue3 全站字体与字号体系统一（统一字号阶梯 + 字距/字重契约）

- **建立全站唯一的字号阶梯**：`frontend/src/styles/tailwind.css` 的 `@theme` 现定义十档 px 字号，每档绑定显式行高，成为所有 Vue3 页面字号的唯一来源：`text-micro` 11 / `text-xs` 12 / `text-compact` 13（新增）/ `text-sm` 14 / `text-base` 15 / `text-md` 16 / `text-lg` 19 / `text-xl` 23 / `text-2xl` 26 / `text-3xl` 34。
  - 修复阶梯非单调缺陷：此前 `--text-xl` 为 23px，而 Tailwind 继承的 `text-2xl` 按 1.5rem（15px 根字号）解析为 **22.5px**，比 xl 还小；`--text-title` 26px 则卡在 2xl/3xl 之间。现将 `text-2xl` 钉为 26px、`text-3xl` 钉为 34px，并把阶梯之上的 `text-4xl`/`text-5xl` 钉为 42/52px，防止 Tailwind 的 rem 默认值再次造成倒挂。
  - 新增 `text-compact`(13px) 档，吸收原先散落最多的近似值：13px（140 处）、13.5px（65 处）、12.5px（11 处）、0.85rem、0.9rem 等；新增 `text-micro`(11px) 档，吸收 10px、10.5px、11px、11.5px、0.68rem、0.72rem、0.73rem、0.75rem 等。
  - 删除与数值档位重复的第二套语义令牌（`--text-display`/`title`/`section`/`body`/`small`/`caption`），其 18 处调用点并入数值阶梯，全站词汇表归一。
- **行高从"静默漂移"改为显式绑定**：此前各档行高沿用 Tailwind 的 rem 默认值，在 15px 根字号下产生错位——`text-lg`(19px) 与 `text-xl`(23px) 共用同一个 26.25px 行高，`text-md` 则完全没有行高。现每档均声明 px 行高，取值冻结为改动前的实际渲染值（Tailwind rem 默认 × 15px 取整），因此绑定本身不产生重排。
- **字距收敛为 3 个值**：`--tracking-label`（大写微标签与胶囊）、`--tracking-tight`（标题）、`--tracking-display`（显示级数字）；原先同一个"大写小标签"角色用了 7 种字距（0.02/0.04/0.045/0.05/0.06/0.08em 等），另有 10 种一次性 `tracking-[…]` 写法与 `tracking-wide/wider/widest`，现全部并入契约；`--tracking-tight` 显式声明以便 CSS 侧 `var()` 可靠解析。
- **字重收敛为 4 个值**：400/500/600/700。移除 650/750/550/800/300 等中间值以及 `font-extrabold`(33 处)/`font-black`(7 处)。这不只是整洁问题：Space Grotesk 是可变字体，但中文回退到静态字重的系统字体（PingFang SC、微软雅黑），中间字重会被渲染成伪粗体。
- **一次性扫除全部硬编码字号**：新增 `frontend/codemod_type_scale.py`（默认 dry-run，`--write` 落盘，`--report` 列出保留项），按可复核的阈值表（11.5 / 12.4 / 13.5 / 14.4 / 15.5 / 17.5 / 21 / 24.5 / 30px）把 45 个文件里的 **462 处 `text-[…]`** 归入阶梯；同时把 `frontend/src` 内 **253 处 `var(--fs-*)`** 改为 `var(--text-*)`，让 Vue 侧只剩一套词汇表。累计改写 791 处字号引用。
  - 编码器具备注释感知能力（先屏蔽 `/* */` 与 `<!-- -->` 再改写），避免把阶梯自身文档里的 `text-[13px]`、"不要写 text-[13px]" 等说明文字改坏。
  - `em` 与 `clamp()` 字号刻意不改写，由 `--report` 列出人工复核：`em` 相对自身上下文生效，`clamp()` 本就有意流式。仅将 `IntegrityPanel` 的 hero 标题 clamp 上下界对齐阶梯（24px→`--text-xl`，34px→`--text-3xl`）。
- **Vue 页面标题纳入阶梯**：此前 179 个标题中有 78 个没有显式字号，直接落在浏览器 `em` 默认值上（h2 22.5px、h3 17.55px、h5 12.45px、h6 10.05px，均不在任何阶梯上）。现于 base 层按 `#app` 作用域把 h1→`--text-2xl`、h2→`--text-lg`、h3→`--text-md`、h4~h6→`--text-base`；未分层页面样式仍然优先，因此只影响原本无人设置字号的标题，legacy 独立 HTML 页面保持原 UA 尺寸不变。
- **共享层成为唯一基准**：`components.css` 中残留的 `font-size` 字面量（11px×2、10px、1.2rem、40px）与 5 处大写字距（0.02/0.04/0.045/0.05/0.08em）全部改走令牌；`Label`/`Input`/`Button`/`Select`/`Textarea`/表格与 workbench 基础组件同步对齐阶梯，`text-compact` 成为密集表单控件的正式字号（原先页面用 `h-9 text-[13.5px]` 硬覆盖共享组件）。
- **新增防回归契约测试** `frontend/src/shared/components/typography-tokens.test.ts`：断言十档字号与行高取值、阶梯严格递增、3 个字距令牌、4 个字重值、已删除的重复语义令牌不得回归，并在屏蔽注释后扫描全部 `frontend/src`，禁止任何绝对 `font-size: <px|rem>`、`text-[<尺寸>]`、`tracking-[…]` 以及 400/500/600/700 之外的字重。
- **契约写入 `AGENTS.md`**，含档位到角色的对照表、行高与字距/字重规则、以及 `codemod_type_scale.py` 的用法。
- **有意保留、未执行的项**：页面中约 130 处 `leading-*` 行高工具类**未按原计划删除**。实测显示这些覆盖集中落在会换行的正文上（段落、告警列表、tooltip、mono 编辑器），而阶梯冻结的档位行高是 Tailwind 偏紧的默认值（`xs` 15px、`compact` 18px，比率 1.25–1.36），删除会让多行正文收紧 20–30%，属于可读性回退。因此维持现状，并把"档位行高仅为单行 UI 默认值、换行正文保留显式 `leading-*`"写入阶梯文档与 `AGENTS.md`。
- **唯一有意的视觉变化**：11 处指标数字由 `text-2xl` 的 22.5px 变为 26px；表格表头与大写标签的字距按契约统一（0.04/0.045/0.05em → 0.06em），字号保持 12px 不变。legacy HTML 页面与 `--fs-*` 别名（约 812 处引用）完全未动。

## PBv7/PBv8 空状态与列表底色统一

- **空状态统一为共享虚线面板 + 图标块 + 标题 + 说明 + 主按钮**：以现有共享 `pbgui-empty-state` 为唯一基准，把 PBv7/PBv8 十个页面（回测、运行、优化、策略浏览器、帕累托浏览器）的 22 处空状态全部迁移到同一个组件，不再有一次性写法。
  - 共享组件 `frontend/src/shared/components/EmptyState.vue` 新增可选 `icon`（装饰性 Phosphor 图标块，`aria-hidden`）、`size`（`panel` / `inline` 两级）、`actionVariant`（首次为空用 `primary`，筛选无结果沿用 `secondary`）；默认值与既有 DOM、`role="status"`、`data-state="empty"`、`aria-labelledby/aria-describedby` 契约保持不变，`vps_monitor`、`profit_sweep`、`logging_monitor`、`jobs_monitor`、`transfers`、`services_monitor` 等范围外页面零改动。
  - `frontend/src/shared/components/ui/table/EmptyRow.vue` 新增 `icon` / `size` / `actionVariant`，`size="inline"` 时改用 `p-4!` 并把紧凑变体透传给 EmptyState（默认仍是 `p-8!`）。
  - 删除「PBv7/PBv8 回测 / 配置」的自定义 hero 空状态（左侧图标栏、`PBv7 / 00` 等宽标记、径向渐变背景、clamp 大标题、胶囊按钮），改用共享面板；`emptyConfigsHtml` / `emptyQueueHtml` / `emptyArchivesHtml` 的 `<br>` 两行文案改为标题 + 说明两段。
  - 新图标：配置 `PhClipboardText`、队列 `PhHourglass`、存档 `PhArchive`、结果 `PhChartLineUp`、实例 `PhDesktop`、备份 `PhCloudArrowDown`、优化配置 `PhClipboardText`、优化帕累托 `PhTarget`、策略浏览器 `PhListBullets`、帕累托浏览器 `PhTrophy`；筛选无结果统一 `PhMagnifyingGlass`，加载中统一 `PhHourglass`，错误统一 `PhWarning`。
  - 首次为空的面板补上主按钮：优化队列「返回配置列表」、优化结果「打开队列」、优化帕累托「返回结果」、存档「添加存档」均改为 `action-variant="primary"`。
  - 策略浏览器与帕累托浏览器原先的单格 `<td>纯文字</td>` 空行、`.placeholder-panel` / `.placeholder-chart`（`bg-white/1`）虚线框也统一为同一组件（保留 `placeholder-*` 与 `noFills`/`noFrames`/`noRows`/`noChampions`/`noInsights` 类名与文案键）。
- **列表与空状态收敛到同一个底色 token，消除色差**：
  - 新增共享 token `--surface-list`（= `--surface-panel`，深炭灰 `#222222`）与 `--surface-list-rgb`；`.pbgui-list-wrap` 由 `--surface-deep` `#0f0f0f` 改为 `--surface-list`，`.pbgui-empty-state` / `.pbgui-error-state` 同步改由该 token 提供底色。
  - 新增空行契约：`tr[data-slot='empty-row']` 的单元格（含 hover）与其中 `.pbgui-empty-state` 背景透明、去阴影，保证表格内的空状态面板与其所在的表格像素级同色，且悬停不再给空行染色（优化页与策略浏览器页的悬停/斑马纹规则同步排除空行）。
  - 移除 v7_optimize 私有冷灰底色 `#171c21`：`.optimize-workspace` 的 `--opt-table-surface` / `--opt-table-surface-rgb` 改指共享 token，删除该页对空行单元格与空状态面板的覆盖，以及操作列固定栏的 `#191f24` / `#1c272c` / `#1f3037` 字面量，固定栏改为跟随共享契约的行状态着色；`.opt-table-wrap` 的 `padding-bottom: 24px` 收尾渐变与 `::after` 机制保留，仅换用共享颜色。
  - `--surface-deep` 本身保留，日志终端（`QueueLogModal`、`QueueLogPanel`、优化页日志区）与编辑器底纹继续使用。

## 全局右下角通知持续显示不消失问题修复及显示时长统一

- **统一通知显示时长为 4 秒（4000ms）**：
  - 针对全局所有模块的右下角 Toast 通知、Notice 提示和状态提示，统一标准展示时长为 4000 毫秒（`TOAST_VISIBLE_MS = 4000`）。
  - 创建全局共享常数模块 `frontend/src/shared/lib/toast.ts`，导出 `TOAST_VISIBLE_MS`。
  - 全面统一重构各模块显示时长：
    - `v7_run`：由 8000ms 统一调整为 4000ms。
    - `v7_edit`：由 8000ms 统一调整为 4000ms。
    - `v7_optimize`：接入统一常量 `TOAST_VISIBLE_MS`（4000ms）。
    - `market_data`：接入统一常量 `TOAST_VISIBLE_MS`（4000ms）。
    - `market_data_status`：由 3000ms 统一调整为 4000ms。
    - `api_keys_editor`：由 4300ms 统一调整为 4000ms。
    - `vps_manager`：修复 Notice 弹条此前无自动消失定时器而永久常驻在右下角的问题，加入 4000ms 自动关闭定时器并在组件卸载时安全清理。
    - 历史兼容模板：`frontend/v7_run.html`（8s → 4s）、`frontend/v7_edit.html`（8s → 4s）、`frontend/v7_optimize.html`（3.2s → 4s）、`frontend/vps_manager.html`（2.6s/4.2s → 4s）。
- **彻底根除 WebKit/Safari 原生定时器 Illegal invocation 非法调用导致的通知卡死常驻**：
  - 排查发现：在部分浏览器及 WebKit 内核环境下，从全局对象解构 `setTimeout`、`clearTimeout` 并以 `{ setTimeout, clearTimeout }` 对象形式传入 `createToastQueue` 执行 `timers.setTimeout(...)` 时，由于上下文接收者（`this`）为普通对象而非 `Window`，抛出 `TypeError: 'setTimeout' called on an object that does not implement interface Window` 异常。
  - 由于异常发生在 toast 推入响应式数组之后、定时器调度完成之前，导致通知显示在页面右下角后永远无法启动销毁定时器，形成「通知持续显示、永不消失」的缺陷。
  - 修复方案：在 `v7_backtest/lib/toast.ts` 及各模块中将定时器与 fetch 调用封装为安全代理函数 `(...args) => globalThis.setTimeout(...args)`、`(...args) => globalThis.clearTimeout(...args)` 与 `(...args) => globalThis.fetch(...args)`，彻底杜绝上下文解绑造成的运行时崩溃。
- **全页面支持点击通知即刻关闭（Click-to-dismiss）**：
  - 在所有 Vue 页面及历史 HTML 页面的右下角通知卡片、提示条上新增点击即刻关闭交互与鼠标手势（`cursor-pointer`、`select-none` 与 `@click="dismiss"` / `node.onclick`）。
  - 点击时同步触发 `clearTimeout` 释放定时器句柄并从 DOM / 响应式数组中移除通知，赋予用户随时手动清除通知的能力。

## 回测结果表格 Table Foot 固定底端位置优化

- **Table Foot 改为固定底端位置**：移除「PBv7/PBv8 回测/结果」页面表格底部的可拉动手柄（`#results-resize-handle`）以及列表容器的动态像素高度限制，使结果列表容器（`#results-list-wrap`）弹性撑满剩余视口高度并在内部自适应滚动，底部 `ListFooter` 始终稳固锚定在卡片最底端，彻底消除由于拖动导致的表格下半部分大面积黑斑悬空问题。
- **修复浏览器环境下 fetchFn 导致的非法调用（Illegal invocation）报错**：修复 `useResults.ts`、`useLegacyResults.ts`、`useConfigs.ts` 中解构 native `fetch` 时因缺少 `globalThis` 上下文抛出的 `TypeError: Illegal invocation` 异常，确保回测结果分页与首屏加载平稳无误。

## 回测与优化全页面「操作」列及数据列对齐方式统一与优化

- **统一「操作」列表头与按钮居左对齐**：修复「PBv8/回测/队列」、「PBv8/回测/配置」、「PBv8/回测/结果」中操作列表头使用 `<Th align="center">` 导致文字居中而下方操作按钮靠左悬浮错位的问题。将回测模块操作列表头与「PBv8/优化/配置」、「PBv8/优化/队列」、「PBv8/优化/结果」、「PBv8/优化/帕累托」全面对齐为标准居左，实现表头与操作按钮垂直边界严格平直对齐。
- **增强表格操作单元格对齐能力**：在共享表格操作单元格组件 `TdActions.vue` 中新增 `align?: 'left' | 'center' | 'right'` 属性支持（默认 `'left'`），并将 `.pbgui-list-actions__group` 样式与单元格对齐方式联动，消除固定 `justify-content: flex-end` 造成的对齐冲突。
- **数据列与表头全局统一规范**：对回测与优化模块全部 7 个页面（共 7 张核心业务表格）的所有数据列（名称、交易所、策略、币种、开始/结束时间、结果数/回测数、帕累托数、指标、状态等）进行全量对齐审查，确保所有表头 `SortTh` / `Th` 与数据单元格 `td` 均严格保持一致的居左阅读线，消除跨模块与跨列的视觉参差。

## 优化配置、队列、结果与帕累托表格样式及统计信息统一与优化

- **收尾方式统一为视口全高铺满型**：统一「PBv8/优化/配置」、「PBv8/优化/队列」、「PBv8/优化/结果」与「PBv8/优化/帕累托」四张表格的收尾形态为视口弹性铺满（`flex-1 min-h-0 flex flex-col`），使得底部 `ListFooter` 始终稳固锚定在视口与卡片最底端，杜绝卡片半空截断或各子页面高度参差不齐的现象。
- **背景色优化与深炭灰一体化设计**：卡片面板与表格主体统一采用深炭灰底色（`bg-panel`），消除数据项较少时表格下方的死黑挖空感；表头采用半透明微深分层（`rgb(var(--bg-page-rgb) / 0.85)` 与背景毛玻璃模糊），增强表头与数据行对比度。
- **总项数与选中数单点收敛至底部 ListFooter**：移除配置、队列、结果与帕累托页工具栏中多处重复出现的统计徽标与数字，将「总项数」与「选中数」统一收敛至底部固定位置的 `ListFooter` 单一展示。
- **彻底统一整行选择规范**：移除配置、队列、结果、帕累托表格中突兀且与 PBGui 规范不符的复选框（Checkbox）列，全面对齐整行选择设计规范（支持整行点击高亮、键盘 Enter/空格快速切换、基于 `useRowDragSelect` 的鼠标范围拖拽多选）；选中行统一展示 3px 品牌主题色左重音指示条（`border-left: 3px solid var(--accent)`）与柔和背景色（`rgb(var(--accent-rgb) / 0.12)`）。帕累托指标列选择器下拉菜单中的 Checkbox 保持独立完好。

## 回测配置、队列与结果表格样式及统计信息统一与优化

- **收尾方式统一为视口全高铺满型**：统一「PBv8/回测/配置」、「PBv8/回测/队列」与「PBv8/回测/结果」三张表格的收尾形态为视口弹性铺满（`flex-1 min-h-0 flex flex-col`），使得底部 `ListFooter` 始终稳固锚定在视口与卡片最底端，杜绝卡片半空截断或各子页面高度参差不齐的现象。
- **背景色优化与深炭灰一体化设计**：卡片面板与表格主体统一采用深炭灰底色（`bg-panel`），消除数据项较少时表格下方的死黑挖空感；表头采用半透明微深分层（`rgb(var(--bg-page-rgb) / 0.85)` 与背景毛玻璃模糊），增强表头与数据行对比度。
- **总项数与选中数收敛至底部 ListFooter**：移除配置页工具栏、队列页工作台 Header 与工具栏、结果页 Header 中多处重复出现的统计徽标与数字，将「总项数」与「选中数」统一收敛至底部固定位置的 `ListFooter` 单一展示。
- **彻底统一整行选择规范**：移除配置表格中突兀且与 PBGui 规范不符的复选框（Checkbox）列，全面对齐整行选择设计规范（支持整行点击、鼠标范围拖拽多选、键盘 Enter/空格快速切换）；选中行统一展示 3px 品牌主题色左重音指示条（`border-left: 3px solid var(--accent)`）与柔和背景色（`rgb(var(--accent-rgb) / 0.12)`）。
- **文字与表头细节打磨**：去除版本表头中的尾部冒号，中英文统一为「版本 / Version」，消除视觉噪音。


- **消除状态列迭代进度闪烁**：修复了「PBv8/PBv7 优化/队列」页面中，运行中（running/optimizing）任务的迭代进度条随着 WebSocket 推送与 REST 刷新而忽隐忽现、忽上忽下跳动的问题。
- **后端推送实时进度**：在 PBv8 与 PBv7 优化队列数据源及 WebSocket 广播（`/ws/opt8`, `/ws/opt7`）中，为处于 running/optimizing 状态的队列项直接计算并附加当前 `progress` 数据，避免客户端接收全量队列更新时意外抹除进度对象。
- **前端进度平滑合并与防抖缓存**：在前端 `useOptimizePage` 中建立 `queueProgressCache` 缓存机制，在 WebSocket 广播与 REST 轮询时自动将最新进度合并至对应行，任务结束或移出运行态时自动清理缓存，从根源上杜绝异步覆盖与闪退。
- **运行态常驻轨线与消除布局跳变（CLS）**：在 `QueuePanel.vue` 中为 running 状态常驻渲染进度条底槽与文本区域，无论处于初次启动还是数据轮询间隙均保持稳定行高；进度的进度条填充宽度采用浮点数精细过渡。
- **低进度区间小数精细度优化**：进度百分比低于 10% 且大于 0% 时（如 1.8%），展示保留 1 位小数的精确百分比，直观反映迭代初始进展，避免早期长期显示为粗粒度的 1% 或 2%。

## 优化页面初次加载连接提示横幅优化

- **消除初次进入黄色等待横幅**：优化「PBv8/PBv7 优化/配置」等页面初次加载时的连接提示交互，将 WebSocket 连接由等待多项 REST API 串行加载后改为 `onMounted` 立即并行发起，并抑制初次进入时的全宽黄色等待横幅，消除布局抖动与视觉干扰。
- **对齐连接状态展示规范**：工作台顶栏右侧状态药丸（StatusStrip）在初次连接时保持中性低调显示，连接成功后展示绿色「● 已连接」；全宽提示横幅仅保留用于真实的连接意外断开（lost）状态。
- **断线自动重连与告警**：在 `useOptimizePage` 中引入断线（`lost`）状态感知与 1s ~ 30s 指数退避自动重连机制，连接断开时呈现醒目的断开重连横幅，重连成功后横幅自动隐藏。

## 回测队列任务日志查看器修复

- **恢复日志弹窗交互**：修复了 PBv8/PBv7 回测队列中点击任务行「日志」按钮时由于 `onQueueShowLog` 为空桩而无法弹出日志窗口的问题。
- **共享实时日志终端**：将纯 Vue 3 WebSocket 实时日志流组件 `QueueLogTerminal.vue` 提升为共享组件，支持日志等级筛选、关键词搜索与高亮、断线重连及自动滚动。
- **回测队列日志模态窗**：为回测页面实现 `QueueLogModal.vue` 模态弹窗，展示任务名称与日志相对路径（PBv8 对应 `backtests_v8/{name}.log`，PBv7 对应 `backtests/{name}.log`），符合无原生弹窗与显式关闭的设计规范。
- **注册 AI 页面动作**：在回测页面中注册 `backtest_queue_item` 的 `show_log` AI 动作，对齐优化页面的 AI 集成体验。

## Merge origin/main v2.02.16-v2.03.1 into the Vue3 branch

- **Upstream synchronization**: Merged the four remote `main` release commits while preserving the Vue3 + Tailwind CSS v4.3 page entrypoints and shared frontend contracts.
- **Runtime parity**: Retained the upstream PB8 parameter-help endpoint, PB8 metadata compatibility error, job-log path validation, VPS Monitor capability reporting, and related backend security and monitoring updates.
- **Legacy compatibility**: Kept the Vue3 pages as the active implementation while retaining only the legacy fallback behavior and localized pending-action states needed by the existing HTML templates.
- **API serial**: Advanced `api/serial.txt` to `2620` after incorporating the API and monitor runtime changes.

## Services Monitor 嵌入式任务监控配色统一

- **统一嵌入表面**：任务监控 iframe 在 Services Monitor 中使用工作区页面表面 token，消除与外层工作节点详情区域之间的灰度跳变。
- **收敛空态层次**：嵌入模式下移除空任务卡片的强阴影并降低边界对比度，保留标签激活态和任务内容的现有交互与语义色。

## UI/UX 审查改进

- **修复日志查看器加载**：经典脚本现在正确发布 `window.LogViewerPanel`，日志页在构造器不可用时提供显式重试入口。
- **Swagger 离线化**：Swagger UI 的 JavaScript、CSS 和 PBGui 样式改为本地资源，移除文档页对第三方 CDN 的运行时依赖。
- **统一版本身份**：帕累托浏览器根据运行时结果同步 V7/V8 页面标题、工作台身份，并移除重复的页面级 H1。
- **改善空态与移动导航**：VPS 监控未配置状态增加下一步引导；移动视口默认收起持久化展开的工作台导航，优先展示当前内容。
- **统一操作图标**：帕累托浏览器的回测和策略浏览器操作使用 Phosphor 图标替代 emoji，同时保留可见文字。

## Merge origin/main v2.02.13-v2.02.15 into the Vue3 branch

- **Upstream synchronization**: Merged the three remote `main` release commits while preserving the Vue3 + Tailwind CSS v4.3 page entrypoints and shared frontend contracts.
- **Vue3 parity fixes**: Added stale-request protection to Balance Calculator, background dismissal for Coin Data refresh jobs, and WebSocket action failure/timeout recovery for VPS Monitor.
- **Runtime visibility**: Resolved the API serial conflict at `2602` and retained the upstream VPS, cluster, monitoring, logging, documentation, and regression-test updates.

## Optimize 队列设置弹窗紧凑化

- **移除重复关闭入口**：删除标题栏中的「关闭」按钮，保留底部「取消」作为唯一可见的放弃修改操作，同时继续支持 Escape 关闭。
- **压缩标题区域**：收紧标题栏与底部操作栏的垂直留白，释放队列设置表单的可视空间，不改变保存和取消逻辑。

## Market Data 宽屏任务监控边距优化

- **扩大任务列表可视区域**：在宽度达到 1200px 时，Best 1m 与 OHLCV Copy 任务监控 iframe 向面板两侧扩展，减少宽屏下任务列表的无效留白。
- **保留响应式布局**：窄屏继续使用原有宽度和边距，不改变 iframe 地址、自动高度同步或任务轮询行为。

## Optimize 空态面板间距与边界收紧

- **消除嵌套卡片感**：空态面板与表格主体共用页面级表面 token，移除空态阴影并将内外留白收紧，避免空列表与 Table 背景出现割裂。
- **保留软边界**：保留低对比度细边框、空态说明和操作按钮，同时不改变表格滚动、terminal bar 或列表交互。

## Optimize 表格背景层次统一

- **统一主体表面**：Optimize 的 frame、滚动视口、表格主体和空态行现在使用同一冷炭灰背景，消除 Results、Queue、Pareto 表格内部的色差断层。
- **保留结构层次**：表头和底部 terminal bar 继续使用独立的面板层，并保留悬停、选中、滚动和空态卡片行为。

## Internal Transfers 表单控件对齐

- **统一方向与数量控件基线**：划转表单改为顶部对齐，使方向选择器与数量输入框在桌面布局中处于同一水平线。
- **保持响应式行为**：提交按钮仅在桌面布局下补齐控件高度偏移，移动端继续按原有顺序自然堆叠；不改变划转校验或提交逻辑。

## PBv8 Optimize 空态表格背景统一

- **统一空态表面**：Optimize 队列、结果和 Pareto 列表的空状态行现在与表格视口使用一致的冷炭灰背景，避免空态单元格与周围面板出现割裂的黑色块面。
- **保留内容层次**：空状态提示卡继续保留略亮的内部层次、边框和操作按钮，不改变现有布局、文案或交互行为。

## Merge origin/main v2.02.9-v2.02.12 into the Vue3 migration branch

- **Upstream synchronization**: Merged the four remote `main` release commits while preserving the current Vue3 + Tailwind CSS v4.3 page entrypoints and shared frontend contracts.
- **Vue3 heatmap parity**: Ported the new `build-ohlcv-info` `retryable` and `empty_reason` response handling into the HL Data Actions composable, including bounded refresh retries, stale-generation protection, and timer cleanup on unmount.
- **Legacy compatibility**: Updated shared log viewer cache-busting to v35 and retained the branch's i18n, modal, icon, datepicker, and Vue migration assets while incorporating main's remote restart-handler behavior.
- **API restart visibility**: Advanced `api/serial.txt` to `2584` after the release merge and runtime changes.

## Vue3 工作台共享视觉与页面身份收敛

- **完善共享页面身份**：AppShell 现在将可选的页面描述传递到 WorkspaceHeader，标题、breadcrumb、描述和复制路径控件形成一致的页面上下文层级，并在窄屏下允许描述自然换行。
- **增加语义交互 token**：补充 hover、selected、pressed、focus、overlay、interactive text 和 selected border token，同时保留全部 legacy alias，降低页面局部颜色方言带来的视觉漂移。
- **统一状态与静态卡片反馈**：StatusStrip 的语义色改用集中式 RGB token；静态卡片不再通过上浮阴影模拟可点击行为，减少误导性的交互暗示。
- **建立共享工作台复合组件**：新增 PanelHeader、ActionGroup、PageToolbar、StatusBadge、MetricBlock、FormSection 和 ChartFrame，并将 PBv7/PBv8 Run、Optimize 的 contextual toolbar 接入 PageToolbar。
- **迁移运营摘要**：VPS Monitor 的 Connected、Connecting 和 Disconnected 汇总改用 MetricBlock，保留原有 WebSocket、日志、实例和历史图表行为，同时在窄屏下采用可堆叠的摘要网格。
- **扩展共享组件采用范围**：Services Monitor Overview 卡片改用 StatusBadge，Optimize 的四个配置/队列/结果/Pareto 标题改用 PanelHeader，VPS Monitor 历史指标弹窗改用 ChartFrame。
- **补齐双语页面描述**：Run、Optimize、VPS Monitor 和 Services Monitor 现在使用 EN/ZH 页面描述，帮助用户在高密度工作台中快速确认当前页面职责。
- **收敛高密度表格外壳**：Coin Data 的动态交易对表和 Market Data Inventory 表接入共享 Table 原语，保留各自的排序、拖拽选择、横向滚动和页面专用列定义。
- **完成 Optimize 标题层级迁移**：配置、队列、结果和 Pareto 四个工作区标题统一使用 PanelHeader，减少页面局部 heading 样式差异。
- **补齐 Backtest 页面身份**：Backtest 工作台接入双语页面描述，与 Run、Optimize 共享相同的标题上下文层级。
- **覆盖核心分析工作台**：Edit、Pareto Explorer 和 Strategy Explorer 接入共享页面描述；Pareto/Strategy 复用现有双语页面副标题，Edit 使用独立的双语编辑器说明。
- **补齐 Backtest 上下文**：Backtest 工作台接入双语页面描述，使编辑、回测、优化和分析页面在共享 Header 中保持统一的职责说明。
- **统一核心分析工具栏**：v7 Edit 与 Pareto Explorer 的页面级操作条接入共享 PageToolbar，保留现有按钮顺序、筛选/跳转动作与 legacy `.page-toolbar` 选择器。
- **收敛编辑器导入弹窗**：v7 Edit 的 Import Config 流程改用共享 Modal，保留用户 combobox、JSON 校验、草稿提交和显式取消/确认操作，并禁止背景点击误关闭。
- **统一批量表格键盘语义**：Backtest Results、Optimize Configs/Queue/Results、Coin Data 和 Market Data Inventory 行现在暴露 `aria-selected`、键盘焦点和 Enter/Space 选择操作，同时保留原有 checkbox、拖拽选择、双击编辑和拖拽排序。
- **补齐共享 Modal 可访问性**：每个共享 Modal 现在提供 DialogDescription，消除无描述警告并保留可选的自定义屏幕阅读器说明。
- **补齐 Transfers 页面身份**：Internal Transfers 接入共享 Header 页面描述，说明余额检查与安全资金路径操作，未改变转账确认或提交流程。
- **补充契约测试**：覆盖共享 header 描述、文本转义、状态 token、工作台复合组件、rail 样式、typecheck 和代表页面兼容性验证；未改变 API、数据字段或业务动作。

## PBv7/PBv8 回测与优化配置表视觉统一

- **统一表格框架**：回测和优化的配置列表现在共用同一套圆角边框、滚动视口、粘性表头和底部收口，短列表不再呈现两种不同的容器结构。
- **统一数据层级**：名称、交易所、日期和数量列采用一致的字重、等宽排版和辅助文字颜色；配置行共享相同高度、分隔线、斑马纹和悬停反馈。
- **统一选中与操作状态**：两张表使用相同的淡蓝选中背景、3px 左侧强调线、固定操作列底色和图标按钮焦点样式，同时保留各页面原有列、排序、筛选、选择方式和操作行为。
- **精简重复统计**：总数与选中数统一保留在工具栏，底部栏仅作为视觉收口，避免同一统计在表格上下重复出现。

## PBv7/PBv8 Optimize 工作区表格与通知视觉优化

- **自然表格收尾**：配置、队列、结果和 Pareto 四个面板统一采用与 PBv7 回测配置表一致的 frame + terminal bar 收尾，使用冷炭黑表面和明确底部边界，短列表和空态不再直接落入大片深黑区域。
- **深色层次优化**：细分表格视口、数据行、斑马纹和固定操作列的背景层级，同时保留现有悬停、选中、排序和滚动行为。
- **紧凑状态通知**：右下角通知升级为带语义色轨和 Phosphor 状态图标的紧凑卡片，支持长文本换行、轻量入场动画和 reduced-motion 偏好。
- **修复全选高亮**：排除选中行的偶数行斑马纹和固定操作列底色，确保配置表全选时每一行保持一致的高亮状态。
- **移除重复统计**：保留工具栏中的配置数量和选中数量，将底部 terminal bar 调整为纯视觉收尾，避免同一信息重复展示。
- **保持行为稳定**：不修改字段、API、数据加载、批量选择、行操作或现有四秒通知生命周期。

## Complete post-merge Python and frontend regression repair

- **Regression suite**: Adapted the remaining legacy-oriented tests to the Vue3/Tailwind v4.3 page structure, cookie authentication, mount-safe URL model, read-only PB8 Legacy panel, and current cache-busted assets.
- **PB8 Legacy parity**: Kept Legacy browsing and Compare available in PB8 while gating destructive and rebacktest actions through the Vue panel's read-only mode.
- **AI and worker coverage**: Moved log evidence and CMC context assertions to the Vue implementations and added Vue coverage for worker duplicate-action suppression, pending labels, and error cleanup.
- **Sandbox portability**: Landlock Python analysis now permits the virtual-environment prefix and the base interpreter prefix, allowing standard-library imports without Bubblewrap while retaining filesystem and syscall restrictions.
- **PB7 checkout state**: VPS Manager reads the live PB7 branch and commit when available, falling back to persisted metadata only for unavailable checkouts.
- **Validation**: Complete offline Python suite: 7,768 passed, 43 skipped; frontend typecheck: 0 errors; frontend Vitest: 4,491 passed; frontend build: passed.
- **API serial**: bumped from `2576` to `2577` after the API runtime fixes.

## Fix Python regressions after the v2.02.2-v2.02.8 merge

- **AI Python analysis sandbox**: Landlock analysis now permits both the virtual-environment prefix and the base interpreter prefix, allowing standard-library imports to complete when Bubblewrap is unavailable without weakening the filesystem boundary.
- **PB7 branch state**: VPS Manager reads the current branch and commit from the live PB7 checkout, falling back to persisted metadata only when the checkout cannot be inspected.
- **Regression isolation**: Credential-migration tests no longer inspect unrelated live PBApiServer processes; frontend/static-contract tests now target the Vue3 sources and the cookie-authenticated page model.
- **Validation**: The complete offline suite passes with 7,768 tests passed and 43 skipped.
- **API serial**: bumped from `2575` to `2576`.

## Merge origin/main v2.02.2–v2.02.8 into the Vue3 Migration Branch (合并 main 至 Vue3 分支)

- **Upstream merge**: Merged the nine `origin/main` commits from `v2.02.2` through `v2.02.8` into `feature/frontend-vue3-migration`, resolving 47 conflicted files (17 API routers, 22 legacy templates, 7 deleted-by-us pages, docs and tests) by keeping the branch's Vue-first page serving and main's endpoint/security fixes together.
- **Vue3 cookie-auth alignment**: `/api/boot.js` no longer publishes a session token; it now publishes the validated origin, the trusted ASGI mount prefix, and an `authenticated` flag. `apiFetch` sends `credentials: 'same-origin'` and every former Bearer-header usage across the Vue pages was removed, matching main's HttpOnly-cookie model.
- **Mount-prefix-safe URLs**: Added `apiPath`/`wsOrigin`/`pageOrigin` helpers in `shared/boot.ts` and re-pointed every page `config.ts`, composable and component at them, so REST bases are prefix-relative paths and WebSocket URLs derive from `window.location` plus the trusted prefix (never the request host), surviving reverse-proxy mounts and IPv6 hosts.
- **PB8 validation groups (v2.02.4/2.02.5)**: The Vue backtest results table now collapses Optimize-validation result groups (`result_group`) into sticky header rows with a one-click group Compare button and expand/collapse state; single-member groups render as plain rows like the legacy contract.
- **Coin Data quote selector (v2.02.7)**: Ported main's interactive quote picker onto the Vue filters panel — toggle buttons from `available_quotes` with a one-quote minimum, exchange-specific defaults mirrored from the server, and URL persistence.
- **Telegram write-only credentials (v2.02.5)**: The Services Monitor API-server settings now show a hidden-value placeholder when credentials are stored, keep unchanged values on save, and clear stored credentials only through an explicit checkbox.
- **Worker action guards (v2.02.7)**: Services Monitor worker Start/Stop/Restart buttons lock and relabel while an action POST is in flight, preventing double actions on the same worker.
- **Tiingo links (v2.02.5)**: The Market Data Tiingo card links directly to Tiingo's API-token and official usage pages.
- **API-keys stale-request guards (v2.02.7)**: The Vue editor drops slow user loads when a newer open supersedes them, clears the stale hash on failure, and expiry checks ignore responses for a different user.
- **Shared JS hardening**: `log_viewer_panel.js` (50,000-line cap, WebSocket generation guards), `shared_help_overlay.js` and `pbgui_nav.js` (cookie auth, Help-Center navigation, `_appPath` mount handling) carry main's fixes; cache-bust versions were merged past both sides (log viewer v31, dialogs v10, help overlay v9, nav v1788).
- **API serial**: bumped from main's `2574` to `2575`.

## PBv8 优化队列日志对话框完整移植

- **移植状态仪表盘**：日志对话框顶部新增优化状态仪表盘，按原版节奏轮询 `/queue/{filename}/status`，呈现进度条、Phase、Pareto Front、后端、运行时长、CPU、内存与队列摘要卡，以及目标、范围、最近活动和错误详情行，布局对齐 main 分支原版浮动日志面板。
- **纯 Vue 日志终端**：日志流改由 Vue 组件实现，复刻 legacy `log_viewer_panel.js` 的本地文件 WebSocket 协议（订阅前缀日志文件、2 秒重连、4001 会话过期跳转、5000 行上限、级别检测），不再依赖 `window.LogViewerPanel` 全局脚本，解决日志对话框为空的问题。
- **完整过滤工具栏**：提供级别按钮（DBG/INF/WRN/ERR/CRT）、系统预设过滤（错误、警告、错误+警告、连接、重启、Traceback）、防抖搜索、过滤开关、匹配计数与上下导航，以及暂停/继续、清空和连接状态徽章。
- **结果联动**：Pareto Front 卡片保留 Results 与 Pareto Explorer 快捷按钮，按名称精确/包含匹配优化结果并跳转对应面板。

## PBv8 优化配置编辑器与主线对齐

- **补齐运行时选项**：Vue3 新建配置编辑器现在显示 PB8 运行时公布的 optimizer helper 复选框，并按 Long、Short、Other 动态呈现 fixed runtime overrides。
- **同步策略配置**：切换 `strategy_kind` 时使用 runtime 的 bot 默认值和 active bounds，并缓存未保存的各策略 bounds、fixed params 与 bot block，保存时无损合并。
- **修正配置语义**：HSL runtime override 使用规范点分路径，兼容迁移旧扁平键；日志级别改为语义下拉框，可空 RNG seed 可正确保留 `null`。
- **保持未来兼容**：GPU 配置不再重复出现在 Additional Parameters，重置 GPU 默认值时保留未知未来字段，Scoring/Limits 可直接录入命名场景。
- **补充回归覆盖**：增加 metadata 接线、override 保存、GPU reset、场景输入和中英文文案测试，并同步 PBv8 Optimize 三语指南。

## 合并主线 v2.02.1 并同步 Vue3 页面行为

- **主线合并**：合并远端 `origin/main` 的单个提交 `11897f6e`（`Release v2.02.1`），吸收认证安全、数据库锁、dashboard 和回归测试更新。
- **Vue3 欢迎页认证**：欢迎页改用 same-origin session cookie 与显式 passwordless session POST，不再通过 Vue 状态或页面注入传递 session token。
- **Vue3 回测适配**：多 Exchange rebacktest 队列任务追加 Exchange 名称后缀，并将非有限的 imported starting balance 回退到默认值。
- **Vue3 dashboard 编辑器**：父子 iframe 的 postMessage 目标限制为当前 origin。
- **API serial**：保留上游 `api/serial.txt` 从 `2536` 更新至 `2541`。

## PBv8 优化队列日志输出对话框优化

- **扩大日志阅读空间**：将右下角窄面板调整为居中的大尺寸日志对话框，使用接近全屏的纵向空间，适合查看长日志和宽日志行。
- **强化日志层级**：新增终端图标、任务标题、日志文件名和连接状态标识，统一使用 PBGui 深色主题的面板、边框、阴影和语义色。
- **改善响应式体验**：日志内容区域保持独立滚动，移动端自动收紧边距和对话框尺寸；保留日志筛选、侧栏、实时查看和关闭行为。

## PBv8 优化配置、队列与结果列表视觉重设计

- **统一工作区层级**：优化配置、队列和结果页面使用一致的工具栏、边框、表头、行高和滚动容器，列表视觉与 PBGui 深色石墨主题保持一致。
- **提升密集列表可读性**：为主标识、策略、交易所、状态、模式、数量和标签增加明确的层级与轻量语义色，使用更舒适的间距与交替行背景，降低长列表扫描成本。
- **强化操作区**：操作按钮收纳到统一的紧凑操作组，运行/停止使用状态色，操作列在宽表横向滚动时保持可见；保留排序、拖拽排序、范围选择和所有原有动作。

## PBv8 回测结果 Dialog 标题栏尺寸微调

- **进一步压缩头部**：将结果详情 Dialog 的标题栏调整为约 42px 高，减少标题、图标和关闭按钮的额外占位。
- **保持内容可读性**：保留结果名称、详情类型和版本标签，不改变图表与图片区域的滚动行为。

## PBv8 回测结果 Dialog 标题栏紧凑化

- **减少标题占用**：为结果详情 Dialog 提供显式紧凑标题栏样式，缩小图标、标题和上下留白，让图表内容获得更多可视空间。
- **保持共享 Dialog 兼容**：共享 Modal 仅增加可选的标题栏 class，其他页面继续使用原有标题栏布局。

## PBv8 回测结果图片 Dialog 滚动修复

- **完整查看长图**：修复结果图片 Dialog 内容区域没有正确收缩的问题，长图现在可以在 Dialog 内完整滚动查看。
- **统一 Dialog 布局**：为共享 Modal 增加明确的纵向 flex 和可收缩滚动内容区，避免图表或图片被底部裁切。

## PBv8 回测结果工作区与详情 Dialog 优化

- **释放结果列表空间**：结果表改为占满 Results 页面剩余高度，筛选区和表头保持固定，长列表只在表格区域滚动。
- **聚焦单项查看**：点击结果行右侧的图表、JSON 或图片操作后，在宽屏 Dialog 中查看对应内容，避免详情图表把结果记录推到页面下方。
- **保持结果操作不变**：保留整行选择、排序、筛选、批量操作和拖动调整表格高度；Dialog 提供明确关闭按钮并支持键盘 Escape 关闭。

## PBv8 帕累托浏览器卡片间距与布局统一

- **统一页面节奏**：将页面卡片之间、阶段网格、指标网格、图表布局和详情网格统一为 16px 间距。
- **统一卡片内距**：标准卡片内边距统一为 16px，小屏幕自动收紧为 12px，减少页面不同区域的视觉跳动。
- **优化滚动空间**：去除工具栏与父级布局重复产生的底部间距，并保留页面底部呼吸空间和外层滚动行为。
- **保持交互不变**：不修改阶段切换、数据加载、图表渲染、筛选或配置详情逻辑。

## PBv8 帕累托浏览器按钮主题配色优化

- **统一系统主题**：将深度智能页面操作栏的按钮映射到现有 `primary`、`info`、`success`、`secondary`、`outline` 和 `ghost` 语义变体。
- **强化操作层级**：扫描全部结果使用主要操作色，运行回测与固定基线使用对应状态色，返回和次要操作降低视觉权重。
- **修正深度标签配色**：将参数、场景、演化和相关性标签的选中态从高亮实心色改为半透明强调色，未选中态改为系统灰阶表面与前景色。
- **保持交互不变**：仅调整按钮 variant，不修改页面导航、扫描、回测或基线操作逻辑。

## PBv8 运行页面参数 Tooltip 国际化

- **补齐参数说明翻译**：将基础设置、高级设置、筛选器和 Bot 配置中的静态英文 tooltip 全部接入 `v7run.tip.*` i18n 词典。
- **支持中英文切换**：新增完整的 EN/ZH tooltip 文案，中文模式下参数说明会随页面语言自动切换。
- **保持参数语义不变**：仅调整说明文案来源，不修改任何配置字段、默认值或交互逻辑。

## PBv8 运行页面卡片布局与视觉层级优化

- **优化卡片层级**：为基础设置、筛选器和 Bot 配置卡片补充统一的边框高光、轻量阴影和标题强调线，让不同配置区域更容易区分。
- **改善表单节奏**：统一卡片内边距与字段间距，卡片之间使用 16px 的紧凑间距，并在小屏幕上自动收紧间距，避免内容贴边或布局拥挤。
- **修复内容截断**：禁止纵向卡片容器在页面内容较多时被 flex 布局压缩，改由外层滚动区域承载完整表单内容。
- **保留现有交互**：不修改字段、保存、筛选、折叠及配置同步逻辑。

## PBv8 运行实例编辑页面卡片间距优化

- **增加卡片间距**：将点击“添加PB8实例”后编辑页面中多个卡片之间的垂直间距从 16px 调整为 24px，提升页面层次和可读性。
- **保持交互不变**：不修改卡片内容及实例编辑、保存等交互行为。

## PBv8 回测配置列表底色修复

- **统一列表表面**：让回测配置表右侧固定操作列跟随对应数据行的斑马纹、悬停和选中底色，消除操作区与数据行之间的底色偏差。
- **保留原有交互**：不改变配置排序、整行选择、编辑、排队、查看结果和复制操作。

## PBv8 回测与优化列表视觉统一

- **统一列表节奏**：统一回测配置、回测结果、优化配置和优化结果列表的工具栏、滚动容器、表头、行高、分隔线、悬停态和固定操作区，改善密集数据浏览时的横向与纵向对齐。
- **保留交互语义**：不改变排序、整行选择、拖拽范围选择、双击编辑和结果操作，仅将优化列表的操作按钮收纳到一致的操作组中。

## Merge origin/main v2.01.11 into the Vue3 Migration Branch (合并 main 至 Vue3 分支)

- **Upstream release sync**: Merged `origin/main` commit `e8eeea6d` (`v2.01.11`) into `feature/frontend-vue3-migration`.
- **Vue3 frontend parity**: The upstream commit contains no frontend page changes, so no additional Vue3 or Tailwind CSS v4.3 adaptation was required; the existing v2.01.10 Vue3 adaptations remain unchanged.
- **API serial**: Preserved the upstream serial update from `2500` to `2502`.

## Merge origin/main v2.01.9 + v2.01.10 into the Vue3 Migration Branch (合并 main 至 Vue3 分支)

- **Merged upstream releases**: Merged `origin/main` releases `v2.01.9` and `v2.01.10` into `feature/frontend-vue3-migration`, resolving conflicts in the legacy `v7_backtest.html` / `v7_optimize.html` fallback templates and the EN/DE PB8 backtest help topics (both sides' content kept).
- **Vue3 queue-draft validation (`QueueDraftModal.vue`)**: Ported the new `preserve_timerange` / `preserve_exchanges` queue-draft flags so validation drafts opened from PB8 Optimize keep each candidate's own start/end date and exchange group instead of one shared range, and switched the queue-draft deep link to open the Queue panel.
- **Vue3 optimize holdout-validation modes (`App.vue`, `ParetosPanel.vue`, `useOptimizeActions.ts`)**: Expanded the holdout validation selector from two to four modes (`holdout_only`, `full_timerange`, `holdout_and_full_timerange`, `all_timeranges`), renamed the action to **Validate**, and made `queueParetoHoldouts` queue Training + Holdout + Full-timerange jobs with preserve flags plus a missing-holdout warning.
- **Vue3 optimize selected-result persistence (`useOptimizePage.ts`)**: Persisted the active result set to `sessionStorage` (keyed per optimize version) and restored it when reopening the Paretos panel.
- **Vue3 profit-sweep transfer rounding (`App.vue`)**: Added the new `transfer_rounding_step` policy field to the policy group with EN/ZH labels.
- **Vue3 suite-editor balance sync (`SuiteEditor.vue`)**: Recalculate now re-syncs the sweep-cycles base balance from the current editor context.
- **i18n**: Added EN/ZH dictionary keys for the validation-mode selector, preserve-flag notes, and the transfer-rounding field.

## PBv7/PBv8 Optimize — OHLCV Preflight Modal Comprehensive i18n Localization (OHLCV就绪检查多语言)

- **End-to-End Chinese Localization (`OhlcvPreflightModal.vue`)**: Localized all dynamic and static elements of the OHLCV Readiness check dialog in Chinese mode:
  - **Summary Status & Headlines**: Localized status badges (`PASS`, `PRELOAD`, `READY`, `BLOCKED`, `TOO_YOUNG`, `MISSING_MARKET`, `FAIL`), dynamic summary headlines, and comma-separated breakdown counts (e.g. `41 would fetch on start` → `41 个启动时将在线获取`).
  - **Readiness Pill Counters & Group Titles**: Mapped readiness category keys (`missing_local`, `store_complete`, `legacy_importable`, `blocked_by_persistent_gap`, `missing_market`, `coin_too_young`) to friendly bilingual terms.
  - **Request & Universe Field Key/Value Mapping**: Formatted request parameters (`requested_start_date`, `catalog_present`, `source_dir`, etc.) and universe keys (`coin_count`, `coins_mode`, etc.), mapping booleans to `是`/`否` and mode strings (e.g. `explicit` → `指定`).
  - **Backend Server Messages Bridge**: Expanded `frontend/i18n/server_msgs.json` with 44 exact-match translations for PB7/PB8 readiness generator notes, headlines, and action button labels.
  - **Reactive Locale Handling**: Enhanced `serverMsg(text, lang?)` in `frontend/src/shared/i18n.ts` to support explicit reactive locale injection.
  - **Unit Test Parity**: Added comprehensive bilingual Vitest unit tests in `OhlcvPreflightModal.test.ts` verifying both English and Chinese rendering across all fields.

## PBv7/PBv8 Optimize — OHLCV Preflight Modal Dark Theme Unification (OHLCV就绪检查)

- **Solid Dark Surface & Backdrop Stacking (`OhlcvPreflightModal.vue`)**: Replaced the unstyled, translucent `.opt-modal` / `.opt-ohlcv-modal` with a solid system dark theme modal panel (`bg-panel border border-border-default rounded-xl shadow-[var(--shadow-modal)]`) layered above the configuration editor at `z-[1100]` with `bg-backdrop p-3.5 sm:p-5`. Fixed translucent cards (`bg-white/[0.018]`) and missing backgrounds that caused the underlying editor inputs and bounds table to bleed through.
- **Card Hierarchy, Typography & Status Badging**: Rebuilt the preflight modal structure with structured elevated cards (`bg-surface-deep/50 border-border-default/80`):
  - **Header**: Compact header with icon box (`PhDatabase`), bold title, hint, and Phosphor close button (`PhX`).
  - **Summary**: Prominent overall status badge with semantic color fills, clear headline and details, and monospace tabular readiness pills (`counts`).
  - **Request & Universe**: Structured 2-column grid organizing exchange, timeframes, and universe parameters with clean typography.
  - **Coin Samples**: Responsive 2-column grid of coin sample articles with monospace symbol names and trading side badges (`[long/short]`).
  - **Preload Job**: Dedicated background job panel with pulsating running indicators, PID / start / finish metadata tags, and an enclosed monospace log output viewer (`bg-page text-primary`).
  - **Footer Controls**: Standardized action buttons with Phosphor icons (`PhArrowClockwise`, `PhStop`, `PhDownloadSimple`) for refreshing readiness and launching/stopping OHLCV preloads.

## PBv7/PBv8 Optimize — Bounds Filter Buttons Color & Contrast Polish (优化/配置/边界)

- **Semantic Color Scheme & High-Contrast Typography (`ConfigEditorModal.vue`)**: Optimized the color schemes and font foreground styling for the four category filter buttons in the Parameter Bounds tab:
  - **All (全部)**: Replaced the dark `#081216` (`text-accent-contrast`) text that blended into the dark background with high-contrast ice-blue styling (`border-accent/45 bg-accent/15 text-accent-soft font-semibold shadow-2xs`).
  - **Long (多头)**: Corrected the missing Tailwind token (`info`) with standard financial trading green semantic styling (`border-success/45 bg-success/15 text-success-soft font-semibold shadow-2xs`), ensuring Long is immediately identifiable.
  - **Short (空头)**: Aligned with standard bearish trading conventions using coral-red styling (`border-danger/45 bg-danger/15 text-danger-soft font-semibold shadow-2xs`).
  - **Fixed (已固定)**: Styled locked/pinned parameters with distinct warm amber styling (`border-warning/45 bg-warning/15 text-warning-soft font-semibold shadow-2xs`).
  - **Inactive & Badge States**: Added default subtle borders (`border-border-default/40`) to inactive buttons to eliminate 1px layout jumping when toggled, interactive category-tinted hover feedback, and refined monospace tabular number badges (`font-mono tabular-nums`) that inherit the active category's soft foreground color.

## PBv8 Strategy Explorer — Segment Tab Corner Outline Fix (策略浏览器/分析)

- **Segment Tabs Active Highlighting & Border Radius Alignment (`ParamTuning.vue` & `v7_strategy_explorer.html`)**: Fixed a visual defect on the Strategy Explorer analysis page where the active first segment tab ("入场网格" / Entry Grid) was missing its top-left and bottom-left blue outlines. Added matching inner border-radius (`first:rounded-l-[7px] last:rounded-r-[7px]`) to the segment buttons and replaced the outer-clipping `outline-1 outline-accent/75 -outline-offset-1` with `shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb)/0.75)]`, ensuring the active highlight curves seamlessly along the container's rounded corner without being cut off by `overflow: hidden`.

## PBv7/PBv8 Optimize — Configuration Editor UI/UE Modernization (编辑优化)

- **Compact Header & Segmented Pill Tab Bar (`ConfigEditorModal.vue`)**: Compressed the modal header from ~72px to ~48px (`py-2.5`) aligning the icon, title, version badge, and hint on a single row to save vertical space. Replaced the flat text tab strip with a modern segmented pill bar (`h-[34px]`, 13.5px medium typography, `bg-surface-deep/50` pill track, active tab highlighted with `bg-accent/16 border-accent/35 text-accent-soft shadow-xs`), saving ~38px of vertical screen real estate.
- **Identity Section 12-Column Responsive Grid & Quick Date Picker (`ConfigEditorModal.vue`)**: Upgraded the "配置标识" (Identity & Backtest Defaults) section into a balanced 12-column responsive layout (`sm:grid-cols-12 gap-3.5`): allocated 5 columns to Config Name (`local.name`), 4 columns to Backtest Start Date with inline `1st` / `All` OHLCV historical date lookups, and 3 columns to End Date with a new instant `Now` (今天) button (`@click="setText('backtest', 'end_date', new Date().toISOString().slice(0, 10))"`). This completely eliminates right-side blank space, perfectly balances the date pickers across standard desktop viewports, and makes populating test windows immediate.
- **Modal-Wide Typography & Font Scale Enlargement**: Comprehensively upgraded the font size and typography scale across the entire Configuration Editor to provide superior contrast, legibility, and visual comfort:
  - Header: Title elevated to `text-[15px] font-bold tracking-tight text-primary`, description hint to `text-[13px] text-secondary/80`, validation button to `h-8.5 text-[13px] font-medium`.
  - Tabs: Elevated to `text-[13.5px] font-medium h-[34px] px-3.5`.
  - Section Titles & Headings: Upgraded `h3` to `text-[15px] font-semibold text-primary` with a prominent 3.5px accent bar (`h3::before`), section description paragraphs to `text-[13px] text-secondary`.
  - Field Labels: Elevated from 11px/12.5px to `text-[13px] ~ text-[13.5px] font-medium text-primary`.
  - Inputs & Select Triggers: Standardized across all tabs to 36px (`h-9 text-[13.5px]`) with tabular numerals (`tabular-nums`) for numbers/dates and `text-[13px] font-mono` for code/JSON/coin symbols/paths.
  - Parameter Bounds Tab: Search input to `h-8.5 text-[13px]`, add input to `h-8.5 text-[13px] font-mono`, filter pills to `text-[12.5px]`, parameter table rows to `text-[13px] font-mono font-medium`, range/step inputs to `h-8 text-[13px] font-mono tabular-nums`.
  - Optimizer, Objectives & Runtime Tabs: All inputs and select triggers upgraded to `h-9 text-[13.5px]` (sub-rows to `h-7.5 text-xs`), card headers to `text-[14.5px] font-bold`, override JSON textareas to `text-[13px] font-mono leading-relaxed`.
  - Raw JSON Tab: Title to `text-[14.5px] font-bold text-primary`, action buttons to `h-8.5 text-[13px]`, elastic code textarea to `text-[13px] font-mono leading-relaxed`.
  - Footer Action Bar: Cancel, Revert, and Save buttons upgraded to `h-9.5 min-w-[104px] text-[13.5px] font-medium`.
- **General Tab Balanced Grid & Interactive Exchange Matrix (`ConfigEditorModal.vue`)**: Organized the General tab into 4 structured, elevated cards (`Identity & Backtest Defaults`, `Backtest Timeframe & Data Source`, `Markets & Filters`, `Coin Lists`). Redesigned the *Markets & Filters* section with a symmetrical 4-column grid for metrics and tags (`market_cap`, `vol_mcap`, `minimum_coin_age_days`, `tags`), balanced 2-column binary toggle cards (`only_cpt`, `notices_ignore`), and a full-width interactive exchange matrix card. Provided built-in fallback supported exchange options (`binance`, `bitget`, `bybit`, `gateio`, `hyperliquid`, `kucoin`, `okx`) so the interactive checkbox chips, live selection count (`{selected} / {total}`), and quick "Select All" / "Deselect All" action buttons are always available and never disappear even if the backend returns an empty exchange list. Below the chips, an inline CSV input is retained for quick manual entry or pasting. Also updated `coin_sources` to cleanly span `col-span-full`.
- **Scoring & Constraint Limits Redesign (`ScoringLimitsEditor.vue`)**: Replaced the rigid multi-column grid that caused delete buttons and extra fields to wrap awkwardly into huge red rectangular blocks with an elegant **Rule Card** architecture. Each scoring objective and constraint limit is now housed in its own card with a primary target row (metric selector, goal/operator, threshold, top-right delete action) and a secondary configuration row (scenario selector, statistical aggregators), featuring Phosphor icons (`PhTarget`, `PhSliders`, `PhPlus`, `PhX`) and full dark theme alignment.
- **Bounds Search & Category Filtering (`ConfigEditorModal.vue`)**: Added a search bar with real-time parameter filtering and category filter pills (`All`, `Long`, `Short`, `Fixed`) with live parameter counts. Parameter keys now clearly separate module prefixes (e.g. `long.forager.` / `short.`) from parameter names to avoid truncation, accompanied by a clean sticky table header (`Parameter`, `Bounds [Min → Max]`, `Step`, `Fixed`, `Action`) and quick parameter add autocomplete datalist.
- **Bot Strategy JSON Editor Framing (`BotJsonEditor.vue`)**: Integrated a modern code toolbar featuring line count badges, a one-click Prettify JSON formatting action, a Copy JSON button with visual feedback, and a neutralized parameter legend, enclosed in a refined dark-theme code container with primary cursor carets and readable `13px font-mono` code canvas.
- **Long / Short Bot Core Settings Cards (`ConfigEditorModal.vue`)**: Enclosed the floating top-3 bot parameters (`total_wallet_exposure_limit`, `n_positions`, `hsl_enabled`) inside structured Core Risk & Positions setting cards with side badges (`Long Side` / `Short Side`) and aligned form controls.
- **Raw JSON Full-Height Code Editor Toolbar & Sync (`ConfigEditorModal.vue`)**: Upgraded the "原始 JSON" tab from a cramped textarea with awkward bottom whitespace into a full-height code editor container. Added a top action toolbar featuring a code icon, line count badge (`{count} lines`), file size indicator, one-click copy button (`copyRawJson`) with clipboard feedback, and a highlighted Prettify JSON button (`PhSparkle`). Ensured `.opt-editor-content` uses flex-column stretching so the elastic code editor textarea (`flex-1 min-h-0 resize-none`) fills 100% of the modal's available vertical space down to the footer, accompanied by a footer tip explaining real-time parsing and bidirectional sync across all visual tabs.
- **Runtime Tab Structured 3-Card Layout & Expanded Overrides (`ConfigEditorModal.vue`)**: Reorganized the Runtime tab from scattered top controls into 3 elevated, balanced cards:
  1. *Fine-Tune & Polish Bounds (v8)*: Clean 3-column grid organizing `fine_tune_params`, `polish_percentage (%)`, and `polish_bounds_mode`.
  2. *Runtime HSL Settings*: 2-column balanced Long and Short side cards with toggle controls and drawdown threshold inputs.
  3. *Runtime & Coin Overrides*: Side-by-side elastic JSON textareas (`flex-1 min-h-[180px]`) that fully utilize the dialog's lower area for editing global and per-coin overrides.
- **Suite Tab Hero Showcase & Feature Guide (`SuiteEditor.vue`)**: Transformed the disabled suite view from an empty single-line dashed box with massive blank space into a rich, modern Hero Showcase & Feature Guide Card. Highlights multi-scenario capabilities across 3 structured feature cards (Exchange Matrix Comparison, Time Windows & Holdout Validation, Sensitivity & Aggregated Decision Scoring) with Phosphor icons (`PhStack`, `PhSquaresFour`, `PhChartLineUp`, `PhSparkle`) and a direct "+ Enable Suite Mode" action button.
- **Modal Height Stabilization & Scroll Reset (`ConfigEditorModal.vue`)**: Eliminated severe vertical jumping / shaking when switching between short and tall tabs (such as between "Suite" and "Short Bot") by locking the modal container to a predictable, fixed viewport height (`h-[min(88vh,860px)] h-[min(88dvh,860px)]`) and setting the content container to `flex-1 min-h-0 overflow-y-auto`. Added automatic scroll position reset (`scrollTop = 0`) on tab change along with a subtle 140ms tab-panel fade-in transition (`tab-fade-in`), ensuring the header, tabs, and footer remain completely stable and stationary during navigation.
- **Select Dropdown Layering Fix (`SelectContent.vue` & `tailwind.css`)**: Adjusted the design token `--z-dropdown` from `300` to `1500` and added defensive `z-[var(--z-dropdown,1500)]` fallback in `SelectContent.vue`. This resolves the issue where portal-teleported `<SelectContent>` listboxes opened inside modal overlays (`z-[1000]`) were stacked behind the modal dialog, restoring full interactivity to all dropdown selectors across Scoring & Limits, Optimizer Settings, and Runtime Overrides.
- **Full Localization & Test Suite Validation**: Added matching bilingual keys in `frontend/i18n/{en,zh}.json` including `v7optimize.nowDate` and `v7optimize.todayDate`, 100% verified with `pytest tests/test_i18n.py`, full backend pytest suite, all `src/pages/v7_optimize/` frontend test suites (89 Vitest tests passed), and full production bundling (`pnpm build`).


## Profit Sweep — Unified Dropdown Theme Alignment (系统 / 利润划转)

- **Themed Select Dropdowns**: Replaced native HTML `<select>` dropdown controls in the Profit Sweep Vue 3 page (`frontend/src/pages/profit_sweep/App.vue`) with the shared dark-theme UI components (`SelectRoot`, `SelectTrigger`, `SelectContent`, `SelectItem`), harmonizing the dropdown styling, focus states, and popover menus with the PBGui dark palette.
- **Form UI Component Modernization**: Standardized form labels and booleans with `@/shared/components/ui/label` (`Label`) and `@/shared/components/ui/checkbox` (`Checkbox`), ensuring uniform height, borders, and interactive feedback across all tabs (Policy, Schedule, Exchange / Vault).
- **Schema Enum Completeness**: Added `vault_safety_reserve_mode` and `vault_conditional_cost_policy` to `/api/profit-sweep/schema` `options` so Vault reserve mode dropdown options are populated dynamically from the backend schema.
- **Test Coverage**: Added comprehensive Vitest tests in `frontend/src/pages/profit_sweep/App.test.ts` verifying SelectRoot option listing and selection flows.

## PBv7/PBv8 Optimize Workbench — Visual Hierarchy, Empty States & UX Polish

- **Header & Layout Space Optimization**: Removed the redundant green `show-ok` banner from `ConnectionNotice` in normal operation to reclaim vertical screen space; tightened toolbar margins and panel headers for improved table data density.
- **Configs Panel**: Integrated the unified `EmptyState` component with a direct "+ New Config" creation shortcut; applied tabular numbers (`tabular-nums`) to count, date range, and modified timestamps for clean visual alignment.
- **Queue Panel Progress & Zero State**: Added visual progress bars with live completion percentage, evaluations counter, and evaluation scan status; integrated `EmptyState` with a navigation action to return to the Configs panel when the queue is empty.
- **Results Panel Details & Empty State**: Integrated `EmptyState` with a shortcut to view the Queue when no results are available; refined typography with font-mono path truncation, strategy badges, and tabular numerical statistics.
- **Paretos Panel Direct Switcher & Zero State**: Added an active result set dropdown selector directly inside the Pareto panel header so users can switch between result sets without having to switch tabs back and forth; integrated `EmptyState` with a quick jump to the Results panel; formatted all dynamic metric cells with tabular numbers.
- **Bilingual i18n & Complete Test Coverage**: Added matching English and Simplified Chinese dictionary entries in `frontend/i18n/{en,zh}.json`, verified 100% dictionary parity via `pytest tests/test_i18n.py`, 87 Vitest unit tests in `src/pages/v7_optimize`, and full production build bundling (`pnpm build`).

## Help & Documentation — Unified Direct Help Center Navigation

- **Unified Navigation to Native Help Center**: Standardized all top header/navbar guide buttons (`#pbgui-guide-btn`, `WorkspaceHeader` `PhQuestion` icon buttons) across all Vue 3 pages and legacy templates to navigate directly to the modern native Help Center (`/api/help/main_page?topic=<topic_name>`), completely replacing legacy modal overlay popups (`#help-ovl`, `shared_help_overlay.js`).
- **Contextual Topic Mapping**: Wired version-aware and section-aware topic routing across PBv7/PBv8 Run (`34_pbv7_run` / `44_pbv8_run`), PBv7/PBv8 Backtest (`35_pbv7_backtest` / `42_pbv8_backtest`), PBv7/PBv8 Optimize (`36_pbv7_optimize` / `43_pbv8_optimize`), Pareto Explorer (`37_pareto_explorer`), Strategy Explorer (`00_strategy_explorer_help`), API Keys (`20_api_keys`), Coin Data (`27_coin_data`), Dashboard (`33_dashboard`), Logging (`31_logging`), Services Monitor (`services_overview` / `pbdata` / `pbapiserver`), Scenario Generator (`43_pbv8_optimize#scenario-generator`), Welcome (`19_welcome`), and Cluster Sync (`39_cluster_sync`).
- **Defensive Backstop & Shared Navigation**: Exported `openHelpCenter(topic, anchor)` helper in `@/shared/navigation` and redirected legacy fallback calls in `frontend/pbgui_nav.js` and `frontend/js/shared_help_overlay.js` directly to `/api/help/main_page`.
- **Test Suite Alignment**: Updated unit test expectations across `dashboard_main`, `market_data`, and `services_monitor` suites to verify help opener registration and contextual keyword tracking.

## Frontend — Favicon Theme Alignment

- **Redesigned SVG Favicon**: Replaced the legacy navy 3-bar icon in `frontend/favicon.svg` with a modern SVG favicon aligned with the Vue 3 graphite dark theme (`#161616` / `#191e26`), precision border, subtle ambient glow (`rgba(143, 207, 242, 0.08)`), and official `PB` brand mark vector geometry matching the left sidebar workbench rail (`WorkbenchRail.vue`).
- **Brand & Theme Consistency**: Vectorized `PB` monogram paths using the ice-blue accent gradient (`#c8ecff` → `#8fcff2`), ensuring crisp integer-aligned rendering across 16px, 24px, 32px, and 64px tab and bookmark displays without relying on external fonts.
- **Legacy Fallback Synchronization**: Updated the legacy navigation bar and About dialog logo fallback color literals in `frontend/pbgui_nav.js` to match the Vue 3 palette tokens (`--bg-elevated`, `--accent-deep`, `--accent-soft`, `--accent`, `--text-primary`).

## Help & Tutorials - Native Documentation Workspace Redesign (Plan A)

- **Native Docs Workspace**: Transformed `/api/help/main_page` (`frontend/src/pages/help/App.vue`) from a floating modal popup with backdrop blur and drag/resize handles into a modern, native full-screen 2-column documentation center seamlessly embedded in `AppShell`.
- **Sidebar Navigation & Instant Filter**: Optimized `HelpToc.vue` into a full-height sidebar with sticky quick filter search, active topic indicator, and scrollable catalog list.
- **Header Actions & Global Search**: Moved in-topic match navigation, search match counters, global search across all documentation, and EN / DE / 中文 language switch pills into the standard `AppShell` top header actions.
- **Topic Pagination & Reader Typography**: Added bottom previous/next topic navigation cards (`#help-pager`) for smooth reading flow, enhanced markdown typography and code block styling with dark-theme tokens.
- **CJK Text Wrapping & Layout Fix**: Fixed a Chromium layout issue where `text-wrap: balance` on headings in intrinsic flex containers caused CJK text to collapse into a single vertical column; enforced `w-full min-w-0`, `text-wrap: wrap`, and `word-break: break-word` on content containers.
- **i18n & Test Coverage**: Added matching `misc.help.prevTopic`, `misc.help.nextTopic`, `misc.help.toc` translation keys to English and Chinese dictionaries; updated unit test suite in `App.test.ts` to cover workspace rendering and pager transitions.

## Workbench Rail - Sidebar Visual Polish & Interaction Refinement

- **Unified Corner Radii**: Aligned expanded and collapsed item border-radius to a consistent 8px (`--radius-lg`), establishing visual harmony across rail states.
- **Accordion Tree Guide Lines**: Added subtle vertical tree reference lines (`rgba(255, 255, 255, 0.08)`) and active indicator marks to page sections (`.workbench-rail__subitems`), giving subitems clear parent-child visual grounding.
- **Active Pill Indicator**: Replaced the 3px solid border-left on active menu items with an embedded floating capsule pill indicator (`::before`), eliminating harsh corner clipping on rounded items.
- **Smoothed Hover Feedback**: Removed the jarring `translateY(-1px)` jump on collapsed icon hover, replacing it with smooth color and subtle border transitions for reliable, flicker-free interaction.
- **Scrollbar & Group Polish**: Enhanced navigation groups scrollbar with subtle hover reveal and right-side breathing room to prevent cutting into the sidebar right border; refined section label typography (11px, bold, tracking).
- **AI Drawer Button Polish**: Added subtle border glow, balanced padding, and a lightweight `Ctrl J` keyboard hint badge.

## Top Navigation Bar - Unified Single-Line Redesign & Alignment

- **Single-Line Height Alignment**: Standardized `.workspace-header` across all Vue 3 pages to a fixed 64px (`--header-height: 64px`) matching the left workbench rail brand height (`.workbench-rail__brand`), creating a continuous horizontal bottom border across the entire viewport.
- **Removed Multi-Line Description Dynamic Expansion**: Deprecated `:page-description` and removed `.workspace-header__description` dynamic expansion rules, eliminating vertical jumping and height differences across page switches.
- **Redesigned Status Indicators**: Modernized `StatusStrip.vue` into a compact 28px rounded pill (`pbgui-status-strip`) with glowing status dots, subtle semantic tone backgrounds (neutral, success, warning, danger), and direct business status display (e.g., "OK", "Running", "Loading...").
- **Clean Page Header States**: Polished status and header action visibility across all pages (`db_tools`, `api_keys_editor`, `profit_sweep`, `vps_manager`, `dashboard_main`, `cluster_sync`, `coin_data`, `services_monitor`, `balance_calc`, `welcome`, `vps_monitor`, `logging_monitor`, `v7_pareto_explorer`, `v7_strategy_explorer`), removing duplicate redundant actions and keeping the navbar clean and uncluttered.
- **Test Coverage**: Updated unit tests in `WorkspaceHeader.test.ts`, `AppShell.test.ts`, and individual page test suites to verify single-line layout and status values. All 351 frontend test suites (4,418 unit tests) and backend pytest suite (1,699 tests) pass cleanly.

## API Keys Management - UI/UX Polish (P0 & P1)

- **P0: Unified Single-Line Toolbar**: Merged the fragmented top action bar and secondary search/metadata bar into a single streamlined, high-efficiency toolbar. Fixed the search box width to 320px (`w-80`), grouped search with the count badge (`#sb-count`) on the left, and aligned the metadata pill with the primary action button on the right at a uniform 36px (`h-9`) height with balanced breathing room.
- **P0: Zero-State Experience & Visual Elevation**: Replaced the plain table text with a modern zero-state card featuring an animated glowing key icon, balanced radial-gradient surface elevation, structured guide copy without orphan words, a prominent CTA button, a local AES-256 encryption security badge with `PhShieldCheck` icon, and quick ecosystem badges for supported exchanges.
- **P0: Fix CJK Text Vertical Collapse**: Fixed a Chromium layout issue where `text-wrap: pretty` in `tailwind.css` caused CJK characters without ASCII whitespace to collapse into a single vertical column. Replaced with `text-wrap: wrap` and explicit container width constraints.
- **P1: Surface Elevation & Visual Depth**: Enhanced the table container with subtle borders (`border-border-default`), card elevation (`shadow-md`), balanced padding, and interactive hover highlights.
- **i18n**: Added matching bilingual dictionary entries (`misc.apikeys.emptyTitle`, `emptyDesc`, `emptyAddUser`, `securityHint`, `supportedExchanges`) in `frontend/i18n/{en,zh}.json` and full Vitest component test coverage.

## Vue3 Workspace Header - Breadcrumb & Sidebar Header Height Alignment

- Unified `.workspace-header` height with the left sidebar header (`.workbench-rail__brand`) to a standardized 64px (`--header-height: 64px`), replacing the previous 112px bottom-aligned header.
- Centered breadcrumbs vertically alongside the status indicator with matching bottom border lines across the entire viewport.
- Adjusted the current page breadcrumb title font size to 19px (`--text-section`) for visual weight balance with the PBGui brand title, while retaining adaptive multi-line height for pages with descriptions.
- Updated main page body viewport height constraints across `api_keys_editor`, `ai_chat`, `balance_calc`, `coin_data`, and `db_tools` to `h-[calc(100dvh-64px)]`.

## Merge origin/main v2.01 - Vue3 Optimize and VPS Parity

- Merged the upstream v2.01 release, including PB8 scenario templates, Sweep Cycles evaluation, OHLCV start-date jobs, Pareto holdout drafts, AI preview support, and the VPS Manager runtime-version correction.
- Adapted the PB8 Optimize workflow to Vue3 with deterministic Scenario Generator preview/apply, Sweep presets, `1st`/`All` OHLCV date lookup and cancellation, Pareto Holdout queue drafts, version-specific help links, and matching English/Simplified Chinese UI copy.
- Added shared Vue Suite reducer/provenance parity (`reducer` with `median`/`std` for PB8, `aggregate` for PB7), retained the legacy fallback fixes, and synchronized the English, German, and Simplified Chinese help guides.

## Profit Sweep - i18n Adaptation (System / 利润划转)

- Completed the English/Simplified Chinese i18n adaptation of the Vue3 Profit Sweep page (`frontend/src/pages/profit_sweep/App.vue`): policy/schedule/vault field labels now resolve through `profitSweep.field.*.label` translations (with the title-case config fallback for options, states, and reasons), the Evaluate preview grid uses translated labels, the Vault/Standard account type and the ` / Vault` suffix are translated, and server error messages pass through the shared `serverMsg()` bridge.
- Added the `profitSweep.*` dictionary entries (field metadata labels, account types, preview labels, and messages) to `frontend/i18n/{en,zh}.json` with identical key sets; existing key values are unchanged.

## PBv7/PBv8 Strategy Explorer - Raw Config Editor & Layout Polish

- Fixed the CJK text wrapping bug in the Raw Config panel that caused vertical column collapse and excessive empty header space.
- Replaced the bulky dual-bar header with a unified modern IDE toolbar featuring real-time JSON validation/recalculation status, Format JSON, and Reset Config actions.
- Enhanced editor UX with `Tab` key 4-space indentation support inside the editable code area and live line/character count telemetry in the footer.
- Updated bilingual translations (`frontend/i18n/{en,zh}.json`) and ensured complete test coverage across Vitest and pytest i18n suites.

## PBv7/PBv8 Strategy Explorer - Raw Config Workbench

- Replaced the compact legacy Raw Config panel with a dedicated responsive JSON workbench featuring clearer hierarchy, an adjustable editor viewport and font size, copy/expand controls, accessible textbox semantics, and persistent validation/recalculation status while preserving the existing debounced live-update behavior. Removed the now-unused legacy JSON panel script from the Vue page entry, added focused rendering coverage, and documented the workflow in the English, German, and Simplified Chinese Strategy Explorer guides.

## Vue3 Navigation - Swagger API Docs Entry

- Added an API Docs (Swagger) entry to the Vue3 workbench rail under the Information group. It opens the backend Swagger UI (`/docs`) in a new tab, with `external`/`target="_blank"` support added to the shared rail item model, matching EN/ZH labels, and a rendering regression check for the new-tab behavior.

## Help & Tutorials - Simplified Chinese Guides

- Added a full Simplified Chinese guide set: all 30 general guides now have `docs/help_zh/` peers and all 5 Strategy Explorer tutorials have `docs/strategy_explorer_zh/` peers, with filenames matching the English set so deep links and keyword selection keep working.
- The help endpoints (`/api/help/index`, `/api/help/content`, `/api/docs/index`, `/api/docs/content`) now resolve `lang=ZH` to the Chinese directories via a shared `_help_lang_folder` helper; unknown language codes still fall back to English and the existing bare-`*.md` path-traversal guards are unchanged.
- Added a 中文 pill to every help language switcher — the Vue Help page (`help-lang-zh`), the legacy `help.html` fallback, the shared overlay (`pbgui-shared-help-lang-zh`, served to all pages via `shared_help_overlay.js?v=8`), and the four still-active inline overlays (v7 edit, VPS monitor, API keys editor, Coin Data).
- First-time visitors (no stored `help-lang`) now default the help content language to the browser language (`zh*` → ZH), matching the GUI i18n auto-select; manual EN/DE/ZH choices keep persisting in `localStorage['help-lang']`.
- Coverage tests now enforce EN/DE/ZH topic parity (`tests/test_help_coverage.py`), the Vue page tests cover ZH switching and the browser-language default, and a new `tests/test_help_docs_zh.py` verifies all four ZH endpoints end to end.

## AI Chat - Vue3 Theme Alignment

- Unified the AI Chat page surfaces, provider cards, conversation list, message bubbles, proposal previews, toolbar, and composer with the shared Vue3 graphite palette, Space Grotesk typography, semantic colors, spacing, borders, radius, and elevation tokens without changing chat behavior or approval flows. Applied the same visual language to the legacy side drawer opened by the lower-left AI button, including its controls, context chips, history, proposal review, responsive layout, and focus states.
- Enabled the Information / AI Chat navigation item now that its Vue3 page is available, while retaining the shared disabled-item behavior for unavailable pages.
- Added English/Chinese Drawer UI translations, improved the toolbar and composer proportions, and compiled the shared Drawer stylesheet through the Tailwind CSS v4.3 component layer while keeping the legacy standalone fallback.
- Replaced the Vue-page dynamic Drawer DOM loader with a statically mounted `AiDrawer.vue` and shared `useAiDrawer` state, preserving preference-based auto-open, width persistence, context toggling, conversation actions, and the legacy standalone compatibility path.
- Updated the Drawer Full-page action to persist the closed state before navigating, and disabled preference-based Drawer auto-open on the full AI Chat page so the destination is not duplicated.

## Archive credential response hardening

- Stop returning stored archive access tokens from GET /archives/settings; archive Git push and history compaction now resolve omitted tokens server-side, while the Vue setup form preserves configured credentials unless a new token is explicitly supplied.

## Merge origin/main - Vue3 Backtest Archive Parity

- Merged the four remote release commits through v2.0.4, including the upstream release notification, VPS monitor, archive batching, restart serial, and backtest hardening changes. Adapted the new batch archive export, results-panel archive refresh, and pending-archive Git Push action to the Vue3 PBv7/PBv8 Backtest workbench while keeping the legacy page behavior in sync.

## PBv7/PBv8 Optimize - Pareto Dash Modal Fix

- Restored the Pareto Dash modal frame and flexible iframe content sizing so the dashboard opens at a usable viewport size instead of rendering as a clipped, intrinsic-size popup. Added responsive bounds, modal elevation, title truncation, and a focused rendering regression check without changing the dashboard launch or session lifecycle.

## PBv8 Optimize - Configuration Editor UI Refresh

- Unified the Optimize connection banner with the shared connection notice so the persistent Connected state uses the same indicator, semantic colors, and transition behavior as other workbenches.
- Reorganized the new/edit configuration dialog into a clearer responsive layout with a stronger header, labeled section surfaces, grouped data and market controls, improved tab navigation, and stable mobile-friendly footer actions without changing configuration behavior or save flows.

## PBv7/PBv8 Backtest - Unified Row Actions

- Unified configuration, result, and queue row actions across the shared PBv7/PBv8 Backtest workbench with consistent compact controls, spacing, borders, focus treatment, semantic tones, and pressed-state accessibility while preserving every existing action and workflow.

## PBv8 Backtest - Queue and Settings Workbench

- Refined the shared PBv7/PBv8 Backtest Queue with themed job-status summaries, selected-row feedback, a sticky responsive table, semantic row actions, keyboard selection, and a structured empty state. Reorganized the Settings dialog into queue-concurrency, automatic-behavior, and protected-cache-cleanup sections with consistent graphite surfaces, typography, focus treatment, responsive controls, and unchanged queue/runtime settings behavior.

## Cluster Sync - Cluster Nodes Workbench

- Refined the Cluster Nodes view with a themed membership header, operational summary cards, a sticky horizontally scrollable node table, explicit local-node labeling, clearer role/sync-mode/SSH presentation, and grouped maintenance actions while preserving all existing sync, join, repair, settings, and removal behavior.

## API Keys - HL Warning Configuration Layout

- Reorganized the Hyperliquid Telegram warning settings into separate current-status and warning-window cards with shared graphite surfaces, semantic configured/unconfigured states, a labeled bounded input, daily-reminder guidance, responsive stacking, and save-in-progress feedback without changing the underlying configuration API or fallback behavior.

## API Keys - TradFi Workbench Refresh

- Reorganized the TradFi provider page into themed recent-backtest, vault-profile, and profile-configuration sections with consistent graphite surfaces, clearer status badges, grouped credential controls, stable action hierarchy, responsive layouts, and keyboard-selectable profile rows while preserving all vault, reveal, projection, test, and save behavior.

## Coin Data - Matched Symbols UI Refresh

- Refined the matched-symbols workbench with clearer page context, grouped refresh actions, a labeled filter surface, stronger table hierarchy, aligned numeric columns, visible sort affordances, keyboard-friendly sortable headers, and English/Simplified Chinese copy without changing data or refresh behavior. Unified its workspace, panels, headers, inputs, borders, highlights, warnings, dropdowns, and empty states with the shared graphite theme tokens instead of page-specific color effects.
- Aligned the CMC Unmatched view with the same themed panel header, content surface, borders, selection accent, and compact table treatment used by Matched Symbols while preserving its data and navigation behavior.

## API Keys - Discard Changes Dialog Theme

- Aligned the API Keys unsaved-changes confirmation with the current Precision Terminal theme using the shared graphite surfaces, borders, typography, accent buttons, focus treatment, responsive mobile actions, and reduced-motion-aware entry feedback without changing its keyboard or confirmation behavior.

## API Keys - User Editor Layout Refresh

- Reorganized the exchange-user create/edit form into separate identity and credential surfaces, moved connection testing and its result beside the credential fields, clarified the optional advanced settings disclosure, and anchored save/delete actions in a stable responsive footer without changing credential handling or API behavior.

## PBv7/PBv8 Backtest - Results Workbench Refresh

- Refined the Backtest Results view with a contained results surface, clearer count and selection feedback, grouped version/config/search filters, a taller resizable data viewport, full-row click and drag selection, sticky row actions, aligned numeric metrics, and responsive horizontal scrolling while preserving sorting, chart actions, comparison, conversion, and bulk workflows.

## PBv8 Optimize - Unified Workbench Layout

- Refined the PBv8 Optimize configuration, queue, results, and Pareto views with a shared panel heading, compact context controls, clearer count states, stronger table surfaces, improved row spacing, and responsive scrolling while preserving existing actions, selection, sorting, and data flows.

## API Keys - User List Layout Refresh

- Refined the API Keys user list with a clearer metadata strip, larger search target, sticky table headers, stronger row hover and focus affordances, exchange and credential chips, compact action grouping, and responsive horizontal table scrolling without changing filtering, sorting, or credential behavior.

## API Keys — User List UI Cleanup

- Tightened the Users view search control to a compact 280px field with an in-field clear action, unified exchange badges on the shared accent palette, and reduced sortable-header noise to one active direction indicator without changing filtering or sorting behavior.

## Market Data — Vue Job Monitor Embeds

- Switched the OHLCV Integrity, Best 1m, and Copy Data queue iframes from the static legacy monitor to the existing Vue 3 `/api/jobs/main_page` entry while preserving embed mode, exchange/job-type filters, serial cache busting, queue actions, logs, details, and confirmations.
- Made the Jobs Monitor route Vue-only, removed the duplicate `frontend/jobs_monitor.html` and `frontend/css/app.css` implementations, migrated their security/action contracts to the Vue source, and retained the shared Precision Terminal parent elevation.

## Frontend — Dashboard Editor Style Audit Review Fix

- Expanded the Dashboard Editor legacy-literal contract across all active Vue, widget-style, formatter, Plotly, Lightweight Charts, and grid metadata sources, with tested allowlists for metadata-only colors, synthetic fixtures, and the zero-alpha income legend.

## Frontend — Shared RGB Companion Review Fix

- Added CSS-to-`PRECISION_PALETTE` synchronization coverage for all defined accent, semantic, surface, and text RGB companions, including optional checks for future warning-deep and text-channel declarations without changing production behavior.

## Frontend — Precision Terminal 2.0 Production Migration

- Migrated the production Vue workbench to neutral graphite surfaces with distinct inset inputs, silver text, ice-blue interaction and telemetry signals, calm semantic ramps, synchronized static chart palettes, and neutral shared shell elevation effects.
- Applied the production visual contract across PBv7/PBv8 Backtest, Coin Data, Services Monitor, Market Data, Optimize, Strategy Explorer, Welcome, Dashboard Manager, and the Dashboard Editor iframe/standalone entry while preserving existing workflows, chart behavior, polling, navigation, and iframe messaging. This migration adds no external assets or hosted dependencies.
- The standalone four-direction visual direction lab remains a separate related design artifact for comparison and is not production runtime behavior.

## Frontend — Task 5 Coin Data Contract Fix

- Added direct source-contract coverage for the Coin Data sort pill, quotes pill, and empty-state icon accent backgrounds without changing production behavior or layout.

## Frontend — Task 7 Optimize Warning Review Fix

- Included the OHLCV preflight modal in the Optimize warning-style contract and replaced its remaining active amber warning text with the shared Warning soft token without changing modal behavior.

## Frontend - Task 2 Backdrop Token Fix

- Replaced the remaining floating mobile rail backdrop literals with the shared `--color-backdrop` token and extended the visual rejection contract to prevent their return.

## Frontend — Visual Direction Comparison Prototype

- Added a standalone, production-isolated PBGui visual direction lab that presents Precision Terminal 2.0, Dark Finance Luxury, Modern Glass Terminal, and Cyber Operations against the same synthetic trading dashboard content. Refined Precision Terminal 2.0 with a brighter neutral-graphite surface ladder, silver text, ice-blue signals, and calmer semantic colors. The responsive prototype supports mouse, number-key, and arrow-key switching, visible focus states, and reduced-motion preferences without loading external assets or accessing runtime data.

## Market Data — OHLCV Integrity Workbench Refresh

- Redesigned the OHLCV Integrity page with a clearer data-quality hero, exchange context chip, grouped scan actions, live-job guidance, and a stronger catalog-health snapshot while preserving existing scan, repair, archive, table, modal, and job-monitor behavior.
- Refined integrity summary cards and table containers with the shared deep blue-grey palette, intentional elevation, compact scrollbars, hover feedback, responsive stacking, and a restrained accent rail to replace the previous flat/empty visual hierarchy.
- Restored the shared deep blue-grey theme inside the legacy job-monitor iframe by supplying the retired surface, text, border, accent, and status tokens, and added a matching themed boundary around the integrity monitor.
- Completed the embedded job-monitor restyle by removing the transparent iframe canvas, defining dark surfaces for tabs, content, empty states, job cards, progress bars, and dialogs, and refreshing the static stylesheet cache key.

## Merge origin/main — Vue3 Migration Parity

- Merged the four remote release commits through v1.99.8, preserving the existing Vue3 workbench changes and syncing V7/V8 migration drafts, AI queue proposals, and result conversion handoffs into the Vue3 pages.

## Frontend — Unified Vue Page Spacing

- Unified Vue 3 page edges around a shared responsive contract: 24px on desktop, 20px on medium viewports, and 16px on mobile. Standardized top-level section, component, and compact control spacing at 20px, 16px, and 8px while preserving fixed-height workbench scroll chains and compact table, button, badge, modal, and embedded-fragment internals.

## Coin Data — Precision Data Workbench Palette

- Unified Coin Data around a deeper blue-grey control/data hierarchy: filters now sit on a softly lifted control surface, tables use a darker data surface with a matching header, warnings use a restrained amber treatment, disabled actions are neutral, selected rows keep an ice-blue locator, and empty tables receive a structured local-icon state. The table scrollbar is reduced to 5px and the refresh/detail overlays use the same page-local palette without changing data, filtering, sorting, or refresh behavior.

## Frontend — Final Review Blocker Fixes

- Made WorkbenchRail outside-pointer dismissal yield to the same visible higher-priority dialog, modal, help, and AI layers used by Escape handling; added coverage proving dialog focus and rail state remain unchanged. Replaced the BusyOverlay and WidgetBalance geometry width transitions with transform-based progress fills, while leaving unrelated pre-existing `transition-all` uses outside this focused scope.

## Frontend — Final Rail Review Fixes

- Preserved a stable 64px mobile rail reservation while expanded navigation floats above the workspace, so opening or closing the drawer no longer shifts page geometry. The mobile drawer now exposes modal semantics and marks the workspace inert while open.
- Made rail Escape dismissal yield to visible page dialogs, modals, help overlays, and the AI drawer, preserving both the expanded rail and the current dialog focus until the higher-priority layer handles Escape.
- Made the desktop workbench rail compact by default and kept the workspace on a stable compact grid column while all explicit expansion renders as a floating overlay. Persistent and mobile expanded overlays now dismiss on outside pointer presses or Escape without changing the saved preference, while active-item temporary section expansion remains available.
- Replaced the market-data status progress bar's animated width with a transform-based fill and removed the remaining shared width transition from the touched component stylesheet.

## Frontend — Workers Motion Contract

- Restricted the Workers panel card transition to permitted background, border, and transform properties. The hover shadow remains a static visual state, with worker behavior unchanged.

## Frontend — Representative Workbench Page Alignment

- Aligned the representative services, logging, and market-data status page-local surfaces with the shared precision-engineering shell. Service cards and status panels now use the shared elevation and font treatment, while the logging legacy fallback keeps its existing behavior with the updated deep blue-grey palette. Dashboard Manager already matched the shared baseline and required no page-local changes.

## Frontend — Shared Workbench Surface Layer

- Aligned the shared workspace header, empty state, and error state with the precision-engineering surface tokens and panel elevation while preserving AppShell, status, slot, event, and accessibility contracts.

## Workbench Rail — Task 3 Interaction Contract

- Kept rail expansion explicitly click-locked, preserved temporary active-page expansion in collapsed mode, and ensured pointer exit cannot collapse the persisted preference. Collapsed navigation entries retain complete accessible labels and titles, while temporary expansion continues to dismiss through outside pointer presses or Escape without changing public props or emitted event contracts.

## Workbench Rail — Task 2 Review Fixes

- Corrected the shared panel material cascade so the intended surface, border, and shadow declarations win over later legacy panel rules. The icon-button transform now uses the spring easing at its effective specificity, rail width changes are no longer animated, disabled navigation entries do not receive pressed scaling, and mobile temporary overlays contain scroll chaining while retaining the existing explicit outside-pointer and Escape dismissal behavior.
- Removed the parent application-shell grid transition so rail expansion and collapse no longer animate a layout-triggering property.

## Frontend - Precision Engineering Visual Tokens

- Established the shared deep blue-grey surface hierarchy and precision-engineering semantic colors for Vue workbench pages, including panel/elevated shadows and accent-based focus treatment. Preserved legacy aliases and the offline Space Grotesk font setup, with a focused token contract test.

## Cluster Sync — Localization

- Localized the Cluster Sync page's remaining hardcoded field labels, table headers, retention and sync-mode options, and node-count text through the shared English and Simplified Chinese dictionaries. API behavior and data rendering remain unchanged.

## Frontend — Unified Typography Scale

- Unified the Vue and legacy frontend pages around one shared type scale: 12px captions, 14px secondary/control text, 15px body text, 16px emphasized labels, 19px section headings, 23px page-level headings, 26px titles, and 34px display headings. Existing font families, weights, line heights, spacing, colors, control dimensions, behavior, and API contracts remain unchanged.

## PBv7/PBv8 Backtest — Typography Scale

- Improved the backtest configuration page's type hierarchy through the shared frontend font-size scale: labels and helper text now use 12px, controls and actions 14px, body/table text 15px, and section headings use the shared 19px section size. The change is limited to font sizes and does not alter layout, spacing, colors, control dimensions, or behavior.

## PBv7/PBv8 Backtest — Color Palette

- Recolored the backtest workspace with a page-local deep navy/slate palette: the page, rail, toolbar, panels, inputs, borders, and text now have clearer surface separation and contrast without changing layout, typography, spacing, or behavior. Ice blue consistently marks selection and primary actions, while green is reserved for success and execution actions such as Save & Queue.
- Kept Plotly results charts aligned with the backtest workspace by updating their background, text, grid, and comparison-series colors to the same palette. Other frontend pages retain their existing theme.

## Dashboard Manager — Workspace Redesign

- Refined the Dashboard Manager into a clearer library-and-canvas workspace: the dashboard list now has stronger active, selected, hover, and keyboard-focus states; the command strip gives New Dashboard clear priority; and the empty/loading canvas uses a layout-matched skeleton treatment instead of a generic spinner.
- Unified the new-dashboard and delete-confirmation dialogs with the shared graphite visual system, added explicit dialog semantics and labelled iframes, and polished the draggable templates window without changing dashboard APIs, selection behavior, or iframe messaging contracts.
- Added a distinct library heading, active-workspace header, view/edit state indicator, direct empty-state create action, and grouped routine versus destructive controls while preserving resize handling and existing DOM contracts.

## Frontend Tooling — pnpm Migration

- Switched the frontend workspace (`frontend/`) from npm to pnpm: `package-lock.json` is replaced by `pnpm-lock.yaml`, and the toolchain is pinned via the `packageManager` field in `frontend/package.json`. `postcss` (used directly by the CSS-contract tests) is now an explicit devDependency instead of an implicit npm-flat transitive one.
- The `frontend-ci` workflow installs with `pnpm install --frozen-lockfile` and caches via pnpm (`pnpm/action-setup` reads the pinned version). The missing-build error hints on Vue routes, the matching route-test assertions, README/AGENTS instructions, and the migration-watermark build comment now say `pnpm run build` instead of `npm run build`.

## Run Editor — PBv8 Edit Page Panel Redesign

- Reworked the shared PBv7/PBv8 run editor (reached from Run → "Add PB8 instance") into a unified panel column: the form content is capped at 1420px and centred instead of stretching edge-to-edge on wide screens, and every top-level block (Basic — now with its own "Basic Settings" header — Filters, Bot Configuration, plus the collapsible Advanced / Additional Parameters / Raw JSON / Coin Overrides blocks) shares one card chrome and header treatment, replacing the previous mix of a bare grid, underlined titles and expanders. The in-page action sidebar is unchanged.
- The collapsible section headers are now real `<button>`s with `aria-expanded` (keyboard focusable, with a visible focus ring), a Phosphor caret that rotates to the accent colour when open, hover and pressed feedback.
- Form controls gained a proper state layer: a 3px accent focus ring (also on the coin multiselect), hover border emphasis, a muted read-only treatment for the locked v8 config-version field, and tabular figures in numeric inputs; action buttons received pressed feedback.
- Added consistent 16px vertical spacing between the run editor's top-level cards: the unified panel column is now a flex column with the shared `--component-gap` rhythm, so Basic Settings, Filters, Bot Configuration, the collapsible expanders and the Coin Overrides panel no longer stack edge-to-edge with almost no gap. The action strip's own bottom margin no longer doubles the spacing, and the migration notice / dynamic-ignore preview use the same uniform gap instead of their ad-hoc margins.

## Services Monitor — Workers Panel Refresh & Localization

- Deduplicated the Workers panel refresh controls: the page-header Refresh button now refreshes both the service status and the worker status in one go, and the panel's own ctrl-strip refresh button (which previously sat next to it as a second, visually identical button) is gone. Per-worker actions still trigger an immediate refresh after they complete.
- Localized the worker metadata: group names, worker names, types, descriptions, notes, stat labels/values, dynamic summaries ("3 pending, 2 active" …) and the monitor iframe title now resolve through `sysmon.worker*` i18n keys instead of showing the backend's English verbatim. Unknown workers (e.g. ones added on the backend later) fall back to the backend text unchanged, and the English locale keeps the exact backend wording.

## Optimize — Config Editor Tab Bar & Bounds Layout

- Fixed the Optimize "New Config" editor modal: on content-heavy tabs (Bounds / Optimizer / Scoring & Limits) the tab bar was crushed to a sliver with a vertical scrollbar, because its `overflow-x: auto` zeroed its automatic minimum height inside the height-capped flex modal. Pinned the tab bar with `flex-shrink: 0` (explicit on the modal header/footer too), so long tab contents now scroll inside the body while the tab bar stays intact.
- Gave the previously unstyled Bounds tab a proper grid layout: parameter keys get a flexible wrap-anywhere column, the min/max/step inputs are equal-width and aligned across rows, and the fixed checkbox plus delete button sit at the row end. Below 600px each row stacks in two lines (key full-width, then the three inputs with fixed/delete), hiding the range arrow.

## Optimize — Config Editor Modal Polish

- Refined the Optimize "New Config" editor modal: removed the redundant close button in the header (the footer Cancel remains), turned the bare version label into an accent badge, enlarged the title, and gave the editor modal a wider 1100px / 85vh frame so the nine-tab form has room. Added a hover state and transition to the tab bar.

## Strategy Explorer — Polish

- Added hover states (accent border/background shift with a transition) to the Strategy Explorer tab/stage/action buttons, including a danger hover for destructive actions.
- Normalized the floating data-tip tooltip's hardcoded `z-index: 9999` to the `--z-help` token.
- Removed dead `.page-title` CSS: the in-page title is now `sr-only` (the shared WorkspaceHeader owns the visible title), so the legacy title styling, accent bar, and their responsive rules no longer applied.

## Workbench Rail — Toggle Relocation

- Moved the rail collapse/expand toggle from the bottom of the workbench rail into the brand row: when expanded it sits on the right beside the PBGui logo, and when collapsed the logo/name hide and the toggle takes their place, centered. Shared across all Vue workbench pages.

## Backtest — Import Dialog Sizing

- Gave the config-import dialog a fixed readable width (`min(760px, 92vw)`) instead of the generic `fit-content` modal box, and a taller JSON paste area (`min-height: 320px`, `max-height: 60vh`), matching the legacy import dialog proportions.

## Backtest — Results Selection Checkboxes

- Added a visible checkbox column to the backtest results table with a header select-all, so row selection (previously click-only) has an explicit affordance. Rows still support click and click-drag range selection.

## Backtest — TWE Header Tooltip

- Added the missing TWE tooltip to the backtest results table header (the configs list already had it), so the abbreviation is explained on hover via `v7backtest.tweTooltip`.

## PBv8 Backtest — Config List Polish

- Quieted the backtest connection status: the always-on green banner is gone — the header status dot owns the connected state, connection success surfaces as a transient toast, and the full-width strip now appears only on disconnect/error.
- Reworked the configs list for scanability: timestamps render as `YYYY-MM-DD HH:MM` (full ISO kept in the tooltip), the results column reads as a count with `0` greyed out, coin symbols come from the backend `coin_list` (full set on hover), the TWE L/S header carries a tooltip, numeric columns sort by value, zebra striping aids row scanning, and a footer shows the visible total.
- Added a checkbox column with a header select-all, a Delete Selected button that shows its count and is truly disabled when nothing is selected, a per-row Duplicate action (backend `/configs/{name}/duplicate`), and a disabled view-results icon when a config has zero results.
- Merged the configs toolbar into one row: name search, exchange and (v8) strategy filters, visible-count, and select-all/deselect.

## VPS / Logging Navigation Convergence

- Converged the VPS Manager, VPS Monitor, and Logging Monitor pages onto the shared left workbench rail, retiring their legacy in-page sidebars. Each page now maps its view/tab switching to AppShell `sections` (rail children with active-state highlighting): Logging Monitor exposes the Logs/Settings views, VPS Monitor exposes Dashboard/Instances/Services/Logs tabs (its hide-IP/compact/debug-logging toggles moved into an inline options row above the content), and VPS Manager maps its six top-level sections plus the host-scoped Setup/Task-log/Host-logs/PBGui/PB7/PB8-branch/UFW sub-navigation to dynamic rail sections (sub-items appear only while a host context is active, mirroring the old conditional subnav). Removed the now-dead sidebar CSS and updated the parity/page tests to drive the rail sections. Verified: typecheck, production build, full Vitest suite (328 files, 4187 tests).

## DB Tools — Title + Calendar Fixes

- Fixed two regressions on the Vue DB Tools page. (1) The page title/subtitle rendered twice — once in the shared `WorkspaceHeader` and again in the ported legacy `.page-head` block — so the in-page `.page-head` markup and its now-dead CSS were removed; the title now comes only from the AppShell header. (2) The cutoff-date calendar button never opened the legacy `__dp` picker: the shared datepicker's document click-guard hides the panel on the very click that opens it unless the trigger carries `data-dp`, but the Vue button renders a Phosphor `<svg>`, so `event.target` had no `data-dp` and the guard ran `hide()` immediately after `show()`. The handler now stops propagation and anchors on the button (`event.currentTarget`) instead of the svg. Added regression tests for both. Verified: typecheck, production build, full Vitest suite (328 files, 4187 tests).

## Backtest Results Panel — Scroll Fix

- Fixed the PBv7/PBv8 backtest results panel clipping its charts with no scrollbar. During the Vue migration the `ResultsPanel` root `<div>` became an extra box between the `#panel-results` flex column and `#results-scroll-area`, breaking the height chain: `#results-scroll-area`'s `flex: 1` no longer applied (its parent became a plain block), so the charts grew past the panel and were clipped by `#panel-results`'s `overflow: hidden`. The root element now carries `results-panel-root` with `display: contents`, restoring `#results-fixed-top` and `#results-scroll-area` as direct flex children of `#panel-results` exactly as in the legacy DOM, so the pinned scroll area fills and scrolls again. Added a CSS contract test locking the boxless wrapper and the scroll-area flex/overflow declarations. Verified: typecheck, production build, full Vitest suite (328 files, 4185 tests).

## Strategy Explorer — Param Slider Fix

- Fixed the PBv7/PBv8 Strategy Explorer tuning sliders not updating their parameter value while dragging. `paramValue` now reads side fields from `config.bot.<side>.*` — the exact path `setParamValue` writes — instead of the stale `snapshot.sides.<side>.params`, so slider/select/bool/text edits reflect immediately through the reactive store instead of only after a server round-trip. The two structures are identical after a snapshot (`sides[side]["params"]` is a deep copy of `config.bot.<side>`), so initial values are unchanged; the aligned `paramValue`/`paramValueFor` signatures drop the now-dead snapshot `params` argument, and a write→read round-trip regression test was added. Verified: typecheck, production build, full Vitest suite (328 files, 4184 tests).

## Typography — Self-hosted Space Grotesk

- Replaced the font stack's macOS-only `Avenir Next` / generic `Segoe UI` lead with a self-hosted Space Grotesk variable font (SIL OFL 1.1, wght 300–700, latin subset) bundled at `frontend/vendor/fonts/` and served at `/app/vendor/fonts/...` by the existing `/app` static mount. `tokens.css` now declares the `@font-face` (with `font-display: swap`) and leads `--font-family` with `'Space Grotesk'`, keeping the existing system CJK fallbacks so Simplified Chinese keeps rendering through the platform faces. This gives the existing `500`/`600`/`650` weight hierarchy a real interpolated weight range instead of rounding to the nearest static system weight, and sets the shared workspace header title to `font-weight: 650`. Font and license only — no palette, markup, JS, or behavior change. Verified: typecheck, production build, and the full Vitest suite (328 files, 4183 tests) pass.

## Frontend Palette — Warm Graphite

- Rebased the entire frontend palette onto a warm-graphite scheme (approved option A of the palette review): surfaces moved from cool blue-gray to neutral warm graphite, the accent refined to `#5b9cf5`, semantic success/warning/danger tones re-harmonized, shadows retinted to the warm ground. Because the palette lives entirely in `tokens.css` ramps, the change is one authoritative token edit plus a mechanical sweep of fallback literals, Plotly JS color constants (with their test expectations), the favicon, and legacy HTML `:root` accents; red/green trading semantics, i18n, and layout are unchanged. Verified: typecheck, full Vitest suite (zero regressions vs. the clean-tree baseline), production build.

## Legacy CSS Token-Drift Fixes

- Closed the remaining drift between the legacy fallback stylesheets and the shared design tokens (Tier 1 of the redesign audit). `frontend/css/backtest_shell.css` now forwards `--border`/`--orange`/`--blue`/`--font` to the token ramps instead of re-encoding raw hex, replaces the foreign `#1f77ff` running badge/button/toast blue with the accent ramp, and uses `--accent-deep` fills for `.modal-btn-primary`/`.toast-info` to restore AA text contrast. `frontend/css/app.css` drops the off-family `#30333f` mauve job-card hover for an accent-tinted hover and switches the danger button to a `--danger-deep` fill with a consistent brightness hover (was raw white text + an inverting hover); `frontend/css/sidebar.css` accent buttons use `--accent-deep`. The fixed `100vh` viewport heights in `backtest_shell.css`, `sidebar.css`, and `modals_shared.css` moved to `100dvh`. CSS-only — no markup, JS, or behavior change.

## Frontend Visual Unification

- Consolidated the frontend palette onto the shared semantic tokens: extended `frontend/src/styles/tokens.css` with deep/soft ramp stops, `-rgb` channel companions, `--accent-contrast`, `--bg-backdrop`, and `color-scheme: dark`; a repeatable codemod (`frontend/codemod_colors.py`) redirected ~1100 hardcoded hex/rgba literals across all Vue page styles, legacy `css/`, and legacy HTML `<style>` blocks into the accent/success/warning/danger/text/surface token families, retiring the drifted blue variants and the off-palette teal accent while preserving categorical colors.
- Redesigned the shared navigation chrome (`frontend/pbgui_nav.js`): injected CSS fully tokenized, emoji action/dropdown icons replaced by a stroke SVG icon set (bell, shield-alert, book, info, chevron, and 17 page icons shared by the PBv7/PBv8 menu pairs), logo colors bound to tokens, and alert/confirm/about overlays aligned to the tonal surface language.
- Reworked the root login page: a visible submit button with pending state and duplicate-submit guard, brand-accent focus ring (was teal), a surfaced card with accent rail over an ambient page glow, larger controls, and new `misc.login.submit`/`misc.login.signingIn` i18n keys with Vitest coverage.
- Unified shared component styling: merged the duplicated `.btn`/`.pbgui-btn` definitions, switched toasts to the tonal badge language, shared the modal backdrop token, and added global `accent-color`/`caret-color` defaults; the jobs monitor and legacy sidebar/button styles were brought onto the same token system.
- Legacy pages now link `/app/src/styles/tokens.css` and forward their local `:root` aliases to the canonical palette; all 44 page entries gained the new `favicon.svg`.
- Fixed pre-existing styling bugs: an undefined `var(--radius)` in the strategy explorer, an invalid `var(--success)22` declaration in the API keys editor, and a dead duplicate `:root` block in the Welcome styles.
- Verification: typecheck, production build, i18n parity, and the full Vitest suite pass with zero regressions against the clean tree (the 18 failing files are the known Node localStorage environment issue); the two frozen dashboard-editor CSS digests were re-frozen per their documented convention.

## Upstream Release Sync

- Prepared the origin/main v1.98.24-v1.98.28 release changes for the Vue migration branch, including PB8 instance/VPS update behavior, deployment scripts, legacy compatibility updates, Pareto metric metadata, release notes, and regression coverage.

## Frontend Redesign Planning

- Standardized reachable Vue loading, empty, and error branches with shared semantic state components, visible status copy, retry actions where existing loaders support them, reduced-motion-safe skeletons, responsive shell checks, and explicit rail control semantics without changing API or composable behavior.

- Migrated the Jobs, Logging, VPS Manager, VPS Monitor, Cluster Sync, and Services Monitor Vue operations pages to the shared AppShell and text-backed StatusStrip, removed their Vue-only legacy topnav bootstrap, aligned full-height responsive workspaces, and replaced legacy control glyphs with accessible local Phosphor icons while preserving live updates, polling, log viewers, confirmations, deployment and credential boundaries, cluster actions, and service controls.

- Migrated the seven core Vue workbench pages (Welcome, Run, Optimize, Backtest, Edit, Strategy Explorer, and Pareto Explorer) to the shared AppShell and workbench rail, replaced page-local symbol controls with accessible Phosphor icons, retained local workspaces/status/help behavior and route-specific PBv7/PBv8 semantics, and removed their Vue-only legacy topnav bootstrapping.

- Made the shared AppShell supporting column stack below primary content on narrow screens and restored the shared skeleton shimmer animation with reduced-motion compatibility.

- Established the shared Vue dark-terminal foundation with a typed PBGui route model, collapsible and keyboard-accessible workbench rail, semantic application shell and workspace header, accessible text-backed status strip, cool-Morandi design tokens, and shared icon/button/loading/empty/error primitives while preserving legacy token aliases and frozen dashboard editor styles.

- Added the approved implementation plan for the PBGui dark professional trading-terminal redesign: shared cool-Morandi tokens and shell, collapsible workbench rail, local Phosphor icon system, staged Vue page-family migration, responsive/accessibility states, legacy fallback alignment, and verification gates that preserve API, route, i18n, offline, and frozen-CSS contracts.

- Documented the approved Open Design direction and implementation plan for a denser shared PBv7/PBv8 Backtest configuration workbench, including responsive long-label protection, advanced-execution disclosure, aligned Long/Short controls, per-side JSON disclosure, localization, guide coverage, and verification gates without changing config or API behavior.

- Documented the approved PBGui frontend redesign: Vue 3 MPA continuation, Tailwind/headless/icon Spikes, semantic dark design system, and staged Dashboard, logging, and services-monitor migration with API, authentication, i18n, offline, and legacy-fallback compatibility preserved.

## Frontend Redesign Verification

- Resolved final Vue migration review blockers by keeping the collapsed mobile rail in normal flow without a workspace gap, removing nested main landmarks, completing shared legacy and Vue action icons with accessible Phosphor controls, localizing API-key profile controls, and preventing Market Data settings responses from exposing stored AWS credentials while preserving body-only credential updates.

- Completed the final Task 8 regression verification: the full Vue test suite (1,456 suites, 4,172 tests), frontend typecheck, and production build pass; changed Python modules pass compilation, while Python pytest verification remains unavailable because pytest is not installed in the environment. The final redesign includes the required Market Data AWS credential-response privacy fix and serial bump to 2231, has no generated dist or secret artifacts, preserves frozen dashboard CSS, and keeps existing unrelated AGENTS.md and plan deletion changes outside the redesign staging set.

- Aligned the legacy fallback navigation with the Vue workbench icon language using an allowlisted local Phosphor Regular SVG factory, escaped accessible labels, explicit unknown-icon rejection, and cache-busted offline helper loading while preserving routes, cookie authentication, placeholders, help, language, restart, about, and responsive behavior.

- Fixed the Task 6 collapsed mobile WorkbenchRail layout so its keyboard-accessible expand control remains visible within the 64px brand row, with focused responsive stylesheet coverage and unchanged expanded drawer, focus, and reduced-motion behavior.

- Completed the compatible Task 5 supporting-page shell migration: Coin Data, DB Tools, Balance Calculator, API Keys, Market Data, Help, and Dashboard Manager now use the shared AppShell/StatusStrip without legacy topnav bootstrapping; preserved selection/drag-select, dates, job history, iframe sizing, help sanitization/deep links/EN-DE behavior, dashboard postMessage parity, authentication, and credential reveal cleanup, with Phosphor accessible controls and no private-key reveal affordance. HL data-actions, market-data status, dashboard templates, root login, and dashboard editor remain specialized embedded/standalone boundaries by design.

- Completed the remaining Task 5 supporting-page shell pass: Help uses AppShell with accessible Phosphor controls, while HL data-actions, market-data status, dashboard templates, login, and dashboard editor retain their tested iframe/fragment/standalone boundaries and existing auth, route, sanitization, postMessage, and parity contracts.

- Added focused Backtest config-editor regression coverage for all trading steppers, including Phosphor icons, contextual accessible names, declared numeric bounds, and disabled fee inputs; fixed the maker/taker controls to honor their existing `0` to `0.01` range.

- Fixed the remaining Task 3 review findings in the Backtest and Optimize workbenches: symbol-prefixed actions now use clean i18n labels with decorative PbIcons, numeric steppers expose contextual native-button labels, and CoinMultiSelect uses keyboard-accessible semantic buttons without changing values or layout.

- Completed the remaining Task 3 core-workbench icon migration across Backtest and Optimize child controls, replacing rendered action glyphs with decorative Phosphor icons while preserving labels, events, layout, and bilingual semantics, and adding accessible names plus focused icon assertions for icon-only controls.

- Fixed Task 3 review findings in the migrated PBv7/PBv8 workbenches: AppShell remains the only main landmark, inner workbench containers are non-landmark elements, and Backtest/Optimize action labels render separate decorative Phosphor icons with focused visible-text and SVG assertions.

- Completed the Task 7 verification pass: frontend typecheck and production build pass, affected Vue page suites pass with isolated Node 26 localStorage, affected Python route/i18n tests pass, and GitNexus reports a low-risk documentation-only uncommitted scope.

## Frontend Bundle Size

- Split the English, Simplified Chinese, and server-message dictionaries into separate Rollup chunks so the shared frontend runtime and every generated asset remain below the 500 kB minified chunk warning threshold.

## Upstream Sync / Vue 3 Compatibility

- Merged the `origin/main` v1.98.7–v1.98.23 release fixes into the Vue 3 migration branch and adapted the affected Backtest, Run, Optimize, and VPS Manager behavior to the active Vue pages, including progressive result loading, PB8 runtime warnings, schema-compatible host selection, migration review drafts, canonical PB8 Run handoffs, and runtime-qualified PB8 metric history.

## Internationalization (English / Simplified Chinese)


- Web console UI now supports English (default) and Simplified Chinese.
  - Browser language auto-detection (`zh*` → Chinese), manual switch button in the top navigation bar (and on the login page), persisted per browser via `localStorage['pbgui-lang']`; switching reloads the page.
  - New lightweight i18n engine `frontend/i18n.js` (`window.PBGuiI18n`: `t()`, `setLang()`, `toggleLang()`, `translateDom()`, `serverMsg()`); dictionaries `frontend/i18n/en.json` and `zh.json` with semantic keys; `data-i18n*` attributes for static markup.
  - All 36 console pages, shared JS modules, navigation bar, dialogs, toasts, alert overlay, and confirmations translated; `PBGuiI18n.serverMsg()` maps known server-side English error messages to Chinese and falls back to the original text.
  - Kept untranslated: user data, log content, config field names, and established abbreviations/terms (PNL, TP/SL, API, SSH, VPS, …); help guides remain EN/DE.
- Added `tests/test_i18n.py` enforcing en/zh key parity, non-empty translations, well-formed server message map, and that every key referenced by pages/scripts exists in both dictionaries.
- Updated `AGENTS.md` language convention accordingly.

## Vue 3 Frontend Migration (continued)

- Fixed the standalone Dashboard editor color contrast by loading the shared theme tokens and base form styles, making dashboard names, layout controls, widget palette items, empty-cell hints, and grid actions readable in dark mode.

- Refined the migrated PBv7/PBv8 Backtest config editor visual hierarchy: added a responsive section-card layout for basics, capital/execution, market data, coin filters and bot settings; introduced a 12-column desktop field grid, a single clean exchange selector without duplicate labels/actions, clearer section guidance, grouped sidebar actions, a dedicated filter action, and an independently scrollable editor while preserving the existing config bindings and handoff behavior; removed duplicate icon prefixes throughout the Backtest and Optimize submenu actions, including New Config, Delete Selected, Backtest, Compare, archive maintenance and editor actions.

- Implemented a denser shared PBv7/PBv8 Backtest configuration editor with accessible Advanced execution settings and per-side Full Config JSON disclosures, aligned Long/Short comparison controls, and medium-width protection for long technical labels, without changing config or API behavior.

- Repaired the migrated PBv7/PBv8 Backtest config editor: restored the legacy compact grid, searchable tag dropdowns, numeric steppers and explicit expanders; restored JSON import plus Results, Convert to V8, Add to Run, Strategy Explorer, Balance Calculator and OHLCV readiness handoffs; saved-config-only actions remain disabled for unsaved configs. Added focused Vue and stylesheet regression coverage.

- Refined the Vue Welcome page visual hierarchy: the overview now offers a direct PB7 setup action, groups runtime checks by Security/PB7/optional PB8/Node, removes duplicate sidebar status pills, uses neutral styling for optional PB8, constrains wide layouts, and gives password changes a focused form with a separate authentication-disable danger area. The shared Vue migration watermark is now off by default and can be enabled only with `VITE_MIGRATION_WATERMARK=on` during migration QA.

- Migrated the Logging Monitor to the Vue 3 workspace (`frontend/src/pages/logging_monitor`): the shared live `LogViewerPanel` with rotated-generation switching, explicit purge confirmation, default/managed/per-log rotation settings, apply feedback, shared help/nav integration, Escape cleanup, and focused Vitest coverage. `GET /api/logging/main_page` now serves the Vue build first with `frontend/logging_monitor.html` retained as the cookie-only legacy fallback; added route coverage and bumped `api/serial.txt`.
- Migrated the Shared Jobs Monitor to the Vue 3 workspace (`frontend/src/pages/jobs_monitor`): live cookie-authenticated WebSocket updates with polling fallback, active/done/failed history tabs, URL exchange/job-type filters, safe job detail/log modals, explicit action confirmations, distributed Bitget downloader summaries with log fallback, embedded Services Monitor routing, and legacy fallback support; added route and Vitest coverage and bumped `api/serial.txt`.
- Migrated the VPS Monitor to the Vue 3 workspace (`frontend/src/pages/vps_monitor`): cookie-authenticated live VPS state, dashboard metrics and monitor-agent health, instance/service actions, metric-history charts, shared `LogViewerPanel` logs, persistent compact/debug settings, safe result rendering, and legacy fallback support; added route and Vitest coverage and bumped `api/serial.txt`.
- Migrated Cluster Sync to the Vue 3 workspace (`frontend/src/pages/cluster_sync`): identity/status overview, setup and self-join controls, node membership/settings/actions, V7 state and tombstones, oplog, credential status/actions, retention policy/report controls, safe confirmation modals, and legacy fallback support; added route and Vitest coverage and bumped `api/serial.txt`.
- Migrated the VPS Manager to the Vue 3 workspace (`frontend/src/pages/vps_manager`): cookie-authenticated overview/context WebSocket, master and VPS detail/setup views, existing-VPS and Cluster-node imports with progress polling, pre-flight and `/etc/hosts` flows, SSH host-key confirmation, password-gated deployments, profile-aware PB7/PB8/PBGui actions and branch tracking, UFW preview/apply, package and task/deploy log surfaces through the shared `LogViewerPanel`, bot metric/error drill-downs, bilingual settings and persisted overview preferences, safe destructive-action confirmation, and legacy fallback support; added route, contract, and Vitest coverage and bumped `api/serial.txt`.
- Completed the Vue 3 migration of `v7_optimize` under `frontend/src/pages/v7_optimize`: route-aware PBv7/PBv8 configuration, Backtest incoming-draft handoff, structured config editing with `_pbgui_param_status` highlighting, metadata-driven scoring/limits, strict PB8 suite-scenario validation, typed editing for previously uncovered `optimize.*` parameters, DEAP↔pymoo field migration and inactive-field cleanup, canonical `optimize.fixed_runtime_overrides`, advanced pymoo/objective-scenario controls, PB8 fine-tune and polish runtime settings, HSL runtime overrides, OHLCV readiness/preload/stop/log monitoring, archive/import/plot/Pareto actions, queue repair/logs/reordering, PB8 migration/checkpoint flows, shared boot/navigation entry, and Vitest coverage. Both optimize routes now serve the shared Vue build first and retain `v7_optimize.html` as the offline fallback.
- Migrated the Coin Data page to the Vue 3 workspace (`frontend/src/pages/coin_data`): sidebar with view switching and the four refresh actions, filters panel with number steppers (dynamic vol/mcap ladder) and a Vue tags multiselect replacing the `editor_shared` controller, the three sortable symbol tables, the draggable/resizable selected-row details card, and the refresh-job busy overlay with progress polling.
- Migrated the Hyperliquid data-actions widget to `frontend/src/pages/hl_data_actions` as a standalone Vue page (still embedded by the Vue market-data page via iframe): both collapsible sections with localStorage persistence, the drag-select coin picker grids (tradfi-only / no-local-data / text-filter combination), native date inputs replacing the inline calendar, inline job monitors over the `/ws/jobs` WebSocket plus history tabs, and the shared log/details modal with iframe-aware viewport sizing. The `__HLDA__` multi-mount prefix machinery is dropped for the Vue build (single instance).
- Both routes serve the built Vue entry first with the legacy `coin_data.html` / `hl_data_actions.html` templates as fallback (`serve_vue_or_legacy_page`); a missing build and template fails with the `pnpm run build` hint. `api/serial.txt` bumped so running UIs show the restart requirement.
- Promoted the market-data drag-select engine to `frontend/src/shared/composables/useDragSelect.ts` as the third consumer (settings + best-1m pickers + the new hl coin grids) instead of a page-local copy.
- Legacy frontend string tests migrated to the Vue sources with verified coverage: `tests/ui/test_hl_data_actions_frontend.py` deleted (filter combination, payload contract, and job-history request order live in the `hl_data_actions` vitest suites), the Coin Data CMC-gating contract in `tests/test_coin_data_api.py` re-pointed at the Vue store/sidebar, and the XSS/visual-contract tests in `tests/test_v7_config_sync.py` re-pointed at the Vue components. Added `tests/test_coin_data_route.py` for the two routes (Vue build, legacy fallback with injections, build hint).
- Migrated the Help & Tutorials page to the Vue 3 workspace (`frontend/src/pages/help`): the page-local help overlay with EN/DE language pills (`help-lang` persistence), topic index TOC with live filter, `?topic=` deep links, DOMPurify-sanitized marked (GFM) rendering through the local `/app/vendor` stack, debounced in-topic search with `<mark>` navigation (Enter/Shift+Enter/up/down/Escape), cross-topic global search with snippet result cards, and the drag/maximize/close chrome including the nav Guide-button re-entry hook (`PBGUI_HELP_OPENER`).
- Help routing: new `GET /api/help/main_page` (beside the `/api/help/*` endpoints) serves the built Vue entry first with `frontend/help.html` as fallback; the legacy file's previously-unfilled placeholders (`%%API_BASE%%`/`%%WS_BASE%%`/`%%VERSION%%`/`%%SERIAL%%`, left literal while it was served statically from `/app/help.html`) are now injected in that fallback. `FASTAPI_PAGES['help']` points at the new route and its dead `?v=` cache-bust is removed. Added `tests/test_help_route.py` (Vue build, fallback injections, build hint).
- Migrated the PBv7/PBv8 Run list page to the Vue 3 workspace (`frontend/src/pages/v7_run`): the diff-based instance table becomes a reactive render pipeline (search/status filters with the active-first sort, status-class/label maps), the WS connection banner with generation-guarded REST snapshots, row actions (edit/add/delete with the per-host summary toast, forced modes with their confirm modals, V8 conversion, balance-calculator handoff with the v8 draft flow), the PB8 update-required host warning, and the backups panel with its confirm overlay. One Vue build serves both `/api/v7/main_page` and `/api/v8/main_page` — the run version is derived from the serving route's path (`config.ts detectRunVersion`), the legacy `run_list_adapter.js` global is not loaded.
- Run page routing: `GET /api/v7/main_page` and `GET /api/v8/main_page` now serve the built Vue entry first with `frontend/v7_run.html` as fallback (the v8 fallback keeps the exact `_render_page` placeholder set, now extracted into `_apply_placeholders` shared by the route); `frontend/v7_run.html` stays in place as that fallback. Added `tests/test_v7_run_route.py` for both routes (Vue build, legacy fallback with v7/v8 injections, build hint).
- Migrated the Welcome page to the Vue 3 workspace (`frontend/src/pages/welcome`): the overview summary/meta pills (bootstrap payload version/serial win over the boot-injected constants, :1414-1415), the runtime status rows and setup issues, login-security warning with acknowledge, the setup form with prefill and the file browser modal, the password section with its authenticated-only gating, and the sidebar resize handle.
- Welcome routing: `GET /api/auth/main_page` serves the built Vue entry first with `frontend/welcome.html` as fallback; the redirect-to-root and passwordless-session logic run unchanged before serving, and the `Referrer-Policy` header and session cookie are set on both branches. Added `tests/test_welcome_route.py` (Vue build, fallback injections, header/cookie preservation, build hint).
- Migrated the Strategy Explorer page to the Vue 3 workspace (`frontend/src/pages/v7_strategy_explorer`, the last v7/v8 module's first page): the six sidebar stages (Analysis / Exchange & State / Raw Config / Simulation / Compare / Movie Builder) with the shared analysis controls, the flavour-dependent PB7/PB8 title-subtitle-chips and simulation-mode collapse, the dual LONG/SHORT tuning columns with segment tabs and slider/select/bool/text param fields writing through `setParamValue` into the config, side statistics with the collapsed Rust debug accordions, Plotly candle/grid/trailing-band figures with the candle-bucket zoom handler (Plotly stays a vendored script global), the exchange/state steppers with market-derived source notes, the Raw Config stage on the shared `PBGuiJsonPanel` global with the 450 ms debounced validate→sync-markets→recalculate flow, the simulation/compare runs with 700 ms progress polling and generation guards, the Movie Builder (duration presets, fills.csv handoff window chooser, animation figure with play/slow/pause + slider, arrow-key stepper, stop/abort, MP4 export with presets/codec options/localStorage persistence), and the v8-only sessionStorage refresh cache (24 h TTL, sensitive-key rejection, 3 MB cap) with the draft-expiry restore path. The inline calendar stays a window global (`lib/datePicker.ts`); i18n keys reused verbatim (579 `v7explore.*` keys, en/zh parity).
- Strategy Explorer routing (dual-flavour like v7_run): `GET /api/strategy-explorer/main_page` and `GET /api/strategy-explorer-v8/main_page` now serve the SAME built Vue entry first with `frontend/v7_strategy_explorer.html` as fallback (the v8 fallback keeps its cookie-only token, empty `result_path`, and request-path-derived API base); the flavour is derived from the serving route's path (`config.ts detectExplorerFlavor`, the twin of v7_run's `detectRunVersion`). Added `tests/test_strategy_explorer_route.py` for both routes (Vue build, legacy fallback with v7/v8 injections, build hint).
- Migrated the API Keys editor page to the Vue 3 workspace (`frontend/src/pages/api_keys_editor`): the user table (filter/sort with `?filter&sort&dir` persistence, keyboard row navigation, credentials/expiry/in-use badges, API-keys meta bar), the create/edit panel with legacy-exact masked-field semantics (leave-blank-keep, reveal-key POST with generation guards, exchange-change credential reset), HL/Bybit inline expiry checks plus the all-users expiry panels, the comments CRUD, the HL expiry Telegram warning config, the TradFi vault-profile section (yfinance box, profile table selection, provider notes/links, projection status + retry, generation-guarded reveal/test/save with pending-save-intent reconciliation, rotate/toggle/delete), the backups panel with two-file compare selection (click/drag) and the unified/side-by-side diff modal, the Logs panel (LogViewerPanel global), sidebar resize, `#edit/<name>`/`#tradfi`/`#backups`/`#comments`/`#hl-config` deep links, Escape-close, dirty-leave confirm, and pagehide secret hygiene. The dead embedded help overlay (never openable in legacy; nav goes through PBGuiSharedHelp) was dropped and `PBGUI_HELP_OPENER` re-wired instead; i18n keys reused verbatim (188 keys, en/zh parity).
- API Keys routing: `GET /api/api-keys/main_page` serves the built Vue entry first with `frontend/api_keys_editor.html` as fallback (same placeholder injections, `%%TOKEN%%` stays empty for cookie auth); `frontend/api_keys_editor.html` stays in place as that fallback so the pure-Python logic tests reading it (`test_tradfi_vault_cutover`, `test_v7_config_sync`, `tests/ui/test_archive_optimize_import_frontend`) keep working. Added `tests/test_api_keys_route.py` (Vue build, legacy fallback with injections, build hint).
- Replaced the raw `<pre>{{ JSON.stringify(...) }}</pre>` / `PBGuiJsonPanel` JSON dumps on migrated Vue pages with a shared `JsonViewer` component (`frontend/src/shared/components/JsonViewer.vue`) built on `vue-json-pretty` 2.6 (npm dependency, bundled locally by Vite — no CDN): a syntax-coloured, collapsible dark-theme tree with an Expand/Collapse + Copy toolbar, virtual scrolling for large documents, a plain-text fallback for non-JSON values (log lines, error strings), and an empty placeholder mode. Migrated: VPS Manager (deploy settings, setup progress, host-key/package/UFW/import/onboard/history/systemd modals), Cluster Sync (credential nodes, retention report), Jobs Monitor and HL data-actions job detail modals, Pareto Explorer (result context card and the full-config detail — the page no longer loads `json_panel.js`), Strategy Explorer (side-stats Rust debug blocks and the exchange/state debug sources; the editable Raw Config stage keeps the legacy panel), Backtest (OHLCV readiness modal, analysis/config sections, optimize-config view), Optimize (Pareto JSON plot modal), and the Dashboard editor dry-run config preview. Added the `shared.json.empty` i18n key (en/zh parity) and updated the affected Vitest contracts.
