# PBv8 Optimize

PBv8 Optimize 独立于 PBv7 管理 Passivbot V8 优化器配置、排队任务、结果和 Pareto 候选。页面使用与 PBv7 Optimize 相同的模板、面板和可视化编辑器。版本适配器只翻译 PB8 API 路径和嵌套配置模型；没有单独的 PB8 优化器 UI。

如果安装或更新不完整导致 PB8 不可用，工作区上方会出现持久的 **PB8 update required** 警告，带运行时错误和指向 VPS Manager 的链接。页面保持可用于诊断，而不是把问题隐藏在瞬态通知中。

Configs 列表与较慢的 PB8 设置和元数据并行开始加载。其表格使用轻量级摘要请求，跳过优化结果检查，而单独的 Results 面板继续加载完整结果元数据。

## Configs

- **New Config** 从已安装的 PB8 运行时加载优化器默认值、策略、边界、评分指标、限制、后端选项和 Pymoo 选择。
- 支持所有已安装的 PB8 策略：`trailing_martingale`、`ema_anchor` 和 `trailing_grid_v7`。
- 更改 `strategy_kind` 会激活该策略的运行时提供的机器人默认值和边界集，而不删除任何已定制的非活动策略块。编辑器内切换时，未保存的边界和机器人值按策略缓存。当前运行时为 `trailing_martingale` 暴露 84 个控件，为 `ema_anchor` 暴露 58 个，为 `trailing_grid_v7` 暴露 86 个。
- 可视化编辑器读写嵌套的 PB8 机器人和边界路径。Raw JSON 保持同步，并保留未来或专家字段，包括未知的 `fixed_runtime_overrides` 以及规范或简写的 `fixed_params` 选择器。
- 常用优化器控件保留在现有的 PBv7 编辑器分区中。仅 PB8 的 RNG 种子、微调选择器、polish 百分比和 polish 边界模式包含在内，无需单独的编辑器。
- 保存的配置由 PB8 验证，并作为可恢复 bundle 存储在 `data/opt_v8` 下。
- Configs 表格显示活动 PB8 策略，并支持按 Strategy 排序。
- 官方 **Convert to V8** 迁移可用于 PBv7 Optimize 配置。完整配置传递给 PB8 并作为未保存的编辑器预览打开；用户显式保存前不创建或替换任何配置 bundle。迁移报告随预览一起旅行，并随该手动保存持久化。审查阻止仅限于可能影响 Optimize 评估的 `optimize`、`backtest` 和 `bot` 发现；仅 Run 的 `live` 发现不阻止此上下文。迁移前移除 PBGui 元数据和冗余的旧版默认 `max_pending_starting_evals_per_cpu=1`。PB8 迁移后，PBGui 移除与策略不兼容的优化器覆盖，发出规范的固定运行时路径，冻结已禁用的方向，并恢复隐式的正阈值 V7 执行器。这些确定性更正报告为 `ok_with_adjustments`；冲突或未解析路径仍阻止预览。仅加权评分、ADG/MDG 下限、插入的 V8 默认值和固定的新冷却边界产生报告警告，但绝不会被重写为优化器配方。真正的失败显示有界的字段和行为警告列表，而不是转储完整迁移报告。
- PBv7 Pareto 候选暴露相同的官方迁移操作，并且只接受来自受管 PB7 结果目录的候选。

PB8 编辑器在单独的 Long 和 Short 卡片中暴露所有已安装的 HSL 模式和优化器覆盖。**HSL enabled** 控制硬止损行为是否参与优化器评估。**Restart after RED** 是显式的 `always`、`threshold` 或 `never` 选择；`always` 是 PB8 的优化默认值，因此评估在冷却后恢复，而不是在持续回撤时终止。`polish_percentage` 显示为普通百分比，但转换为 PB8 的小数 `--polish-pct` 值，因此 `20` 表示 `0.20`。Pymoo 保持 PB8 的原生自动大小：NSGA-II 使用 `250`，而 NSGA-III 从 `500` 的预算派生其参考方向。

PB8 的 `gpu` 后端意味着实验性的 **Apple MPS**，而不是 CUDA。PBGui 区分 PB8 注册的后端与当前主机上可用的后端。GPU 在不受支持的主机上仍可作为显式编辑器预览选择，因此可以测试所有字段，并且可以保存可移植配置而不静默替换其后端。Queue 和 Start 仍会在创建快照或进程前以 PB8 的确切运行时原因失败。PBGui 安装和 PB8 更新工作流请求可选的 `gpu-mps` 配置文件；其平台标记只在 Apple Silicon 上安装 PyTorch。

