# PBv7 优化

**PBv7 Optimize** 页面现在作为独立的 **FastAPI + Vanilla JS** 页面打开。
它允许你通过 FastAPI 工作器流程创建、排队和检查 Passivbot v7 优化。
顶部 **PBv7** 导航可直接在 FastAPI **Run**、**Backtest** 和 **Optimize** 页面之间切换。
页面由四个侧边栏面板组成：

| 面板 | 用途 |
|-------|---------|
| **Configs** | 搜索、多选、编辑、复制、删除和排队已保存的优化配置 |
| **Queue** | 监控排队和运行中的任务、打开队列设置并检查日志 |
| **Results** | 浏览已完成的优化结果集 |
| **Paretos** | 检查属于一个结果集的 Pareto 文件 |

同一页面也是 PBv8 Optimize 编辑器。版本适配器保持 PB7 行为不变，而 PB8 从已安装的 PB8 检出加载其策略架构、优化器元数据、队列、结果、原生 OHLCV 工具和运行时控件。PB8 支持 `trailing_martingale`、`ema_anchor` 和 `trailing_grid_v7`；在它们之间切换会保留每个已定制的非活动策略块。

---

## Configs 面板

显示 `data/opt_v7/` 中所有已保存的优化配置。

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **New Config** | 在结构化编辑器中打开新配置 |
| **Edit Selected** | 在编辑器中打开恰好一个所选配置 |
| **Duplicate** | 以新名称复制所选配置 |
| **Import Config** | 从文本、本地文件或 Backtest Archive 导入 JSON |
| **Add to Archive** | 使用 PB7 版本化布局将所选配置导出到配置的 **My Archive** |
| **Queue Selected** | 将所有所选配置加入队列 |
| **Delete Selected** | 删除所有所选配置 |

存档导入在编辑器打开前保存为本地 Optimize 配置。如果请求的本地名称已存在，PBGui 提供 **Overwrite**、**Import as Copy** 或 **Cancel**；复制选项选择一个空闲名称并相应调整 `backtest.base_dir`。归档源保持不变，包括只读的社区存档。

**Add to Archive** 仅在 Backtest 页面上配置了可写的 **My Archive** 时可用。PBGui 保留或注入 `config_version`，在导出前迁移干净的旧版自有存档，并复用相同的已归档配置及其原始元数据，而不是创建重复的编号副本。

打开现有优化配置并在保存前更改 `config_name` 时，PBGui 现在将该编辑器状态以新名称保存为新配置文件。最初打开的配置保持不变；这是另存为新操作，而不是重命名旧文件。

使用搜索字段按配置名称过滤。配置行支持与 Backtest 相同的单击拖动多选模式，右侧的操作是紧凑的图标按钮。

每个 PBv7 配置行还提供 **V8**。它运行 PB8 的官方 Optimize 配置迁移，并将结果作为短暂的未保存预览在共享的 PBv8 Optimize 编辑器中打开。转换本身不创建或替换任何 PB8 bundle。迁移报告保持附着在预览上，只有用户显式保存时才持久化；未解析的 PB8 字段仍会停止迁移，而不是被猜测。

PBv7 Pareto 行为单个候选配置提供相同的 **V8** 操作。只有受管 PB7 结果根目录内的 Pareto JSON 文件被接受。

### 结构化编辑器

创建或编辑配置会将列表替换为专用编辑器视图，并显示编辑器侧边栏，类似 Backtest。
编辑器使用与 Backtest 和 Run 编辑器相同的响应式 8 列字段网格、弹出日期选择器和鼠标驱动的多选组件。
悬停虚线下划线字段标签可查看该设置的内联帮助提示。

