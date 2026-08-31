# PBv7 Backtest

**PBv7 Backtest** 页面允许你创建、运行和评估 Passivbot v7 回测。
它是一个独立的 FastAPI 页面——无需刷新页面。实时队列更新通过 WebSocket 到达。
来自 FastAPI **Run** 和 **Optimize** 页面的草稿传递现在也直接在这里作为 FastAPI 草稿打开，因此在这些 PBv7 页面之间切换不再需要旧版中继路径。
PBv8 Backtest 渲染相同的页面模板和可视化编辑器；一个小的版本适配器只更改特定代的配置路径和 API 端点。

页面由左侧边栏选择的五个面板组成：

| 面板 | 用途 |
|-------|---------|
| **Configs** | 创建和编辑回测配置 |
| **Queue** | 监控和控制回测运行器 |
| **Results** | 浏览和分析已完成回测结果 |
| **Archive** | 访问社区和个人配置存档 |
| **Legacy** | 浏览在 PBGui 管理的 `pbgui` 路径之外的 `pb7/backtests` 下找到的旧结果文件夹 |

**顶部导航栏**包含：

| 按钮 | 操作 |
|--------|--------|
| 🔔 | 打开通知日志（显示 `PBV7UI.log` 的浮动面板） |
| 📖 Guide | 打开此帮助页面 |
| ℹ️ About | 显示 PBGui 版本信息 |

---

## Configs 面板

### 列表视图

表格显示所有已保存的回测配置，列为：
**Name**、**Exchange**、**Start Date**、**End Date**、**Created**、**Modified**、**Actions**。

**选择：** 单击行切换选择。按住并拖动可选择范围。
使用表格上方的 **Select All** / **Deselect** 按钮。

**侧边栏操作：**

| 按钮 | 操作 |
|--------|--------|
| **+ New Config** | 创建新的回测配置 |
| **🗑 Delete Selected** | 删除所选配置（确认对话框可同时删除结果） |

双击行在编辑器中打开。

### 编辑视图

编辑在主区域内联打开。字段：

| 字段 | 说明 |
|-------|-------------|
| **Name** | 配置名称（用于结果和队列显示） |
| **Exchange(s)** | 运行回测的一个或多个交易所 |
| **start_date / end_date** | 回测的日期范围 |
| **starting_balance** | 初始余额（美元） |
| **hsl_signal_mode** | PB7 派生的账户级 HSL 行为选择器：`pside` 保持多/空回撤信号分离，`unified` 共享一个组合信号 |
| **logging_level** | Run 风格的选择器，选项为 `warning`、`info`、`debug` 和 `trace` |
| **approved_coins / ignored_coins** | 显式币种列表；由 **Apply Filters** 自动填充 |
| **Coin sources** | 币种列表的来源（PBGui 币种数据库、手动等） |
| **Market settings sources** | 市场特定设置的来源 |
| **Bot parameters** | 策略参数（多/空方向、TWE 等） |

共享的 Vue 编辑器使用密集的响应式多列工作台：交易所和币种字段使用可搜索的标签下拉框，数字行保持对齐，**Additional Parameters** / **Raw JSON** 只通过其显式展开按钮打开。

常用资金和执行字段保持可见以便快速编辑。费用覆盖、`market_order_slippage_pct`、`filter_by_min_effective_cost`、`hsl_signal_mode` 和 `logging_level` 分组在 **Advanced execution settings** 下。

Long 和 Short 保持对齐以便比较：TWE（`total_wallet_exposure_limit`）和 `n_positions` 保持可见，而每一侧的 **Full Config JSON** 默认折叠。即使折叠，展开头在存在 JSON 错误或需要审查的参数状态时仍显示其 **Review** 指示器。

**编辑器操作按钮：**

