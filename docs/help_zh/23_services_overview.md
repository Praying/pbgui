# PBGUI 服务总览

Services 页面集中显示并控制所有 PBGui 后台服务。

## 服务总览

页面打开时显示一个卡片网格，所有服务一目了然。每张卡片显示：

- 服务名称
- 状态指示器（绿点 = 运行中，红点 = 已停止）
- 操作按钮：停止时显示 **Start**，运行中显示 **Stop + Restart**

单击卡片可打开该服务的详情面板。

总览页还包含一张专用的 **Workers** 卡片。它打开仅限管理员的工作区，用于管理队列工作器、同步/监视工作器以及内部辅助任务。

| 服务 | 用途 |
|---|---|
| **PBCluster** | 复制 Cluster Sync 状态，并将已批准的 V7/API 密钥变更实体化到已加入节点 |
| **PBRun** | 启动/停止本地 Passivbot 机器人进程，并管理动态币种过滤器 |
| **PBData** | 通过 REST 获取账户数据（余额、持仓、订单、历史、成交），并通过公共 WebSocket 获取实时价格 |
| **PBCoinData** | 使用共享的 CMC 凭据池，获取 CoinMarketCap 数据，并为动态过滤器构建交易所符号映射 |
| **PBAPIServer** | 运行 FastAPI 后端（REST + WebSocket），为 Dashboard、VPS Monitor、Job Queue、实时告警处理以及所有实时功能提供支撑 |

## 启动和停止服务

使用每张卡片上的 **Start**、**Stop** 或 **Restart** 按钮，或服务详情面板顶部控制条中的按钮。更改立即生效。

## 服务详情面板

单击服务卡片（或其侧边栏条目）打开专用详情面板，包含：

- 显示服务状态和操作按钮的控制条
- 不同视图的标签页（如可用）：
  - **Log**：实时过滤的日志查看器
  - **Pool**：CMC 密钥生命周期、就绪状态、用量、冷却与租约状态（仅 PBCoinData）
  - **Settings**：服务特定配置
  - **Status**：运行时状态（仅 PBData）

使用左侧侧边栏在服务之间切换，或返回总览页。

## Workers 面板

**Workers** 侧边栏条目会在 Services 页面内打开一个专用管理面板。它面向运维与故障排查，而非日常机器人使用。

面板将工作器分为：

- **Queue Workers**：共享的 Market Data 队列工作器，以及独立的 PB7/PB8 Backtest 和 Optimize 队列控制器。停止 PB8 控制器只会暂停自动调度；分离的 PB8 任务会继续运行。
- **Sync / Watchers**：API 密钥文件同步监视器、V7 配置同步监视器
- **Internal Helpers**：归档同步与 HLCVS 清理后台任务

对于每个工作器，你可以查看：

- 运行/停止状态
- 小型运行时统计，如排队项、活动任务、已连接主机或看门狗状态
- 支持的位置提供 Start/Stop/Restart 操作
- 工作器写入自己的日志文件时，提供本地日志查看器

Workers 面板中的 Stop 和 Restart 操作在发送命令前会请求确认。

某些工作器暴露的是监视器而不是专用本地日志。例如，共享的 Market Data 队列工作器使用 Job Monitor，因为任务日志按排队任务单独跟踪。此时选择该工作器会将监视器直接嵌入右侧日志窗格，在工作器刷新期间保持原位，并让你留在 Services 页面内。嵌入的 Job Monitor 现在为待处理行提供 `View`（查看完整任务详情）和 `Run`；`Run` 会请求一个额外的同类型手动并行槽位，因此一个选中的待处理任务可以与同类型正在运行的任务同时启动。活动行现在也保持稳定的排队/开始顺序，实时进度更新不再打乱两个运行中任务之间的相对位置。`View` 和 `Log` 对话框同样被限制在浏览器可见视口内，并且会同时跟踪页面外层滚动偏移与裁剪父面板，因此即使监视器位于更高的嵌入区域（其头部已超出可见浏览器窗口）时，关闭按钮也始终可点击。

## 典型的启动顺序

健康的部署通常按此顺序启动服务：

1. **PBCoinData** — 构建符号映射；基于 CMC 的动态过滤器需要一个已实体化的活动池密钥
2. **PBRun** — 启动机器人进程（使用 PBCoinData 的映射）
3. **PBData** — 为 Dashboard 提供实时行情数据
4. **PBCluster** — 启用集群模式时，处理已加入节点的 Cluster Sync
5. **PBAPIServer** — 启用 Dashboard、VPS Monitor、Job Queue 与实时功能
6. **PBAPIServer VPS Monitoring Alerts** — 需要时在 API 服务器设置中配置 Telegram 路由和 GUI 内告警可见性

## 故障排除

## 设置何时生效

PBData 和 PBCoinData 的设置由各自的所有者在下一个调度周期校验并应用。VPS Monitor 主机、阈值、Telegram 路由和 UI 设置会被监视并实时应用。API 绑定主机、端口、CORS 和 SSH 日志接线是启动不变量，需要重启 API；PBRun 身份与 PB7 路径需要所属服务重启。PBCluster、Monitor Agent、远程 INI、请求局部值和任务局部工作器设置有意不设全局 INI 监视器。

- 服务显示红点但应该运行：检查该服务 Log 标签页中的相应日志是否有错误
- **PBRun** 列表看起来过期：先确认 **PBCoinData** 已成功构建映射
- 配置更改后：通过 Restart 按钮重启受影响的服务
