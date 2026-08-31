# PBv8 Run

PBv8 Run 管理 Passivbot V8 实时实例。PB7 和 PB8 Run 使用相同的编辑器模板；版本适配器将可见控件映射到正确的配置路径和 API 契约。

## Run 列表

打开 **PBv8 -> Run** 查看存储在 `data/run_v8` 下的配置。PB7 和 PB8 使用相同的响应式 Run 列表布局，带侧边栏搜索和状态过滤器。表格显示活动 PB8 策略、交易所用户、目标主机、配置和运行版本、敞口摘要、已确认的运行主机、备注和 PBCluster 期望状态。Strategy 可排序并包含在列表搜索中。

主 **Status** 列结合发布的期望状态与本地 runner 和远程监视器报告的确切 PB8 进程观测：

- **synced** 表示确切分配的 PB8 进程以当前配置版本运行。
- **outdated**、**sync needed** 和 **stop needed** 标识需要协调的已确认运行时/配置不匹配。
- **blocked** 报告可操作的 Cluster 门或 PB8 运行时失败。只有当 PBRun 报告已验证的 PB8 运行时未就绪时，Run 列表才对受影响主机显示 **Open VPS Manager -> Update PB8** 警告。Cluster 门和普通进程退出失败不显示此更新提示。PBRun 在验证更新完成后重试。
- **PB8 update required** 表示本地 Master 无法加载任何 PB8 配置，因为它自己的 PB8 运行时未通过就绪验证。持久横幅和 Status 单元格显示确切的安全运行时原因，并直接链接到 **VPS Manager -> Update PB8**。只有一个配置失败保持 **config error**，并显示该配置自己的加载器原因，而不是错误地请求运行时更新。
- **collecting** 表示尚无确切进程观测；PBGui 不会猜测机器人已停止。
- **disabled** 表示期望目标已禁用且没有报告运行进程。
- **conflicted** 表示并发集群操作需要解决。

单独的 **Desired** 列保持已发布的 Cluster 请求。经过身份验证的 WebSocket 刷新两个视图，过期的 REST 响应不能覆盖更新的套接字状态。

行操作 **P**、**G** 和 **T** 在显式确认后为 PB8 多空持仓设置全局 `panic`、`graceful_stop` 或 `tp_only`。每个操作使用正常的 PB8 bundle 管道：创建完整备份、递增配置版本、通过 PB8 验证配置和稀疏覆盖、发布 Cluster 操作，并尝试立即激活目标。

## 创建或编辑

编辑器提供与 PBv7 Run 相同的工作流：

- **User**、**Enabled on**、**Config version** 和 **Note** 管理部署身份和 PBGui 元数据。与 PB7 一样，所选 User 也是实例名称；PBGui 拒绝同一交易所用户的第二个实时实例或自定义名称。
- **strategy_kind** 从已安装 PB8 运行时报告的元数据填充，并出现在 **Bot Configuration** 的开头。更改它会立即替换活动的 `bot.long.strategy` 和 `bot.short.strategy` 键，切回时恢复之前编辑的值，或为尚未配置的策略加载运行时默认值。同步是双向的：在 Long 或 Short JSON 中输入一个受支持的策略键也会更新 `strategy_kind` 并切换另一侧。运行时默认策略块以红色 **review** 高亮，直到其值被编辑。
- 正常控件保留从 User 和 Enabled on 到执行标志的熟悉 PB7 顺序。
- Approved 和 ignored 列表使用 PB8 的官方市场解析器。普通市场保持短格式，而 `CAT` 和 `1000CAT` 等真实冲突显示短标签，但以 PB8 的确切交易所限定标识符存储。导入的精确原生 ID、CCXT 符号和命名空间标识符保持不变；无效或歧义值保持可见供更正。
- **Apply Filters** 是显式侧边栏操作，而不是一次性复选框。币种过滤器仍使用 PBGui CoinData 策略，但将每个解析结果投影到 PB8 的防冲突市场目录，而不是替换精确标识符；不可用条目被报告并跳过，而有效列表被保留。
- `dynamic_ignore` 显示为禁用，作为仅 PB7 的运行时功能。PB8 的监督器不监视 PB7 动态列表文件，因此 PB8 Run 使用 Apply Filters 写入的显式列表，而不是持久化一个无功能的标志。
- **Coin Overrides** 支持内联和稀疏文件覆盖。精确的 PB8 市场键保持不同，引用的覆盖文件与配置一起作为一个精确 bundle 保存。
- Coin Override 选择来自活动 `strategy_kind` 和 `hsl_signal_mode` 的 PB8 官方策略。HSL 字段只在 `coin` 模式下提供。显式的 `false`、零和默认值保持稀疏覆盖；`null` 无效，省略表示继承。Save 通过 PB8 的运行时覆盖解析器验证内联和引用文件。
- 多空敞口和持仓控件映射到 `bot.<side>.risk`；完整的嵌套方向配置保持可编辑为 JSON。
- 常规和 **Advanced Settings** 分区暴露已安装 PB8 运行时报告的每个 live、logging 和 monitoring 参数。较旧运行时不提供时，仅 PB8 的费用、订单更替、WebSocket-forager、启动、日志和监视器控件自动隐藏。
- **Advanced Settings** 包含 PB8 的 `coin`、`pside` 和 `unified` `hsl_signal_mode` 选择；打开并保存编辑器时保留已安装模板的默认值。
- 结构化控件、Long/Short JSON 和 Raw JSON 双向同步。数字零、可空自动值、未知运行时字段以及未知的嵌套或顶层 JSON 被保留，而不是被编辑器默认值替换。
- **Additional Parameters** 保留给尚无专用控件的新引入运行时 live 字段。它们保持可编辑并在保存时保留。
- PB8.1 有专用控件，用于 WebSocket forager K 线、`exchange_symbol_unavailable_cooldown_hours`、四个订单替换更替门值以及 Expert/Diagnostic 的 `startup_phase_budgets`。启动预算只影响报告，不限制交易。打开 v8.0 配置会通过 PB8 在内存中规范化这些字段；源只在显式保存后更改。
- **Raw JSON** 保持与结构化控件同步，并保留未知的顶层和嵌套字段。