| 按钮 | 操作 |
|--------|--------|
| **💾 Save** | 将配置保存到磁盘 |
| **← Back** | 不保存返回配置列表 |
| **Add to Queue** | 保存并入队 → 切换到 Queue 面板 |
| **Apply Filters** | 从当前过滤器设置填充 approved/ignored 币种列表 |
| **📊 View Results** | 跳转到 Results 面板中此配置的结果 |
| **▶ Add to Run** | 将已保存的回测配置作为新的 PBv7 Run 草稿打开；配置保存前禁用 |
| **🔍 Strategy Explorer** | 通过经过身份验证的草稿在当前编辑器配置的匹配 PBv7/PBv8 Strategy Explorer 中打开 |
| **⏩ Convert to V8** | 使用 PB8 官方迁移器转换当前已保存的 V7 配置，并在 PBv8 Backtest 中打开；配置保存前禁用 |
| **💰 Balance Calculator** | 打开 Information 下的共享 Balance Calculator，加载当前编辑器配置作为草稿 |
| **⚡ Calc Balance** | 不离开 Backtest 页面，在模态框中内联运行相同的余额计算 |
| **🧭 OHLCV Readiness** | 打开可拖动、可调整大小的浮动窗口，为当前配置运行 PB7 支持的只读预检，显示每个批准的币种是本地就绪、可从旧版 OHLCV 数据导入、启动时会获取，还是被持久缺口阻止；列表评估 `approved_coins_long` 和 `approved_coins_short` 的并集，每个条目现在显示它来自 `long`、`short` 还是两者。如果 PB7 会获取缺失范围，窗口还提供 **Preload OHLCV Data** 在启动回测前于后台预热缓存，预加载启动时自动跳转到预加载任务日志区段，从活动的 archive/ccxt 下载行显示真实的日志派生进度行以及持续时间、PID、日志计数器和最后更新详情，通过移动的请求游标跟踪 CCXT 进度，而不是在交易所返回比请求更新的 K 线时跳到 100%，使用与就绪检查相同的预热调整有效开始时间，使预加载后刷新不再把预热天数甩在后面，将在请求窗口之后才上市的市场分类为太年轻而不是假装可以获取那些更旧的 K 线，从预加载任务中修剪此类币种，下载器活动时提供 **Stop Preload** 操作，为浮动面板提供右上角的适应浏览器窗口控件，保持日志尾部运行而不跳回顶部，并在新的就绪检查替换前保持完成的预加载结果可见 |
| **📥 Import** | 打开 Run 风格的粘贴 JSON 对话框，并将导入的配置加载到编辑器供审查；粘贴的配置通过与常规保存配置相同的 PB7 加载管道规范化，因此补充参数和 `neutralized` / `review` 标记被保留 |

**Raw JSON** 展开器、**Bot Configuration** 的 `long` / `short` JSON 编辑器、基于 JSON 的 **Additional Parameters** 和 **Import** 对话框现在使用共享的 JSON 验证。无效 JSON 直接在编辑器中高亮，故障行可用按钮显示，错误提示出现在一个共享的固定视口位置，JSON 恢复有效前保存/导入被阻止。

**Coin Overrides → Config File** 的 `long` / `short` JSON 编辑器使用与主编辑器字段相同的 JSON 验证模式和共享固定视口错误提示位置。无效 JSON 直接在编辑器中高亮，在这些 JSON 片段恢复有效前关闭币种覆盖编辑器被阻止。

### Coins & Filters

这些字段通过 PBGui 币种数据库控制包含哪些币种。
调整后单击 **Apply Filters** 更新 approved/ignored 列表。

| 字段 | 说明 |
|-------|-------------|
| **market_cap (min M$)** | 最小市值（百万美元）。设为 `0` 禁用。 |
| **vol/mcap** | 最大 24 小时成交量与市值比率。非常高的比率通常表示低质量币种。 |
| **tags** | CoinMarketCap 分类标签。只包含至少匹配一个标签的币种。空 = 全部。 |
| **only_cpt** | 只包含可跟单交易的币种。需要新鲜的跟单交易数据（Coin Data 页面）。 |
| **notices_ignore** | 排除带有活动 CoinMarketCap notice（如调查、资不抵债）的币种。 |

---

## Queue 面板

显示所有待处理、运行中和已完成回测任务及实时状态更新。

Queue 视图以排队、活动、完成和需要注意的任务计数器开始。其主题化表格保持表头可见，窄屏时水平滚动，显示当前所选行数，并支持单击、单击拖动、**Enter** 或 **Space** 选择。逐行操作使用共享的语义按钮颜色。