| 按钮 | 操作 |
|--------|--------|
| **Home** | 返回配置列表 |
| **Save** | 将配置保存到 `data/opt_v7/{name}.json` |
| **Save and Queue** | 保存配置并立即入队 |
| **🔎 Apply Filters** | 在所有选定交易所应用 `market_cap`、`vol/mcap`、Tags、`only_cpt` 和 `notices_ignore`，并用组合结果替换 Long/Short approved 和 ignored 列表 |
| **🧭 OHLCV Readiness** | 打开可拖动、可调整大小的浮动窗口，为当前优化配置运行 PB7 支持的只读预检，显示批准的币种集是本地就绪、可从旧版 OHLCV 数据导入、启动时会获取，还是被持久缺口阻止；列表评估 `approved_coins_long` 和 `approved_coins_short` 的并集，每个条目现在显示它来自 `long`、`short` 还是两者。如果 PB7 会获取缺失范围，窗口还提供 **Preload OHLCV Data** 在排队前于后台预热缓存，预加载启动时自动跳转到预加载任务日志区段，从活动的 archive/ccxt 下载行显示真实的日志派生进度行以及持续时间、PID、日志计数器和最后更新详情，通过移动的请求游标跟踪 CCXT 进度，而不是在交易所返回比请求更新的 K 线时跳到 100%，使用与就绪检查相同的预热调整有效开始时间，使预加载后刷新不再把预热天数甩在后面，将在请求窗口之后才上市的市场分类为太年轻而不是假装可以获取那些更旧的 K 线，从预加载任务中修剪此类币种，下载器活动时提供 **Stop Preload** 操作，为浮动面板提供右上角的适应浏览器窗口控件，保持日志尾部运行而不跳回顶部，并在新的就绪检查替换前保持完成的预加载结果可见 |

**Raw Config JSON** 部分现在与 Backtest 和 Run 一致：在原始 JSON 中键入会自动同步回结构化字段，结构化编辑自动重建原始 JSON，无效 JSON 实时高亮并带基于行的错误揭示。

只存储最小 `backtest` + `optimize` 块的旧优化文件现在也可以重新在编辑器中打开。PBGui 在将配置交给 PB7 准备管道前，从当前优化模板填充缺失的基础分区，因此旧版队列候选不再仅仅因为以精简存根保存而失败。

`btc_collateral_ltv_cap` 现在也与 Backtest 一致：PB7 存储 `null` 时表单显示 `0`，保存 `0` 映射回底层的无限债务 `null` 值。

主编辑器区域：

| 区域 | 说明 |
|------|-------------|
| **Top row** | 优化配置的名称、交易所和日期范围 |
| **Market & Universe** | 初始余额、K 线间隔、带 `PBGui Data` 快速填充按钮的 OHLCV 源、BTC 抵押上限、`hsl_signal_mode`、市场过滤器、approved/ignored 币种和 `coin_sources` |
| **Optimization** | 共享的 Suite 编辑器加 `Scoring`、`Limits`、`Bounds & Overrides` 和后端特定的优化器控件 |
| **Run Settings** | 起始种子、迭代次数、CPU、Pareto 保留、日志、内存快照、输出节流、有效数字舍入和结果持久化开关 |
| **Additional Parameters** | 始终可见的未知 `optimize.*` 设置展开器；不存在时显示空状态提示，而 `optimize.backend`、`optimize.pymoo.*`、`compress_results_file` 和 `write_all_results` 等规范后端字段保留在各自的专用分区 |
| **Raw Config JSON** | 保存时使用的完整配置基础对象，未触碰的分区保持保留，带自动双向同步和实时验证 |

编辑器现在只保留三个可见的主分区标题：**Market & Universe**、**Optimization** 和 **Run Settings**。目标是减少标签噪音，同时保持流程清晰：先定义数据范围和币种宇宙，然后是优化器搜索空间，再是运行时设置。这也与页面的技术依赖一致：Pymoo `auto` 从当前评分目标数解析有效算法，Pymoo 变异 `auto` 从活动边界数派生。

过滤器值在单击 **Apply Filters** 前只是配置元数据。仅保存会保留数字，但不会重新计算显式的 approved/ignored 列表。

在 PB8 上，`polish_percentage` 显示为常规百分比，但保存为 PB8 的小数 `--polish-pct` 值，因此编辑器中的 `20` 在启动时变成 `0.20`。PB8 还保留自动 pymoo 种群大小：NSGA-II 使用其原生 `250` 默认值，NSGA-III 用 PB8 的 `500` 预算派生参考方向。编辑已知结构化控件时，未知的未来 `fixed_runtime_overrides` 和非活动策略块保留在原始配置中。

**Run Settings** 中的 `n_cpus` 输入以运行 PBGui/Optimize 的主机的 CPU 数为上限，因此结构化编辑器不能请求超过该机器工作进程数的数量。

