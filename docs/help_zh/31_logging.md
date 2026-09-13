# 日志

Logging 页面为所有 PBGui 服务提供实时日志查看器。
日志通过 WebSocket 实时流式传输——无需刷新页面。

## 布局

- **侧边栏（左）**：`data/logs/` 中所有可用日志文件的列表，每项显示当前文件大小
- **工具栏**：行数、级别过滤、预设按钮、搜索与匹配跳转、行号、重启、暂停/流式、获取、清除、下载以及连接状态
- **日志区**：带搜索和高亮的可滚动终端输出

查看器是日志页面的原生 Vue 组件，使用与 PBGui 其余部分相同的主题令牌。

## 选择日志文件

单击侧边栏中的任意文件名即可加载。
所选文件会高亮显示，名称右侧显示其大小。
流式传输自动开始——新行实时追加。

## Lines 下拉框

控制打开或切换文件时加载多少行。
选项：200 / 500 / 1000 / 2000 / 5000 / 10000 / 25000 / Max (50,000)。
文件打开时更改该值会以新数量重新加载。所选数量同时是源尾部与渲染行数上限；
浏览器保留该有界实时缓冲区并在本地过滤。**Max (50,000)** 是有界尾部，而非完整文件。

## Version 下拉框

当所选日志文件有轮转备份（`.1`、`.old` 等）时出现。
- **Current**：带流式传输的实时文件
- **.1 / .old / …**：归档快照，只加载一次（不流式传输）

切换回 **Current** 会恢复实时流式传输。

## 级别过滤

逐个切换日志级别的显示/隐藏：

| 按钮 | 级别 |
|--------|----------|
| DBG | DEBUG |
| INF | INFO |
| WRN | WARNING |
| ERR | ERROR |
| CRT | CRITICAL |

不匹配活动级别的行会立即隐藏，无需重新获取。

## 搜索

- 在 **Search** 字段中输入内容以过滤或高亮匹配行
- **Filter** 复选框：勾选时隐藏不匹配行；取消勾选时仅高亮
- 使用 **▲ / ▼** 按钮在匹配项之间跳转
- **Preset** 按钮：一键应用常用模式（Errors、Warnings、Errors + Warnings、Connection、Restart / Stop、Traceback）；**All** 清除过滤

搜索和过滤在浏览器中对缓冲区内的行执行，因此输入关键字或切换预设都不会重新向服务器获取数据。清除过滤会恢复完整缓冲区。

## 流控制

| 按钮 | 操作 |
|-----------|------------------------------------------------|
| Pause | 停止接收新行（保留缓冲区） |
| Stream | 从当前位置恢复实时流式传输 |
| Fetch | 按当前行数重新加载所选文件 |
| Restart | 重启拥有所选日志文件的服务 |
| Clear | 清除显示缓冲区（不删除文件） |
| Download | 将缓冲区内的行保存为文本文件 |
| ## Lines | 切换行号显示 |

**Restart** 会根据所选文件名推导服务（`PBRun.log` → PBRun，`PBData.log` → PBData，机器人实例日志 → `Bot:<name>:7`）；无法推导服务时该按钮隐藏。

连接徽标显示 WebSocket 状态（连接中 / 已连接 / 已断开），意外断开后会自动重连。会话过期（关闭码 4001）会跳转到登录页。

## 设置

单击侧边栏中的 **⚙ Settings** 配置日志轮转：

- **Default rotation**：所有服务的最大文件大小（MB）和备份文件数
- **Per-log rotation**：按单个服务日志覆盖大小和备份数
- **Managed logs**：为动态日志族配置大小和备份数，例如 API 控制台、jobs、backtests、optimizations、VPS Manager runs、OHLCV preloads、monitor-agent 实时数据、Pareto sessions 和 API handoff

更改在下一次日志写入时或下一个受管 transcript 打开前生效。日志轮转有意不设监视器，也不需要重启服务。

**Purge** 会在写入者使用的同一跨进程锁下强制轮转并清空所选当前日志。PBGui 只保留配置数量的数字备份代次，并最多将配置的最大大小尾部存为 `.1`。备份数为 `0` 会丢弃当前内容并移除现有数字代次。Purge 失败会被记录，而浏览器错误响应保持通用，不暴露文件系统异常细节。

## 故障排除

- **没有列出日志文件**：确保 PBGui 服务至少启动过一次
- **流式传输停止**：PBAPIServer WebSocket 连接丢失——查看器会自动重连
- **Max (50,000) 较慢**：大日志或高频日志请使用较小的行数

---

## 在哪里找什么