### 表格列

| 列 | 说明 |
|--------|-------------|
| **Status** | `queued` / `running` / `backtesting` / `complete` / `error` |
| **Name** | 配置名称 |
| **Exchange** | 使用的交易所 |
| **Created** | 任务入队的时间戳 |
| **Actions** | 上下文相关的操作按钮 |

**选择：** 单击行切换选择，拖动多选。
使用表格上方的 **Select All** / **Deselect** 工具栏。

### 逐行操作按钮

| 按钮 | 条件 | 操作 |
|--------|-----------|--------|
| ▶（黄色） | `error` | Restart — 立即重新启动失败的回测 |
| ▶（默认） | `queued` | Start — 立即启动此任务 |
| ⬛（红色） | `running` / `backtesting` | Stop — 终止运行中的进程 |
| 📊（绿色） | `complete` | View Results — 切换到过滤到此配置的 Results 面板 |
| 📜 | 始终 | Log — 为此任务的日志文件打开浮动日志面板 |
| 🗑 | 始终 | Remove — 删除此队列条目（运行中则停止） |

当恰好选择了一个队列行，或 Queue 面板外有一个运行中的 Backtest 可用时，PBGui AI 可以调用页面宣告的 `show_log` 操作。它调用与行 Log 按钮相同的现有 `showLog` 函数。跨页面操作会导航到 Backtest，并在执行前等待其队列数据。

### 侧边栏操作

| 按钮 | 操作 |
|--------|--------|
| **📈 Compare** | 为所选已完成的队列任务加载匹配结果，切换到 Results，并直接打开比较图表 |
| **✓ Clear Finished** | 移除所有 `complete` 和 `error` 任务 |
| **⬛ Stop All** | 终止所有运行中的回测进程 |
| **🗑 Delete Selected** | 移除所选队列条目 |
| **⚙ Settings** | 打开 Settings 模态框 |

选择多个已完成的队列行并单击 **📈 Compare** 时，PBGui 为每个所选队列项解析匹配的结果批次，打开 **Results** 面板，预选这些结果行，并立即渲染比较图表。尚未完成或没有匹配存储结果的队列项会被跳过。

### Settings 模态框

PB7 和 PB8 使用一个共享的队列设置配置。在任一 Backtest 页面保存它都会更新两个工作器。CPU 值是全局自动 PB7/PB8 进程限制，不是每个版本的独立配额。对话框立即从其当前状态渲染，并在后台刷新权威主机值而不覆盖编辑。

对话框将控件分组为 **Queue concurrency**、**Automatic behavior** 和 **HLCVS Cache Cleanup** 分区。清理字段在启用清理前保持可见禁用，**Clean Now** 保留其受保护的在处理状态。

队列设置对话框还包括 `Use PBGui Market Data`。启用该设置时，PBGui 会在每个排队或手动回测启动前立即将 `backtest.ohlcv_source_dir` 重写为当前 PBGui 行情数据根目录，无论配置编辑器中存储的路径是什么。

| 设置 | 说明 |
|---------|-------------|
| **CPU** | 自动 PB7/PB8 回测进程的全局数量（最大 = CPU 核心数） |
| **Autostart** | 启用后两个版本的工作器都会在共享 CPU 限制内自动拾取 `queued` 任务 |
| **Use PBGui Market Data** | 在启动前覆盖 `backtest.ohlcv_source_dir`，使排队任务始终使用 PBGui 管理的 OHLCV 数据集 |
| **HLCVS Cache Cleanup — Enabled** | 定期清理版本特定的 PB7 和 PB8 缓存根目录 |
| **Retention (days)** | 删除早于该天数的目录（默认：7） |
| **Check interval (h)** | 清理运行频率（小时）（默认：24） |
| **🧹 Clean Now** | 立即为当前打开的 PB7 或 PB8 页面运行时运行清理 |

---

## Results 面板

浏览所有已完成回测结果。

### 过滤与排序