第一个表头行现在以 `config_name` 开头，然后是 `exchanges`，因为命名优化配置通常是选择市场和测试窗口前的第一个有意义的输入。

`end_date` 字段现在保留字面的 `now` 标记，当配置使用滚动今天语义时，不会仅仅通过打开和保存编辑器就将其实体化为今天的固定日期。

**Starting Seeds** 设为 `self` 时，该分区直接显示种子配置，带 `total_wallet_exposure_limit` 和 `n_positions` 的快速控件以及完整的 `bot.long` 和 `bot.short` JSON 编辑器。为 `path` 时，`seed_path` 字段紧挨 `seed_mode` 且下方没有多余的辅助行，控件保持对齐。`none` 和 `path` 模式隐藏配置块，因为这两种模式不从当前配置播种。

`bot.long` 和 `bot.short` JSON 编辑器现在也镜像 Backtest/Run 的中和反馈：Passivbot 准备管道规范化或注入的字段通过相同的琥珀/红行高亮和图例徽标内联标记，保存前更容易审查多空差异。

**Scoring** 展开器现在直接镜像 PB7 的规范目标格式：现有目标显示为显式 Metric / Goal 行，可单击行内联编辑，新目标在单击 **Add** 前保持隐藏。创建时在相同的内联表格布局中打开，但 Type / Metric / Currency 选择器并排排列在单行中而不是垂直堆叠，因为评分行有足够的水平空间容纳全部三个控件。PB7 定义已知的 Passivbot 默认值会被预选，而没有 PB7 默认值的指标仍会在保存的配置中保持显式目标。

**Limits** 展开器现在遵循既定的优化工作流，同时匹配当前 PB7 架构：现有限制显示在紧凑表格中，列为 Metric / Penalize If / Stat / Value / Enabled，可单击行内联编辑。新限制在单击 **Add** 前保持隐藏；只有此时才会出现相同的内联表格行用于创建，没有单独的 "Add New Limit" 块或下方辅助文本。堆叠的 Metric 选择器保持分组在左侧为 Type / Metric / Currency，`Enabled` 位于行操作旁边而不是中间。编辑器现在暴露完整的规范操作符集（`>`、`>=`、`<`、`<=`、`==`、`!=`、`outside_range`、`inside_range`、`auto`），支持 `median` 作为聚合统计，并提供来自 `docs`、`schema` 和 `src` 的较新 PB7 指标族，如基于策略 PnL 重定基的目标、HSL/硬止损指标、交易亏损指标、胜率、纸面亏损/敞口比率和 `backtest_completion_ratio`。

**Bounds & Overrides** 展开器现在用结构化滑块布局替换旧的原始 `optimize.bounds` 文本框：**Bounds long** 和 **Bounds short** 并排，每个边界行使用范围滑块，当前 Min / Max 值显示在其上方，右侧有紧凑的 `step` 输入，以及每行的 **Fixed** 复选框，将该边界键存储在 `optimize.fixed_params` 中。边界名称、`step` 和 `fixed` 标签通过虚线下划线内联标签文本直接携带悬停帮助，该行没有额外的问号按钮。当两个滑块手柄推得非常近时，Min / Max 标签会自动分离，数字保持可读。如果两个拇指真正位于完全相同的值上，下一次拖动方向决定 PBGui 移动哪个手柄：向左拖动选择下界，向右拖动选择上界。如果拇指只是非常接近，如 `0 | 1`，PBGui 现在优先选择被点击的一侧，而不是强制方向选择，因此左手柄仍然可以自然地向右移动，右手柄也可以向左移动。边界精度现在首先遵循每行的 `step`；如果没有设置边界特定步长，PBGui 再次使用内置的按参数滑块默认值，只有未知边界回退到 `round_to_n_significant_digits`，以 `5` 为最终回退。边界步长存在后，实时范围输入立即采用该步长，拖动滑块立即遵循输入的增量，而不是等待完整编辑器重建。直接的 Min / Max 芯片编辑也遵循相同的显式步长：输入时修剪多余的十进制位，提交的值吸附到滑块本身使用的同一步长网格。可见的 Min / Max 芯片只将该精度用作上限并修剪尾部零填充，因此 `0`、`10` 和 `0.1` 的步长值保持显示为 `0`、`10` 和 `0.1`，而不是 `0.00000` 等填充形式。