所有日志文件都位于 PBGui 规范的 `data/logs/` 目录下。该位置锚定在 PBGui 安装目录，不依赖进程工作目录。使用侧边栏直接打开任何文件。

PBGui 会在其线程和进程之间串行化并发的追加、轮转和清除操作。轮转设置原子地存储在 PBGui 的 `pbgui.ini` 中。按日志的覆盖项应用于物理文件，因此归入 `PBGui.log` 的每个辅助组件都使用同一条规则。

PBGui 拥有的 transcript 使用同一根目录下的专用子目录：

```text
data/logs/jobs/
data/logs/backtests/
data/logs/optimizes/
data/logs/vps-manager/
data/logs/ohlcv-preloads/
data/logs/monitor-agent/
```

Managed Logs 设置在某个日志族创建其第一个文件之前就已生效。子进程捕获的轮转只在打开新捕获之前执行，因此 PBGui 绝不会在子进程仍拥有其文件描述符时重命名文件。

PB7 原生机器人日志保留在 PB7 自己的 `logs/` 目录中，旧版 Passivbot stderr 保留在其实例运行时目录中。PBGui 可以显示这些文件，但不主张对其存储或轮转的所有权。

### 自动迁移清理

更新后的首次 API 启动时，进程安全的启动迁移只移除明确退役的 PBGui 日志名称和过时的 `income_other_*.json` 诊断。完成情况原子地记录在 `data/state/startup_migrations.json` 中，因此每个 Master 只运行一次迁移。失败的迁移保持待处理状态，留待下一次 API 启动。已批准根目录之外的符号链接和路径永远不会被移除。

### 安全与上下文

浏览器访问 Logging 页面使用同源 HttpOnly 会话 Cookie。会话令牌不会渲染到页面或 JavaScript 中。

中央日志器会从消息、标签、代码、URL、异常、traceback 和嵌套元数据中编辑常见凭据。这包括密码、API 密钥和机密、访问/会话/刷新令牌、授权和 Cookie 头、敏感查询参数以及私钥块。编辑是最后一道安全层；调用方仍然必须避免记录已知机密。

操作事件可能在行尾包含结构化 JSON 上下文：

- API 请求的 `request_id` 和 `operation`
- 远程/VPS 操作的 `host`
- 机器人特定操作的 `instance` 或 `user`

API 响应包含 `X-Request-ID`，可以在不暴露会话标识符的情况下将错误响应与其日志匹配。

### 日志所有权

PBGui 使用三层所有权：

1. 独立守护进程写入专用服务日志。
2. 数据管道和分离任务使用专用管道日志或文档化的 transcript。
3. 没有独立生命周期的 API/UI 辅助组件共享 `PBGui.log`。

机器可读的工作器输出、安装程序/维护 CLI 输出、原始子进程 stderr 以及用户可见的 VPS/任务 transcript 是有意豁免项。它们不是应用程序日志器，并受仓库策略测试保护。

### PBGui.log

包含分组的 API 和 GUI 辅助组件消息：

| 组件 | 你能在那里找到什么 |
|-----------|-------------------|
| VPSManager | VPS 连接和任务协调 |
| Config | 配置辅助错误 |
| ParetoDataLoader | Pareto 结果加载 |
| Status | 状态辅助事件 |
| HyperliquidAWS | Hyperliquid AWS 集成 |
| API/UI helpers | 身份验证、实时会话、用户、API 密钥状态、日志、余额、币种数据、仪表板、服务、V7 实例、Market Data 和 PB7 OHLCV 操作 |

### 专用日志文件

| 文件 | 服务 | 你能在那里找到什么 |
|------|---------|-------------------|
| `PBCluster.log` | PBCluster | Cluster Sync 守护进程活动和对等同步诊断 |
| `PBRun.log` | PBRun | 机器人启动/停止、订单循环 |
| `PBCoinData.log` | PBCoinData | CMC 数据更新、符号列表 |
| `VPSMonitor.log` | VPS Monitor | SSH 连接、主机指标、服务自动修复 |
| `PBApiServer.log` | PBAPIServer | FastAPI 启动、REST/WebSocket 请求 |
| `Database.log` | Database | 数据库查询、连接错误 |
| `Exchange.log` | Exchange | 市场获取、符号信息、CCXT 错误 |
| `PBData.log` | PBData | OHLCV 下载、行情数据管道 |
| `SSH.log` | SSH pool | AsyncSSH 连接和主机密钥诊断 |
| `tradfi_sync.log` | TradFi Sync | TradFi 符号映射与同步 |

额外的交易所下载器、队列和分离管道可能暴露自己的专用日志或任务 transcript。`OptimizeQueueAPI` 有意保持专用，而不是归入 `PBGui.log`。