- **Version** 下拉框 — 显示 PBv7 结果、PBv8 结果或两者；此页面默认选择 PBv7
- **Config** 下拉框 — 按配置名称过滤（精确匹配）
- **Search** 文本字段 — 对任何列的自由文本过滤
- **Columns** — 选择可见的结果列。**Defaults** 恢复既定表格，而 **All** 还启用 Final Equity 和 Equity/Balance Difference 等可选的可用值。Local Results 和 Archive 保持独立的浏览器本地选择。
- 单击任意列头排序；再次单击反转

已完成的队列任务会立即使缓存的结果列表失效。如果你在回测完成时已经在 Results 面板上，PBGui 会自动刷新表格，新结果无需离开并重新打开面板即可出现。

从 Config 编辑器切换到 Results、Queue、Archive、Legacy 或 Refine 时，总会立即恢复正常的面板操作侧边栏；过期的编辑器侧边栏不能附着到另一个面板上。

### 工具栏操作

| 按钮 | 操作 |
|--------|--------|
| **🔄 Backtest** | 将所选结果作为新回测重新运行（打开日期/余额/交易所模态框） |
| **▶ Add to Run** | 从所选配置创建实时运行 |
| **📈 Compare** | 将所选结果添加到比较视图 |
| **🗄 Add to Archive** | 将所选结果导出到 **My Archive**；PBGui 复制批次，只更新其清单条目，而不是重新扫描完整存档 |
| **⬆ Git Push** | **My Archive** 有本地未推送更改后出现，无需打开 Archive 面板即可推送新归档结果 |
| **🔍 Strategy Explorer** | 在其所属的 PB7 或 PB8 Strategy Explorer 中打开恰好一个所选结果；PB8 使用经过身份验证的不透明草稿，并为 Compare 保留本地存储的成交来源 |
| **🧬 Optimize from Result** | 直接打开 Optimize 编辑器，所选结果作为草稿且 `Starting Seeds = self` |
| **🗑 Delete Selected** | 从磁盘删除所选结果 |

Backtest/Rebacktest 对话框中的交易所列表使用无修饰符的切换选择：单击未选中的交易所会添加它而不清除现有选择，而单击已选中的交易所只移除该交易所。

### 逐行操作

| 图标 | 操作 |
|------|--------|
| 📊 | 打开结果图表（权益曲线、TWE 等） |
| **V8** | 使用 PB8 官方迁移器转换此结果的确切 `config.json`，并在 PBv8 Backtest 中打开 |
| 🗑 | 删除此单个结果 |

Configs 表格还为已保存的 V7 回测配置提供 **V8**。两种转换都保持 V7 源不变，并将完整配置传递给 PB8。转换结果时，PBGui 在迁移前从其线性市场 `fills.csv` 数据派生有效的 maker 和 taker 费率，防止规范化结果默认值替换 V7 实际使用的交易所费用。迁移前，PBGui 省略已退役的仅实时执行字段，将 `backtest.aggregate` 规范化为 `backtest.reducer`，并在重复的单一交易所已匹配 `backtest.exchanges` 时移除它。PB8 官方迁移后，PBGui 移除与策略不兼容的优化器覆盖，规范化固定运行时覆盖路径，冻结已禁用的机器人方向，并恢复 V7 的隐式正阈值 WEL/TWEL 执行器行为。如果 PB8 的 `bounded` WEL 超额模式会减少 V7 的头寸规模，受影响的 Long/Short JSON 会被标记，Save 保持阻止，直到用户明确选择 `legacy_raw` 以保持 V7 对等或 `bounded` 以获得 PB8 安全上限。正的 `minimum_coin_age_days` 也会被标记，因为 PB7 使用全局币种年龄而 PB8 使用交易所特定的市场年龄；用户必须为 PB7 数据覆盖选择 `0` 或保留原值用于 PB8 的年龄门槛。确定性更改记录为 `ok_with_adjustments`；冲突保持为手动审查阻止项。每次成功转换都会打开一个未保存的 PB8 Backtest 编辑器草稿，绝不会自行创建或替换 V8 配置。迁移报告保持附着在草稿上，只有用户显式单击 **Save** 或 **Save & Queue** 后才写入配置旁边。Backtest 审查排除 Live 和 Optimize 发现，但保留策略 Bot 发现，因为它们影响模拟结果。如果存在真正上下文相关的字段，草稿会将可用结构化字段标记为红色；无效输出保持阻止。