编辑器的优化器部分现在感知后端，而不是把所有优化器键当作一个扁平块。通用表头行只保留配置身份字段，而 `optimize.backend` 现在只位于 **Scoring**、**Limits** 和 **Bounds & Overrides** 之后，因为这些分区直接影响后端特定的自动显示。选择该后端开关可在规范的嵌套 Pymoo 控件和仅 DEAP 的旧版控件之间切换。当较旧的优化配置还没有显式 `optimize.backend` 但仍带有旧版 DEAP 字段时，编辑器现在将其作为 `deap` 打开，而不是静默回退到 `pymoo`。在后端之间切换现在还在编辑器中执行显式迁移步骤：种群大小和 eta 值等共享字段被复制过去，无法从 pymoo 派生的仅 DEAP 字段重置为清晰的 PB7 默认值，非活动后端的过期字段在保存时再次移除，因此配置不会不断漂移到混合的 DEAP/Pymoo 状态。对于 Pymoo，专用分区现在直接编辑 `optimize.pymoo.algorithm`、`optimize.pymoo.shared.*` 和 NSGA-III `ref_dirs` 键，而编辑器显示 PB7 从当前目标数实际运行的有效算法，并保持变异自动模式与活动边界数对齐。这使规范 PB7 字段远离 **Additional Parameters**，并避免在 PBGui 中维护第二个静态优化器选项列表。

Raw JSON 同步现在也从解析的配置本身重新计算该旧版后端推断，因此移除旧的仅 DEAP 键或在原始编辑器中添加显式 `optimize.backend` 后，过期的 `deap` 提示不会残留。

**coin_sources** 展开器现在使用与 Backtest 相同的芯片交互模式，而不是旧的 PBGui JSON 块：选择交易所，从加载的符号列表中选择币种，编辑器将覆盖存储在 `backtest.coin_sources` 下。加载时旧版 `pbgui.coin_sources` 值会折叠进结构化编辑器，过时的 PBGui `market_settings_sources` 字段不再显示在那里。

**Suite Mode** 部分现在复用与 Backtest 相同的共享组件，而不是让仅套件配置滞留在旧版页面。这意味着 `backtest.suite_enabled`、`backtest.scenarios` 和 `backtest.aggregate` 现在可以在 FastAPI Optimize 中直接编辑和保存，包括内置模板、场景覆盖行、按场景的 `coin_sources` 和聚合指标规则。

**Additional Parameters** 展开器保留给 GUI 尚未处理的优化器设置，现在始终在编辑器底部保持可见。如果 `optimize.*` 包含未知键，它们会以键入字段或 JSON 编辑器形式出现在那里，而不是消失在原始编辑器后面；如果没有，展开器显示一个小空状态提示，仍然清楚额外优化键会出现在哪里。已有专用控件的已知字段，如 `round_to_n_significant_digits`、`compress_results_file` 和 `write_all_results`，保留在正常分区中而不是在那里重复。那里的更改像结构化编辑器的其余部分一样流入保存的配置。

重要配置点：

