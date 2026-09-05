# PBv8 Backtest

PBv8 Backtest 独立于 PBv7 管理 Passivbot V8 配置和任务。PBGui 在保存或启动每个配置前，都通过当前安装的 PB8 加载器验证它。

页面渲染与 PBv7 Backtest 完全相同的页面模板和可视化配置编辑器。没有单独的 PB8 编辑器实现。PB8 特定行为仅限于路径/API 适配器、配置验证、进程运行器和结果数据。

PBGui 维护一个短的有界缓存，用于 PB8 模板和已验证的配置文件。API 重启后的第一次 PB8 操作可能仍需初始化隔离的 PB8 Python 运行时；后续的编辑器、队列和启动步骤复用规范结果，而文件签名检查会使更改过的配置失效。

## Configs

- **New Config** 从已安装的 PB8 版本加载默认值。
- Configs 表格显示活动的 PB8 策略，并支持按 Strategy 排序。
- 双击行或使用 **Edit** 打开 PBv7 使用的完整可视化编辑器，包括日期、交易所、费用、行情数据、币种过滤器、approved/ignored 币种、套件、币种覆盖、PB8 结果指标和市场设置覆盖、Long/Short JSON 以及 Raw JSON。
- **Queue** 或 **Save & Queue** 捕获已保存配置的不可变快照。
- 币种覆盖 JSON 文件和 `backtest.json` 作为单个配置 bundle 验证并发布。失败的保存会保持之前的配置和覆盖文件不变；移除覆盖引用会从 bundle 中移除其过时文件。
- PBGui 控制 `backtest.base_dir`，并将结果写入 `<pb8dir>/backtests/pbgui/<config>` 下。
- 已保存的 PBv7 回测配置、单个 PBv7 结果和 PBv7 Run 行提供 **V8** 转换。转换使用 PB8 官方的 `migrate-config-v7` 实现，并保持 V7 源不变。Backtest 配置/结果转换总是打开未保存的 PB8 编辑器草稿；转换本身绝不创建或替换已存储的 V8 配置。附着的迁移报告只在用户显式保存草稿时写为 `migration_report.json`。对于结果转换，PBGui 首先恢复 `fills.csv` 证明的有效线性市场 maker 和 taker 费率，并将每个更正记录在 `pbgui_result_fee_adjustments` 中。调用 PB8 前移除仅 PBGui 的元数据和过期的临时 `live.base_config_path` 值。官方迁移后，PBGui 移除与策略不兼容的优化器覆盖，规范化固定运行时覆盖路径，冻结已有零持仓和零敞口的机器人方向，并在正的 V7 阈值使其隐式活动时启用 V8 WEL/TWEL 执行器。真实的 `bounded` 与 V7 原始 WEL 规模差异成为保存前在 `legacy_raw` 对等与 PB8 安全上限之间必须做出的标记选择。正的 minimum coin age 同样要求在 `0`（PB7 数据覆盖）与原始值（PB8 的交易所特定年龄门槛）之间做出标记选择。安全更改使用报告状态 `ok_with_adjustments`；不明确的路径或冲突值在未保存草稿中保持标记供手动审查。

如果存在不支持或需手动审查的字段，迁移会停止。解决报告中的字段，而不是假设 V7 和 V8 行为相同。

## 编辑器

可视化控件和 JSON 同步直接与 PBv7 共享。对于规范 V8 配置，适配器在 `bot.<side>.risk` 下读写敞口和持仓控件；Long/Short 和 Raw JSON 编辑器保留所有嵌套 V8 分区，如 `risk`、`strategy`、`forager`、`hsl` 和 `unstuck`。导入和保存由已安装的 PB8 加载器准备，无效 JSON 阻止保存。即使已安装的 PB8 版本不认识某些字段，顶层 `pbgui` 对象下的 PBGui 自有元数据也保持不变。

常用资金和执行字段保持可见以便快速编辑。费用覆盖、`market_order_slippage_pct`、`filter_by_min_effective_cost`、`hsl_signal_mode` 和 `logging_level` 分组在 **Advanced execution settings** 下。

Long 和 Short 保持对齐以便比较：TWE（`total_wallet_exposure_limit`）和 `n_positions` 保持可见，而每一侧的 **Full Config JSON** 默认折叠。即使折叠，展开头在存在 JSON 错误或需要审查的参数状态时仍显示其 **Review** 指示器。

V8 使用现有的 PBGui 币种元数据、过滤器、套件、覆盖、日期选择器、验证、OHLCV 就绪和选择组件。市场身份本身来自 PB8 的官方解析器：短 ID 保持默认，而精确的作用域 ID 只在真实场所或乘数冲突时存储。导入的精确 ID 在 approved/ignored 列表、Suite 场景、Coin Sources、Market Settings 和 Coin Overrides 中保持无损。**Balance Calculator** 在 Information 下打开共享计算器并加载当前 PB8 配置，而 **Calc Balance** 内联运行相同计算。保存的配置、本地结果和 PB8 存档结果可以打开短暂的 PB8 Run 草稿。**Optimize from Result** 将所选结果作为 PB8 Optimize 草稿打开。**Refine Optimize Preset** 从所选结果构建嵌套 PB8 边界，并仅通过 PB8 API 路由 Save、Queue 和 Open Optimize 操作。**Strategy Explorer** 用 PB8 配置和稀疏覆盖打开共享的 PB7/PB8 可视化外壳；所选本地 PB8 结果还通过不透明草稿携带经过验证的已存储成交来源，用于原生 Compare。该结果传递首先选择已验证的源交易所、第一个带已存储成交的批准币种及其首次成交 UTC 时间。