### 结果图表

单击行打开功能完整的图表面板，包含：
- **Equity curve**（对数刻度切换）
- **Price (PBGui MarketData)** 选择器，将一个结果交易所/币种收盘价序列作为柔和的点线叠加在对比的第二 Y 轴上；覆盖范围根据可见权益图表范围评估，部分或不可用数据显示在选择器旁边，权益图表保持可见
- **PnL** 随时间变化，按符号分组，并按权威成交时间戳扣除记录的交易费用显示净值
- **TWE**（总钱包敞口）图表
- **Hedged PnL**（如可用）
- 完整的**分析指标**表
- **Config JSON** 查看器

使用 **📌 Pin** 在浏览其他结果时保持图表可见。
使用 **📈 Compare** 在一个图表上叠加多个结果。使用 **Version: Both** 时，PBv7 和 PBv8 结果可以一起选择；PBGui 从各自的匹配后端加载每个权益文件，并用其版本标记图表系列。

### Re-backtest 模态框

从 **🔄 Backtest** 工具栏按钮可用。选项：

| 选项 | 说明 |
|--------|-------------|
| **start_date / end_date** | 覆盖重新运行的日期范围 |
| **starting_balance** | 覆盖初始余额 |
| **Exchange(s)** | 覆盖要使用的交易所 |
| **📂 Use PBGui Market Data** | 勾选时，将 `ohlcv_source_dir` 设置为 PBGui 管理的数据路径 |

对于归档结果，这些控件最初使用归档 `config.json` 中存储的值，包括结束日期和行情数据选择。清除 **Use PBGui Market Data** 是显式覆盖，排队任务启动时不会被全局 Backtest 设置替换。

日期字段使用与 Backtest 编辑器相同的可见日历按钮和 PBGui 日期选择器，而不是浏览器原生日期图标。

---

## Archive 面板

社区和个人配置存档存储为 Git 仓库。PBGui 将选为 **My Archive** 的存档视为可写。其他存档的内容只读：你可以浏览、导入、比较、重新回测和拉取远程更新，但 PBGui 不添加、重命名、删除、提交或推送它们的条目。克隆有本地更改时，Pull 会在联系远程前被阻止；请先在 **My Archive** 中推送或以其他方式解决更改，而脏的外部克隆保持不动。

### Archive 列表视图

| 按钮 | 操作 |
|--------|--------|
| **⬇ Pull All** | 从所有已配置存档拉取最新提交 |
| **⬆ Git Push** | 提交并将 **My Archive** 的更改推送到其远程 |
| **+ Add Archive** | 按名称和 Git URL 克隆新存档 |
| **⚙ Setup** | 选择 **My Archive**、Git 身份、令牌、自动拉取间隔和 README 文本 |
| **📋 Log** | 在浮动面板中打开存档同步日志 |

单击存档行打开并浏览其结果。计数在可用时来自 `pbgui/archive_manifest.json`，清单缺失或无效时回退到只读文件系统扫描。

PBGui 从 PB7 `config_version` 派生存档目标；没有手动可编辑的存档路径。回测结果存储在 `pbgui/configs/{config_version}/backtests/` 下，Optimize 配置存储在 `pbgui/configs/{config_version}/optimize/` 下。缺失或无效版本使用 `unknown` 目录加内容指纹以避免冲突。

**My Archive** 干净时，PBGui 在其面板打开时迁移有界的旧结果批次，并在添加或推送内容前检查完整迁移。脏工作树或失败的 Git 状态会阻止迁移而不丢弃现有更改。状态行报告旧条目是否仍然存在或迁移更改是否仍需要推送。

### Archive 内容视图

视图有 **Backtests**、**Optimize Settings** 标签页，**My Archive** 还有 **Schedules** 标签页。

**Backtests** 标签页有自己的 **Columns** 选择器。其选择与本地 Results 面板分开存储，因此紧凑的存档比较不会更改正常的 Results 表格。