| 分区 | 说明 |
|---------|-------------|
| **Exchange / Symbols** | 要优化的交易所和币种 |
| **Date range** | 优化模拟的开始和结束日期 |
| **Iterations** | 优化器代数 |
| **CPU cores** | 一次优化运行内的并行工作进程 |
| **Market & Universe** | 在优化器特定设置之前分组初始余额、K 线间隔、OHLCV 源、BTC 抵押上限和完整币种宇宙控件 |
| **Run Settings** | 在搜索设置定义后容纳起始种子、迭代次数、CPU、Pareto 保留、日志、节流、舍入和结果持久化 |
| **Logging level** | 使用与 Run 相同的选择器，标签为 `warning`、`info`、`debug` 和 `trace`，同时仍保存 PB7 的数字 `0`-`3` 日志级别 |
| **hsl_signal_mode** | PB7 派生的优化/回测评估期间账户级 HSL 行为选择器：`pside` 保持多空信号分离，`unified` 共享一个组合信号 |
| **Backend** | 只有在目标、限制和边界已经定义后，才从 PB7 支持的优化器后端选择 `optimize.backend`，使后端特定的自动行为反映当前搜索空间 |
| **Pymoo algorithm** | 使用规范的 `optimize.pymoo.algorithm` 设置，值为 PB7 的 `auto`、`nsga2` 和 `nsga3`，并显示从当前目标数解析的有效算法 |
| **Population size** | 对于 pymoo/NSGA-III，`auto` 现在是只读显示，显示从活动参考方向派生的有效数值种群大小。当 NSGA-III 使用小于当前参考方向最小值的显式种群时，编辑器将其提升到 PB7 运行时实际有效的大小，而不是在字段中留下误导性的较小值。对于 pymoo/NSGA-II，编辑器强制显式种群大小，而不是让该矛盾保持可编辑。对于 `population_size = null` 的旧版 DEAP 配置，编辑器将字段重新打开为 `500`，因为这是 DEAP 实际使用的 PB7 运行时回退 |
| **Pymoo shared params** | `optimize.pymoo.shared.crossover_eta`、`crossover_prob_var`、`mutation_eta`、`mutation_prob_var` 和 `eliminate_duplicates` 现在有专用控件，而不是位于 Additional Parameters 下；`mutation_prob_var_mode` 为 `auto` 时，编辑器显示派生的 PB7 值 `1 / n_params` 作为只读显示，而不是留下空白禁用字段 |
| **NSGA-III ref_dirs** | NSGA-III 活动时，`optimize.pymoo.algorithms.nsga3.ref_dirs.method` 和 `n_partitions` 现在结构化暴露；PB7 只暴露一个受支持的 `ref_dirs_method` 时，编辑器将其显示为固定的只读值而不是无意义的下拉框，`ref_dirs_n_partitions_mode` 为 `auto` 时，编辑器显示 PB7 派生的分区数作为只读值，而不是空白的禁用字段 |
| **Backend switching** | 在 `pymoo` 和 `deap` 之间切换现在复制重叠字段，包括 DEAP `crossover_probability` → pymoo `crossover_prob_var` 映射，在不存在直接 pymoo 映射处应用 PB7 DEAP 默认值，并在保存时从非活动后端移除过期字段 |
| **crossover_probability + mutation_probability** | DEAP 编辑器将组合概率保持在 `1.0` 或以下，匹配旧版优化器行为 |
| **Bounds & Overrides** | 结构化编辑优化器 Min / Max / Step 边界，将单个边界标记为 `fixed_params`，将 TP-grid / lossless-close 搜索约束与边界一起保留，并管理两个 PB7 保留的 HSL `fixed_runtime_overrides` 字段 |
| **round_to_n_significant_digits** | 在优化参数值写回保存的配置和产物之前，将其舍入到配置的有效数字位数 |
| **Pareto max size** | Pareto 前沿保留的最大配置数 |
| **Suite Mode** | 从 FastAPI 编辑器启用 PB7 多场景优化，并将套件配置存储回 `backtest.suite_enabled`、`backtest.scenarios` 和 `backtest.aggregate` |
| **Scoring** | 目标函数。PB7 将它们存储为显式的指标/目标对，FastAPI 编辑器现在直接暴露这些对，带专用的 Metric/Goal 控件，而不是要求 JSON 编辑 |
| **Starting Seeds** | `none` 禁用播种，`self` 从正在排队的配置播种并直接显示种子配置，`path` 将显式文件或目录传入 Passivbot `--start` |

---

## Queue 面板

显示 `data/opt_v7_queue/` 中所有待处理、运行中和已完成的优化任务。

表格列：

| 列 | 说明 |
|--------|-------------|
| **Name** | 源配置名称 |
| **Exchange** | 为此任务配置的交易所 |
| **Status** | 当前状态：`queued`、`running`、`optimizing`、`complete`、`error` |
| **Created** | 队列条目创建时间 |
| **Actions** | 用于启动、停止、重启、日志、重新打开配置、删除的紧凑图标操作 |

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **Delete Selected** | 移除所选队列项，包括已完成条目，匹配 Config 列表模式 |
| **Settings** | 打开队列设置对话框，用于 `Autostart`、自动启动应执行的 CPU 值以及 `Use PBGui Market Data` 启动覆盖 |