选择 GPU 时，编辑器暴露 PB8 运行时提供的可空种群、批次和候选条大小、M3 精简自动并行、精确工作器和漂移控件、检查点间隔以及 Successive Halving 策略。控件分组为 **Automatic sizing**、**Exact validation & checkpointing**、**Drift safety** 和 **Successive halving**。它们使用编辑器的标准响应式八列网格：宽屏 8×1，中屏 4×2，小屏 2×4。空白大小字段保留 PB8 的自动默认值，并将有效运行时值显示为 `auto (…)` 占位符；输入数字会有意禁用该字段的自动大小。**Reset GPU defaults** 恢复已安装运行时的默认值，而不删除未知的未来 GPU 键。新的评分和限制选择使用 PB8 的 GPU 代理允许列表；现有的不兼容条目保持可见供修复，PB8 的原生预检在排队或启动前阻止它们。

PB8 的默认优化边界是初始搜索范围，不是硬滑块限制。因此编辑器使用参数范围元数据作为滑块，并允许低于 PB8 默认值的值，如 `n_positions = 1`。

Forager 成交量和波动率 EMA 跨度滑块的最小值为 `1`。要从优化中排除这些参数，保持有效的正机器人值并使用该行的 **Fixed** 复选框，而不是把跨度设为零。后端验证只在相应的 Forager 信号保证保持禁用时才接受导入的零跨度。

选择多个交易所保持 PB8 的原生组合数据集行为。每个交易所必须单独评估时，使用显式 Suite 场景。

PB8.1 评分目标可以继承全局 **Objective Scenario**、显式使用套件聚合，或选择命名的 Suite 场景。聚合目标支持 `mean`、`min`、`max`、`std` 和 `median`。限制可以使用省略 Scenario 的套件聚合、保留显式的 `scenario: null`，或选择命名的 Suite 场景；省略和显式 null 具有相同的运行时基础，但在结构上保持不同。PBGui 从已安装的 PB8 运行时读取规范缩减字段：当前 PB8 使用 `reducer`，而较旧的兼容 PB8 版本对评分使用 `aggregate`，对限制使用 `stat`。命名场景不能同时使用缩减字段。场景标签必须存在于活动 Suite 中。PBGui 在同步可视化编辑器和 Raw JSON 时保留这些区别。

PB8 市场选择使用跨完整交易所集的官方解析器。唯一市场在配置中保持短格式；真实的乘数或场所冲突使用精确作用域标识符，而编辑器保持紧凑标签。精确导入的 ID 在币种列表、Coin Sources、Suite 场景和 Raw JSON 中保持不变。

更改 Market Cap、成交量比率、标签、CPT 或 notice 设置后使用 **Apply Filters**。该操作过滤每个所选交易所，通过 PB8 的市场解析器投影结果，并将组合结果写入 Long 和 Short 的 approved/ignored 列表。不应用就保存会保留过滤器元数据，但不更改显式币种列表。

## Queue

队列条目包含不可变的 PB8 配置快照。排队后编辑已保存配置不会更改现有队列项。

从队列行显式打开编辑器时，**Save** 不同：它保存受管配置并刷新同一队列项的快照。因此重新打开或启动该行时，`optimize.n_cpus` 等更改存在。

编辑器还保留其导航来源：**Home** 或 **Save** 将队列打开的配置返回到 Queue 面板，而从 Configs 打开的配置返回那里。

- **Start** 手动启动所选项。
- **Stop** 只终止已验证的 PB8 优化器进程。
- **Requeue Fresh** 启动新的优化器运行而不复用优化器状态。
- **Continue from Pareto** 使用受管 Pareto 文件作为 `--start` 种子。
- **Resume Checkpoint** 使用 `--resume` 恢复确切受管优化器状态。

对于确切选择或运行中的队列项，PBGui AI 可以从任何 Optimize 面板调用页面宣告的 `show_log` 操作。跨页面操作导航到 PB8 Optimize，等待队列数据，然后调用与行操作相同的现有日志面板函数。

检查点恢复只接受 PBGui 管理的本地 PB8 结果。任意检查点文件被拒绝，因为 Python pickle 检查点必须被视为可信的可执行数据。

PBGui 只在检查点和 `all_results.bin` 可读、启用了 `write_all_results`、配置可恢复且 PB8 确认兼容时宣告精确恢复。配置和队列创建然后作为一个事务发生。仅检查点的结果目录不需要单独的 Pareto JSON 配置。

PB7 和 PB8 共享一个自动优化器槽位：自动启动绝不同时启动两个版本。显式手动启动可以并行运行。每个优化器通过 `optimize.n_cpus` 控制自己的并行度。

PB7 和 PB8 使用一个共享的 Queue **Settings** 配置。在任一 Optimize 页面保存它都会立即控制两个队列和两个自动启动工作器。**Autostart CPU** 可以随时编辑和保存；**Override config CPU** 决定它是否替换自动启动的 `optimize.n_cpus`，而手动启动保持配置值。**Use PBGui Market Data** 将受管 OHLCV 源应用到启动副本，而不更改保存的配置或不可变队列快照。

运行中的 PB8 优化器任务在 API 重启后存活。在 Linux 上，每个优化器在 API 服务 cgroup 之外的自己的瞬态用户 systemd 单元中运行；PBGui 记录进程 ID、进程创建时间、PB8 版本和 PB8 提交，因此过期或复用的进程 ID 不会被意外控制。