Import、Copy、Backtest 传递、**Strategy Explorer**、实时日志和 Raw JSON 编辑可从相同的侧边栏工作流使用。PBGui AI 可以从 Run 列表或其他页面为确切的活动机器人调用页面宣告的 `show_log` 操作；PBGui 在通过机器人编辑器导航时保持操作待处理，然后复用侧边栏现有的实时日志函数。Strategy Explorer 通过经过身份验证的不透明草稿接收当前未保存的 PB8 配置和每个引用的稀疏覆盖。Import 对话框提供可搜索的 User 建议，并拒绝配置的交易所用户目录之外的名称。**Balance Calculator** 用当前未保存的配置打开共享计算器，而 **Calc Balance** 内联计算并可应用推荐的 `balance_override`。浏览器请求使用 HttpOnly PBGui 会话 Cookie；不会将会话令牌渲染到编辑器中。

新的 Backtest/Archive 传递草稿选择的用户已拥有 PB8 Run 配置时，Save 加载权威的当前版本并在替换前询问。确认会备份现有 bundle、从该当前版本递增，并同步所选 `enabled_on` 目标；取消保持现有实例不变。

每次保存都通过已安装的 PB8 准备/保存管道运行。PBGui 验证编辑器的预期版本，在跨进程锁下原子地替换完整的配置与覆盖目录，发布不可变清单，并追加显式 `UPSERT_PB8_CONFIG` 操作。运行中的远程分配在一个 Cluster bundle 中以三秒传输限制直接发送到其目标；如果该快速激活无法完成，PBCluster 保持持久重试路径。PBRun 每秒轮询 PB8 期望状态和配置签名，因此成功的实体化立即协调。操作发布或本地放置失败时，保留或恢复之前的本地 bundle。

## 备份

PBv8 Run 使用与 PBv7 相同的 **Backups** 工作流。覆盖或删除现有实例前，PBGui 将完整的先前 bundle 存储在 `data/backup/v8` 下：`config.json` 加每个引用的稀疏覆盖文件。保留设置控制每个实例保留多少版本。

打开备份会创建短暂的编辑器草稿。审查它并使用正常 Save 操作，通过 PB8 验证、乐观版本处理、原子 bundle 持久化和 Cluster 发布恢复它。删除备份只影响该不可变备份 bundle。

PBRun 通过同一控制器服务监督 PB7 和 PB8。重启该控制器不会停止已运行的机器人；启动后它重新采用匹配进程。显式禁用、移动、删除、运行时配置文件更改和 Cluster 墓碑仍会停止受影响的机器人。

## 合格主机

目标列表是失败关闭的。只有当以下来源之一确认 PB8 能力，且其报告的 `pb8_config_schema` 至少与当前配置的 `config_version` 一样新时，主机才会出现：

- 本地 `pb8_runtime_status` 就绪。
- VPS Manager 记录运行时配置文件 `pb8` 或 `pb7_pb8` 且设置成功。
- 非受管远程主机通过主机元数据报告新鲜的 `pb8ready` 值。

仅 PB7、未就绪、过期、架构不兼容和未知的新目标以 HTTP 409 拒绝。例如，`v8.1.0` 配置不能针对只报告架构 `v8.0.0` 的主机；先在该主机上更新 PB8。较旧保存配置中未更改的未知目标可能保持可选，以便可以编辑配置而不强制不安全移动；它不能被选择用于新部署。

## Cluster 部署

PB8 实时操作使用单独的 Cluster 协议命名空间，因此较旧节点永远不会把它们解释为 PB7 配置。第一次 PB8 保存或删除前，将每个活动 Cluster 状态副本更新到宣告 `pb8_instances_v1` 的 PBGui 版本，并等待一次新鲜成功的 Cluster Sync 通过。在此之前，API 以 HTTP 409 拒绝 PB8 发布。

## 删除

Delete 在移除本地 bundle 前发布 `DELETE_PB8_INSTANCE`。PB8 墓碑与 PB7 墓碑分离，因此相同的 PB7 和 PB8 实例名称互不影响。Cluster Sync 和 PBRun 消费墓碑以停止并移除 PB8 部署。