使用每个队列行最左边缘的细抓取条通过拖放重新排序队列。同一启动条在所选行上显示蓝色标记，但在未选行上保持隐藏，直到你悬停该左边缘，因此队列看起来不会永久预选。PBGui 将该行顺序持久化到磁盘，自动启动在挑选下一个排队的优化任务时也遵循相同的自上而下顺序。
选择多个队列行并开始拖动其中一个所选行时，PBGui 现在整体移动整个所选块。被抓取的项通过从真实队列行克隆构建的拖动预览保持可见，光标携带你在队列中看到的相同行布局，而不是通用的浏览器拖拽幽灵。
跨行拖动以添加或移除选择现在跟踪光标下实际的行。取消选择中间子集时，如果指针短暂滑入行间或滑出该小块，PBGui 保持最后一个有效行锚点，而不是突然将取消选择扩展到更大的范围。
PBGui 还在每次拖动更新时从鼠标按下时捕获的行状态重新计算实时队列选择。如果你短暂将一行拖得太远然后再次缩小选择或取消选择范围，最终范围之外的行会被恢复，而不是意外丢失。
实时队列 WebSocket 更新不再在该拖动选择中间重新渲染表格。PBGui 现在等到鼠标交互结束才应用最新的队列刷新，因此选择行再次感觉稳定，就像 Results 表格一样。

对于 PB8，永久启动错误只将受影响的行移动到可操作的错误状态，因此损坏的第一行不能阻止后续自动启动条目。更新/运行时锁竞争保持排队重试。启动会协调过期的 PID、快照、启动和运行器产物，而不向未验证的进程发信号，**Repair** 从所选受管配置重建不可变的队列快照。PB8 队列控制器在 **Services Monitor** 中可见；停止它会暂停调度，但不会终止分离的优化器。

### 日志查看器

每个队列行都有一个 **Log** 操作。
它打开共享的浮动日志查看器，并从 `data/logs/optimizes/` 流式传输本地文件。
对于确切选择的队列行或从另一个 Optimize 面板可见的当前运行优化器，PBGui AI 可以调用页面宣告的 `show_log` 操作，它调用相同的现有 `openLogPanel` 函数。跨页面请求自动导航到 Optimize，并保持待处理直到队列数据加载。
**Edit** 操作打开该队列行引用的实际配置文件，即使行标签与存储的配置文件名不同。
如果较旧的队列行仍指向已删除的配置路径，但 PBGui 找到匹配配置，匹配配置模态框可以就地修复该现有队列条目。选择正确的候选，PBGui 将队列行更新为所选配置路径加新的嵌入式快照，因此你不必删除该行并手动重新排队。
较新的队列项也保留嵌入式配置快照。如果原始配置文件后来被删除，PBGui 仍可以从其存储的快照重新打开或启动该排队任务，而不是在过期路径上失败。将编辑后的配置以不同的 `config_name` 保存现在会创建新配置，并保持旧配置的现有队列行不变。
如果较旧的队列行早于快照，且其原始配置路径已消失而多个匹配配置仍然存在，PBGui 现在打开一个选择模态框，为这些候选提供直接的 **Open** 按钮，而不是只闪现一个简短的错误 toast。
PBGui 现在还拒绝为配置仍不可启动的队列行执行 **Requeue**。这些行保持当前的 `error` 状态和现有优化日志，直到配置真正修复，而不是被重置为没有可运行任务支撑的误导性 `queued` 状态。