**Apply Filters** 只选择解析到所选交易所上至少一个合格市场的 PB8 目录条目。PB8 无法无损解析的 CoinData 条目报告为不可用并被跳过，而不是在启发式币种名称下排队。

常用的 PB8 特定回测字段有结构化控件：

- **Market Settings Overrides** 出现在 `market_settings_sources` 下方。添加全交易所或交易所特定的币种行，并覆盖数量/价格步长、最小数量/成本和合约乘数。空白值继承自所选源；交易所特定行优先。当前 PBGui 版本不认识的字段原样保留。回测费用仍由上方专用的 maker/taker 费用覆盖控制，因为 PB8 在应用市场设置覆盖前解析它们。
- **Result Metrics** 保留在 **Additional Parameters** 内，因为它只控制终端和队列日志输出。**Default** 使用优化评分和限制隐含的指标，**All** 显示每个指标，**Custom additions** 使用从已安装 PB8 运行时加载的可搜索分类列表。完整指标在所有模式下都保持计算和保存。
- **minimum_coin_age_days** 保留显式的 `0`，包括 Pareto 到 Backtest 草稿。使用 `0` 禁用年龄门槛；空白或无效输入回退到 `30` 天。

**Additional Parameters** 包含 Result Metrics、只读的 PBGui 管理 `base_dir`，以及仅专家的 `hlcvs_data_dir` 和 `hlcvs_data_override_mode` 字段。准备好的数据集重放需要服务器端带有效清单的 PB8 数据集路径，通常保持 `null`；PB8 随后自动解析数据集。未来未知的顶层回测字段也出现在此回退分区中。

## Queue

V8 队列单独存储在 `data/bt_v8_queue` 下。**Start** 启动 `<venv_pb8>/bin/passivbot backtest <snapshot>`。**Stop**、**Restart**、**Delete** 和 **Clear Finished** 只影响 V8 队列项。

Queue 视图以排队、活动、完成和需要注意的任务计数器开始。主题化表格保持表头可见，窄屏时水平滚动，显示当前所选行数，并支持单击、单击拖动、**Enter** 或 **Space** 选择。逐行的启动、停止、重启、结果、日志和移除操作使用共享语义按钮颜色。

运行中的回测是独立任务。重启 PBGui 或更新 PB8 不会停止它们，它们也不阻塞更新。PB8 安装或更新期间，新启动保持排队并在之后继续。新启动总是使用当时可用的 PB8 安装；版本和 Git 提交记录在队列项上。

队列行的日志操作打开 `data/logs/backtests_v8/<queue-id>.log`。对于确切选择或运行中的队列项，PBGui AI 可以调用页面宣告的 `show_log` 操作，它调用相同的现有日志函数。跨页面操作导航到 PB8 Backtest，并在执行前等待其队列数据。右上角通知铃打开 `PBGui.log`，它持久化几秒后消失的短 GUI 通知和错误。技术性的 PB8 后端诊断在 `BacktestV8.log` 中单独可用。

从 Queue 侧边栏操作打开 **Settings** 以启用 **Start queued jobs automatically**、选择并行任务数并选择 **Use PBGui Market Data**。PB7 和 PB8 读写这一个共享配置。CPU 值一起限制两个版本的自动任务。行情数据选项在每次启动或重启前应用到不可变队列快照的新副本，因此更改它绝不会改变保存的配置。

Settings 对话框立即从当前状态打开。它在后台刷新主机的权威值，并只在可见控件未被触碰时更新它们。

对话框将控件分组为 **Queue concurrency**、**Automatic behavior** 和 **HLCVS Cache Cleanup** 分区。PB7/PB8 CPU 限制、Autostart 和 PBGui Market Data 保持共享设置；清理选项在启用清理前保持可见禁用，**Clean Now** 保留其受保护的在处理状态。

PB8 将可复用数据集存储在 `pb8/caches/hlcvs_data` 下，临时实体化运行存储在 `pb8/caches/ohlcvs/materialized` 下。清理与 PB8 的根操作锁协调，并保留活动本地运行、外来主机锁以及无法确定安全性的格式错误锁。只移除旧的未锁定运行或已确认本地所有者死亡的运行。**Clean Now** 结果报告保留了多少锁定目录。

## Results

AI 助手解析到确切受管的 PB8 回测资源后，可以通过相同的 Results **Compare** 视图打开它们：PBGui 清除过滤器、加载完整结果列表、要求每个安全结果选择器恰好匹配一行、选择这些行，并渲染现有的权益/余额比较图表。它不依赖通用按钮点击，也不暴露主机路径。

### 旧版结果