永久准备错误只将相应队列行移动到可操作的错误状态，而更新或运行时锁竞争保持排队重试。启动协调队列快照、启动目录、PID、就绪和状态记录，而不向未验证的进程发信号。PB8 控制器显示在 **Services Monitor** 中，并在意外的 worker 循环错误后存活。

GPU 日志状态将精确验证预算与代理工作分开报告：仪表板显示精确评估和百分比、代、代理评估、进行中的精确任务、分派块和 Successive Halving 活动。检查点恢复在将最终检查点签名权威推迟给 PB8 前，比较 GPU 策略、Pymoo 提议设置、缩减器和执行输入、启用方向以及 approved/ignored 币种。

切换策略时移除策略特定的优化器覆盖，并在保存、排队和启动前通过已安装的 PB8 运行时验证。

**OHLCV Readiness** 和预加载通过 PB8 自己的 virtualenv、规划器、缓存路径和原生 `passivbot download` 命令运行。已批准 PB8 或 PBGui 行情数据根目录之外的显式只读源被拒绝，而不是回退到 PB7。GPU Suites 要求每个场景特定的交易所数据集，而不是接受每个币种的最佳交易所；仅场景缺失的交易所会禁用单配置预加载操作并给出解释。

## Results 与 Paretos

结果只从 `<pb8dir>/optimize_results` 读取。Results 表格显示每次运行配置的 PB8 策略，并可按该列排序。Results 和 Paretos 面板提供共享的 PB7 工作流，用于结果检查、删除、3D 图、Pareto Dash、候选 JSON、指标摘要和种子 bundle。

切换 Optimize 结果集会立即清除之前的 Pareto 行、元数据和选择，然后加载新结果。较早结果的迟到响应不能恢复过期行。

Results 列表使用有界的冷启动元数据：它枚举每个 Pareto 目录一次，使用目录时间戳而不是 stat 每个候选，并且没有 Pareto 配置时只解码第一条 MessagePack 记录。完整的 `all_results.bin` 验证对 Resume/Continue 操作仍然是强制的，但 API 重启后绝不会阻塞可视 Results 列表。

PB8 结果操作区分三个不同工作流：

- 将 Pareto 候选作为 PB8 Backtest 草稿打开执行独立回测。
- 在不同命名的 Suite 场景视图中选择的 Pareto 候选保留该场景。Backtest 传递只为候选绑定场景的交易所排队每个候选，而不是创建按候选乘交易所的矩阵。
- 启动新的 PB8 Optimize 草稿使用一个或多个 Pareto 候选作为种子。
- 恢复检查点继续现有后端状态和结果流。

共享的 Pareto Explorer 使用版本特定的根目录，并理解 PB8 嵌套边界、嵌套机器人参数、评分目标、限制、套件指标和增量 `all_results.bin` 记录。

在 PB8 Pareto Explorer 中，**Strategy Explorer** 用其稀疏覆盖打开所选候选。要比较两个候选，先用 **Pin Explorer Baseline** 固定第一个，从同一结果选择另一个候选，然后打开 Strategy Explorer。缺失引用的覆盖文件会阻止固定或打开，而不是被静默忽略。

套件摘要保留其配置的目标和场景名称，并支持 `mean`、`min`、`max`、`std` 和 `median`。**Columns** 选择器控制可排序的列表指标并记住 PB8 选择。它宣告 Pareto JSON 中持久化的每个数值指标，但列表 API 只为默认值和当前选择的列传输值。新选择的指标在一个防抖批次中获取，然后保留在有界的文件签名 LRU 缓存中，因此统计更改和重复视图不会重新读取未更改的候选。指标目录不变时，选择器 DOM 也被复用。默认值包括规范的 Gain、配置的目标和规范的 Drawdown；规范值优先使用既定的 PB8 别名，例如 `gain_usd` 先于 `gain_strategy_eq`，`drawdown_worst_strategy_eq` 先于 USD/回退 Drawdown。**All (slower)** 显式选择非常宽的表格和更大的响应；正常视图保持紧凑。更改、删除、格式错误或积极重写的候选被独立处理。

结果操作只在其所需产物存在时启用。已验证的优化器只阻止删除它或其递归子项打开的精确直接结果目录。无关的较旧结果保持可删除。延续队列源和 Pareto Dash 会话保持精确的删除阻止项，不确定的活动进程所有权被保守处理。批量删除保留这些冲突详情，并原子地暂存所选目录。Pareto Dash 通过凭据隔离、有界的 PBGui 代理运行，带空闲清理和验证的孤儿恢复。其 PBGui 窗口可以按头部移动，并从每个边或角调整大小，而仪表板保留 PB8 的原始原生呈现。

## Archives

PB8 Optimize 配置和 PB8 Backtest 结果使用现有的 Archive 工作流。文件存储在其 `config_version` 下，因此 PB7 和 PB8 内容不能互相覆盖。导入、导出、查看、删除、恢复和传递操作总是使用属于归档配置版本的解析器。