队列本身不再需要侧边栏中的手动刷新按钮。它持续从实时 WebSocket 源更新，**Settings** 对话框现在拥有自动启动控件，而不是永久的侧边栏复选框。PB7 和 PB8 使用这一个共享的设置配置和一个全局自动优化器槽位，因此在任一页面保存对话框都会控制两个队列。启用自动启动时，PBGui 在启动该项前立即将启动副本上的 `optimize.n_cpus` 设置为配置的队列 CPU 值。如果同时启用了 `Use PBGui Market Data`，PBGui 还会设置启动副本上的 `backtest.ohlcv_source_dir`，无论配置编辑器中存储的值是什么。
日志仪表板摘要现在使用 **CPU** 字段表示配置的优化器核心数。悬停该 CPU 值会打开类似 htop 的按核视图，包含内存、swap 和负载平均值详情，保持打开时该悬停会持续实时更新。
如果优化器启动器 PID 过期而实际 `optimize.py` 任务仍然存活，PBGui 现在将队列行重新附着到实时进程，使条目保持可见为运行中，**Stop** 仍会终止真实任务。
如果多个队列行指向同一配置，PBGui 现在只将实时进程绑定到其自身优化日志实际附着到该进程的行。其他行不再仅仅因为共享配置文件而继承相同的 `running` 状态。
Optimize 页面 toast 现在也追加到全局 PBGui 通知日志，因此页面中短暂显示的消息稍后仍可从右上角的通知铃重新打开。

---

## Results 面板

浏览 `pb7/optimize_results/` 中已完成的优化结果集。

工具栏和侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **Delete Selected** | 从侧边栏删除所有所选结果目录，匹配 Backtest 结果工作流 |
| **Search** | 按优化名称或结果文件夹过滤 |

任何优化任务运行时，此面板每几秒自动刷新，新写入的 Pareto 文件无需手动重新加载即可显示在 **Paretos** 计数中。

单击可排序表头可按 **Name**、**Result Directory**、**Paretos**、**Mode** 或 **Modified** 重新排序。

表格列：

| 列 | 说明 |
|--------|-------------|
| **Name** | 从结果检测到的配置名称 |
| **Result Directory** | 结果文件夹名称 |
| **Paretos** | 找到的 Pareto JSON 文件数 |
| **Mode** | 显示结果是常规单结果优化集还是套件结果，包括套件场景数 |
| **Modified** | 结果集的时间戳 |
| **Actions** | 用于 Pareto 文件列表、完整 **Pareto Explorer**、原始 PB7 **Pareto Dash**、旧版 PB7 **3D plot**、从结果的 `pareto/` 目录继续优化以及打开第一个配置草稿的紧凑图标操作 |

紧凑的 **pareto list** 操作现在使用自己的文件夹风格图标，而 **🎯 Pareto Explorer** 恢复为单独的专用操作，匹配旧的结果表格布局，而不是用资源管理器图标重载列表按钮。从 Results 单击 **🎯 Pareto Explorer** 时，PBGui 停留在当前标签页并自动转发所选结果路径。之后返回 FastAPI Optimize 时，页面自动刷新其配置、队列和结果，Results 视图不会停留在缓存的空快照上。

Pareto Explorer 从快速的 `pareto/*.json` 视图切换到 **Load all_results.bin** 时，现在也将持久化的 PB7 Pareto 集保留在该较大样本中。PBGui 以与 PB7 命名 `pareto/<hash>.json` 文件相同的方式哈希完整的 PB7 结果条目，将这些已知的 Pareto 成员注入采样配置窗口，并保留这些官方 Pareto 标志，而不是重新计算仅子集的前沿。

**PB7 3D plot** 操作在该结果恰好暴露 3 个目标时，现在直接在当前 FastAPI 标签页内的大型模态框中渲染旧版 PB7 风格的交互式 3D Plotly 视图。这使原始 PB7 3D 视角与更丰富的 PBGui Pareto Explorer 页面保持区别，但避免打开单独的浏览器标签页。如果结果不提供有效的 3D Pareto 点，页面回退到带 PB7 原因的详情模态框，而不是只显示通用的启动 toast。

**PD** 操作在相同的大型模态窗口风格中打开 Passivbot 原始的 `tools/pareto_dash.py` 仪表板。PBGui 在 PB7 环境中启动 Dash 应用，只暂存所选结果，使原始运行选择器立即落在正确的运行上，并通过 FastAPI 源将其回传，因此你可以在不离开当前标签页的情况下使用原生 PB7 仪表板。

想要从较早结果集播种的新的优化运行时，使用 **Continue Optimize**。它用结果配置预填编辑器，并将 `seed_path` 指向该结果的 `pareto/` 目录。

想要将该结果的第一个 Pareto 配置作为草稿加载到编辑器而不添加任何种子元数据时，使用 **Open Config**。

