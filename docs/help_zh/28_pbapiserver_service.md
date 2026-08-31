# PBAPIServer 服务

PBAPIServer 是支撑 PBGui 所有实时功能的 FastAPI 后端。它提供 REST 端点、WebSocket 流，并托管前端页面（Dashboard、Services、VPS Monitor 等）。

## PBAPIServer 做什么

- 运行 FastAPI 服务器（默认端口 8000），提供 REST、WebSocket 和 SSE 端点
- 以三层数据架构支撑 Dashboard：
  - **第 1 层（后台）：** PBData 轮询 REST API 并写入数据库；通过内部 localhost 端点通知 API 服务器
  - **第 2 层（按需）：** 浏览器订阅时，`api/live.py` 打开到交易所的私有 ccxtpro WebSocket 连接（用于持仓/余额）——引用计数，无浏览器连接时关闭
  - **第 3 层（浏览器）：** Vanilla JS 通过 SSE（Server-Sent Events）接收更新
- 支撑 Services 页面（启动/停止/重启所有 PBGui 守护进程）
- 代理 VPS Monitor 状态和命令，而独立的 `pbgui-vps-monitor.service` 拥有持久 SSH 连接、实时指标和远程日志流
- 管理 Job Queue（回测、优化）并提供实时状态更新
- 提供 API Keys 管理端点
- 提供 Market Data 管道状态和控制
- 通过 WebSocket 从 `data/logs/` 提供实时日志流
- 托管 Heatmap 数据端点
- 从 `frontend/` 目录托管所有 Vanilla JS 前端页面

## 配置

PBAPIServer 设置存储在 `pbgui.ini` 的 `[api_server]` 段下：

| 设置 | 默认值 | 说明 |
|---|---|---|
| `host` | `0.0.0.0` | 绑定地址（`0.0.0.0` = 所有接口，`127.0.0.1` = 仅本机） |
| `port` | `8000` | API 服务器端口（1024–65535） |

你可以在 **PBAPIServer Details** 页面（`System → Services → PBAPIServer → Settings` 标签页）更改 host 和 port。

## 启动和停止

- **Start**：使用 Services 总览页或详情页上的 Start 按钮。PBAPIServer 以后台进程方式启动。
- **Stop**：GUI 不支持（服务器在提供页面时无法停止自身）。如需停止，可通过终端操作。
- **Restart**：使用 Restart 按钮。PBGui 会重启仍运行旧代码 serial 的活动受管服务，最后重启 API 服务器并重新加载页面。专用的 VPS Monitor 守护进程不属于普通 API 重启的一部分，因此其 SSH 会话保持连接。

升级尚没有 `pbgui-vps-monitor.service` 的现有 systemd 安装时，迁移代码生效后的下一次 Restart 会执行一次性迁移。PBGui 安装该单元而不改变可选服务状态，停止旧的 API 拥有的监视器，验证守护进程 RPC 端点，然后才重新启动 API。这次首次交接会重新连接一次现有 SSH 会话；之后的 API 重启会让它们保持连接。如果代码在旧 API 进程仍在运行时被替换，重启浮层会先加载新 API，检测该新进程才报告的任何额外过期服务，并在重新加载页面之前执行一次自动跟进重启。

当 API 或活动的 PBCluster、PBRun、PBData、PBCoinData 或 PBMonitorAgent 进程仍运行较旧的 `api/serial.txt` 值时，导航栏会显示橙色 **Restart** 按钮。确认对话框列出受影响的服务。分离的机器人、回测、优化和 Market Data 任务不会被重启。

## WebSocket 端点

PBAPIServer 提供多个实时 WebSocket 流：

| 端点 | 服务器消息格式 | 客户端输入 |
|---|---|---|
| `/ws/jobs` | `{"type":"jobs","data":[...],"timestamp":...}`，最多 50 个待处理/运行中任务 | 无 |
| `/ws/dashboard` | `balance_updated`、`income_updated`、`positions_updated`、`nav_request` 或 `dashboard_action` 信封 | 无 |
| `/ws/candles` | `candle`、`position`、`orders` 或 `ping` 信封 | 查询：`user`、`symbol`，可选 `tf`、`side` |
| `/ws/market-data` | 扁平 `market_data_status` 信封，包含 exchange、运行/排队状态、计数器和 `coin_rows` | 查询：`exchange` |
| `/ws/vps` | `state`、`log_lines`、`local_log_lines`、命令结果或 `error` | 带 `cmd` 的 JSON 命令 |
| `/ws/heatmap-watch` | `{"type":"updated","mtime":...}` | 查询：`exchange`、`dataset`、`coin` |
| `/api/v7/ws/v7` | `{"type":"instances","data":[...]}` | 收到的文本被忽略 |
| `/api/backtest-v7/ws/bt7` | `queue_update` 或 `archive_update` | `{"type":"refresh"}` |
| `/api/optimize-v7/ws/opt7` | `queue_update` | `{"type":"refresh"}` |
| `/api/vps-manager/ws` | `state`、`detail`、`result`、`error` 及命令专用信封 | 带 `cmd` 的 JSON 命令 |

浏览器 WebSocket 连接通过 HttpOnly `pbgui_session` Cookie 进行身份验证。无效或已撤销的会话以代码 `4001` 关闭。

## 身份验证

浏览器页面和 WebSocket 使用 HttpOnly `pbgui_session` Cookie。API 客户端可继续对 REST 请求使用 `Authorization: Bearer xxx`。

令牌在登录时生成，24 小时后过期。所有 FastAPI 页面每 30 分钟自动刷新令牌。如果令牌过期，页面会重定向到登录界面。

## 日志

PBAPIServer 写入 `data/logs/PBApiServer.log`。日志条目包括：
- 服务器启动和关闭事件
- HTTP 请求日志（来自 uvicorn）
- WebSocket 连接事件
- Serial 文件变更检测（`[serial-watcher]`）
- 任务工作器看门狗事件（`[watchdog]`）

## 后台监视器

PBAPIServer 运行多个内部后台任务：

- **Task-worker watchdog**：每 60 秒检查任务队列工作器是否存活；崩溃时自动重启
- **Serial watcher**：通过 inotify 监视 `api/serial.txt` 的变更；通过 SSE 向所有连接客户端广播重启通知
- **VPS Monitor client**：从 `pbgui-vps-monitor.service` 读取仅所有者可访问的本地 Unix RPC 状态；API 关闭时只关闭此本地客户端及其惰性操作池
- **File Sync Worker**：监视本地配置文件，并通过 inotifywait 将变更同步到远程 VPS 主机

## 故障排除

| 症状 | 检查 |
|---|---|
| 服务器无法启动 | 检查端口是否已被占用（`lsof -i :8000`）；检查 `data/pid/api_server.pid` 中是否有过期 PID |
| "Address already in use" | 之前的服务器没有干净关闭——等待几秒或杀掉旧进程 |
| 橙色 Restart 按钮不消失 | 打开它查看哪个受管服务仍报告较旧的 `api/serial.txt` 值；如果协调重启无法使其更新，请检查该服务 |
| WebSocket 断开 | 检查 `PBApiServer.log` 中的 `[ERROR]` 行；验证令牌仍然有效 |
| Dashboard 无法加载 | 确认 PBAPIServer 正在运行；检查浏览器控制台中的连接错误 |