| 按钮 | 操作 |
|--------|--------|
| **🏠 Archives** | 返回存档列表 |
| **🔄 Backtest** | 将所选配置作为新回测重新运行 → 切换到 Queue |
| **▶ Add to Run** | 创建实时运行 |
| **📈 Compare** | 添加到比较视图 |
| **🧮 Balance** | 在 Balance Calculator 中打开所选结果 |
| **🧬 Score Preview** | 预览存档评分而不写入存档 |
| **🗑 Delete Selected** | 只从 **My Archive** 移除所选结果 |

额外的 **My Archive** 操作包括重命名配置组、**Retest & Replace**、重建评分、压缩 Git 历史、移除重复项和 **Remove Liquidated**。Liquidated 清理始终显示干运行结果，并要求在验证删除前显式确认。计划重测只有在成功的非 liquidated 重跑后才能替换归档结果。

**Optimize Settings** 标签页可以从任何存档查看或导入归档的 Optimize 配置。如果本地名称已存在，选择 **Overwrite**、**Import as Copy** 或 **Cancel**。添加或删除归档的 Optimize 配置仅限于 **My Archive**。重新导出相同内容会复用现有的指纹路径和元数据，而不是创建另一个编号副本。

---

## Legacy 面板

**Legacy** 面板用于存在于 `pb7/backtests/*` 下但不在正常 PBGui 管理的 `pb7/backtests/pbgui/*` 树中的旧或放错位置的结果文件夹。

当回测在磁盘上完成但没有出现在正常 **Results** 面板中，因为它被写入 `pb7/backtests/combined/...` 等旧位置时，使用此面板。

### 工具栏操作

| 按钮 | 操作 |
|--------|--------|
| **↻ Refresh** | 重新扫描旧结果文件夹 |
| **🔄 Backtest** | 将所选旧配置作为新的排队回测重新运行 |
| **▶ Add to Run** | 从所选旧配置创建实时运行 |
| **📈 Compare** | 在共享比较图表中叠加所选旧结果 |
| **🗑 Delete Selected** | 从磁盘删除所选旧结果文件夹 |

### 说明

- 表格支持与 **Results** 和 **Archive** 相同的行选择和拖动选择行为。
- 当旧配置中不再有原始配置名称时，结果名称可以从目录路径推断。
- 使用 **🔄 Backtest** 将旧运行移回正常的 PBGui 管理工作流。

---

## 典型工作流

### 运行新的回测
1. **Configs** → **+ New Config** → 填写配置 → **Add to Queue**
2. **Queue** → **⚙ Settings** → 设置 CPU、启用 **Autostart** → **Save**
3. 观察状态徽标从 `queued` → `running` / `backtesting` → `complete` 变化
4. 单击任务行上的 📜 在浮动面板中观看实时日志
5. 完成时单击 📊（绿色）→ 跳转到 Results

### 重新运行/调优结果
1. **Results** → 选择结果 → **🔄 Backtest** → 调整日期/余额 → **OK**
2. **Queue** → 监控进度

### 将回测结果转为优化草稿
1. **Results** → 选择单个结果 → **🧬 Optimize from Result**
2. PBGui 直接打开 FastAPI Optimize 编辑器，而不是配置列表
3. 导入的草稿预加载 `Starting Seeds = self`，因此优化运行从该配置本身开始

### 使用社区配置
1. **Archive** → **⬇ Pull All** → 单击进入存档 → 选择配置 → **🔄 Backtest**
2. **Queue** → 监控；或启用 Autostart
3. 完成后 → **Results** 分析

### 比较多个结果

AI 助手还可以在此 Results Compare 视图中打开确切受管的 PB7 回测资源。PBGui 对完整加载的结果列表唯一解析每个安全选择器，选择匹配行，并使用相同的现有比较图表，而不是通用的 UI 点击序列。
1. **Results** → 选择结果 → **📈 Compare**
2. 比较图表打开，显示所有所选权益曲线叠加

### 释放磁盘空间（HLCVS 缓存）
1. **Queue** → **⚙ Settings**
2. 启用 **HLCVS Cache Cleanup**，设置 **Retention** 和 **Check interval**
3. 单击 **🧹 Clean Now** 立即清理——toast 消息报告释放的 MB
4. **Save** 持久化自动计划