PB8 结果操作只在其所需产物存在时启用。精确 **Resume Checkpoint** 需要兼容的可读检查点、非空 `all_results.bin`、`write_all_results` 和可恢复的配置；受管配置和队列项的创建是事务性的。优化器、延续队列项或 Pareto Dash 会话仍拥有结果时，PBGui 阻止删除。PB8 套件结果暴露命名的场景指标、`mean`、`min`、`max`、`std` 和 `median`，3D 视图规范化这些嵌套值而不修改原生结果文件。

---

## Paretos 面板

从 **Results → Paretos** 打开此面板。
它显示一个所选结果集的 Pareto JSON 文件。
切换到另一个结果集时，PBGui 立即清除之前的行，只显示新选择返回的候选。

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **Seed Selected** | 使用所选 Pareto 文件或由所选 Pareto 行构成的 bundle 作为 `seed_path` 打开新的优化草稿 |
| **Seed Whole Result** | 使用当前结果的完整 `pareto/` 目录作为 `seed_path` 打开新的优化草稿 |

优化任务仍在写入 paretos 时，打开的列表每几秒自动刷新。

工具栏控件：

| 控件 | 说明 |
|--------|-------------|
| **Mode chip** | 显示所选结果是常规结果、套件结果还是旧版 pareto 格式 |
| **Scenario** | 对于套件结果，在 **Aggregated** 和一个具体场景标签之间切换摘要 |
| **Statistic** | 对于聚合套件视图和常规单结果 paretos，在 `mean`、`min`、`max`、`std` 和 `median` 之间切换摘要统计 |
| **Columns** | 选择显示哪些可用的评分和比较指标。**Defaults** 恢复 Gain、配置的目标和 Drawdown；**All** 显示后端提供的每个紧凑指标。选择对 PB7 和 PB8 分别记忆。 |

表格列：

| 列 | 说明 |
|--------|-------------|
| **Name** | Pareto 文件名 |
| **Metric columns** | 用 **Columns** 选择的可排序列；可用比较指标包括 Gain、Drawdown、ADG、Sharpe、Sortino、Omega、盈亏比以及结果持久化时的权益/余额背离 |
| **Modified** | 文件修改时间 |
| **Actions** | 用于原始 JSON 视图或将一个 Pareto 文件直接用作新优化草稿起始种子的紧凑图标操作 |

对于套件结果，**Summary** 徽标现在跟随工具栏选择，而不是总是显示一个固定的聚合视图。这意味着你可以在 FastAPI 页面中直接检查聚合套件统计或一个具体场景，而无需切换到旧版 Optimize 页面。

**Use as Seed** 从当前结果配置打开新的优化草稿，并将 `seed_path` 指向该 Pareto 文件。

多选几个 Pareto 行时，**Seed Selected** 从恰好这些文件创建一个小种子目录，并将该目录用作 `seed_path`。

---

## 典型工作流

### 运行新的优化
1. 打开 **Configs** 并单击 **New Config**。
2. 填写结构化字段，需要时调整高级 JSON 分区，然后 **Save and Queue**。
3. 打开 **Queue**，想启用 **Autostart** 或设置队列 CPU 值则使用 **Settings**，使用 **Log** 观察进度。
4. 任务完成时，转到 **Results**。

### 探索结果
1. 打开 **Results** 并过滤到你想要的运行。
2. 单击 **Paretos** 检查生成的 Pareto 文件。
3. 使用 **View JSON** 原始检查，单击种子图标从单个 pareto 继续，或多选行并使用 **Seed Selected**。

### 调优现有配置
1. 在 **Configs** 中搜索配置并选择它。
2. 单击 **Edit Selected**。
3. 调整结构化表单或高级 JSON 分区，然后 **Save** 或 **Save and Queue**。

### 从较早的优化运行继续
1. 打开 **Results** 并找到要复用的结果集。
2. 单击 **Continue Optimize** 从完整 `pareto/` 目录播种，或打开 **Paretos** 使用 **Seed Whole Result** / **Seed Selected** 获得更多控制。
3. 需要时调整草稿，然后 **Save** 或 **Save and Queue**。
4. 新运行从保存的 pareto 种子开始，但它仍然是新的优化运行，而不是精确的检查点恢复。