**Legacy** 列出在 PBGui 管理的 `backtests/pbgui` 命名空间之外、直接位于 `<pb8dir>/backtests/*` 下的有效 PB8 产物，包括较旧快照或直接 PB8 运行创建的普通 `combined` 输出。发现是只读的，从不跟随符号链接，扫描有界的目录数，并要求同时存在常规 `analysis.json` 和标识为 PB8 的配置。旧版产物通过现有 PB8 读取端点支持结果详情、图表、文件和 Compare。PB8 旧版结果隐藏 Rebacktest、Add to Run 和 Delete，因此仅仅发现外部产物不能修改或移除它。

编辑器侧边栏的 **Results** 按钮始终可用，并打开完整的未过滤结果列表，包括在编辑没有自己结果的新配置时。全局 Results 按最新优先以小页加载，并在每页后渲染，带实时的已加载/总数计数，而较旧行继续加载。队列行的绿色结果操作只请求其配置，并在打开 **Results** 前应用该过滤器。**Version** 过滤器默认为 PBv8，可以切换到 PBv7 或 **Both**。列表显示每个结果的版本、配置、活动 PB8 策略、交易所、运行目录和紧凑标量指标。默认的 `ADG USD`、`Sharpe USD` 和 `Worst DD USD` 列对 PBv7 和 PBv8 使用相同的未加权定义。加权的 PBv8 变体是单独的可选 `W USD` 列，因此混合行绝不会在指标定义不匹配下排序。可排序的 Strategy 列在可见 V8 行时出现，并在纯 V7 视图中保持缺失。最终余额和权益使用 PB8 的 `balance_and_equity.csv` 或压缩 `.csv.gz` 产物中记录的终端值（当分析元数据不提供显式总数时）。按符号 PnL 使用权威成交时间戳并包含记录的交易费用，因此其时间和净总额与余额图表保持可比。打开结果还提供 **Price (PBGui MarketData)** 选择器，将一个配置的交易所/币种收盘价序列作为柔和的点线叠加在对比的第二 Y 轴上，并在不隐藏该图表的情况下报告对可见权益图表范围的覆盖。对于组合结果，PBGui 在可用时初始选择具有完整可见价格覆盖的配置交易所；套件结果也使用其真实配置的交易所。一起选择 PBv7 和 PBv8 行并单击 **Compare** 可叠加其权益和余额系列；每个文件从其匹配的结果根目录读取。**Delete Selected** 也支持混合选择，并将每个结果发送到其所属的 PBv7 或 PBv8 后端。结果记录表会占满 Results 页面底部的可用高度，筛选区和表头保持可见，长列表只在表格区域滚动。点击行右侧的图表、分析 JSON、配置 JSON 或图片按钮，会在独立的宽屏 Dialog 中查看对应结果，关闭 Dialog 后不会把报告内容留在列表下方。

回测启动时，PB8 可能下载历史数据。运行大型回测前，审查配置、交易所、币种选择、日期和 PB8 迁移报告。

**Calc Balance** 同时支持 trailing 策略的 `entry.initial_qty_pct` 和 EMA Anchor 的 `base_qty_pct`，因此 PB8 结果配置内联产生与独立 Balance Calculator 页面相同的建议。

**Add to Run** 打开禁用的 PB8 草稿。如果其选定的交易所用户已经拥有 Run 配置，Save 首先加载该配置的当前版本，并要求显式 **Replace and Save** 确认。现有 bundle 被备份，然后结果草稿通过正常的乐观版本递增和 Cluster 同步保存，而不是作为重复的新实例被拒绝。

Backtest/Rebacktest 对话框中的交易所列表使用无修饰符的切换选择：单击未选中的交易所会添加它而不清除现有选择，而单击已选中的交易所只移除该交易所。

Results 工具栏包含一个持久的 **Columns** 选择器。**Defaults** 恢复可比较的未加权结果表，而 **All** 还暴露可用的加权指标、Final Equity 和 Equity/Balance Difference 值。此浏览器本地选择与 Archive 独立。

面板导航在显示 Results、Queue、Archive 或 Refine 操作前同步关闭 Config 编辑器侧边栏，因此延迟的编辑器状态不能把错误的侧边栏附着到活动面板上。

## Archive

Archive Backtests 有自己的持久 **Columns** 选择，因此存档特定布局不会改变本地 Results。

PBv8 使用与 PBv7 相同的 Archive 面板和配置的 Git 存档。结果存储在 `pbgui/configs/<config_version>/backtests` 下，因此 V7 和 V8 文件不能互相覆盖。混合存档列表显示所属版本和活动 PB8 策略，可见 V8 行时有可排序的 Strategy 列，并通过匹配的后端路由图表、文件、比较、删除、重新回测和 Retest & Replace。**Add to Archive** 在一个事务中复制多个所选结果，只更新其清单条目，而不是重新扫描完整存档。**My Archive** 有待处理的本地更改时，Results 侧边栏直接暴露现有的 **Git Push** 操作。对单个 PB8 存档结果 **Add to Run** 创建未保存的 PB8 Run 草稿，供显式审查和保存。V8 重测使用不可变的 `data/bt_v8_queue` 快照。
