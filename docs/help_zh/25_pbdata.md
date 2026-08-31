# PBData（服务）

PBData 是 PBGui 内部的后台服务。它通过 REST 持续获取账户数据，并通过公共 WebSocket 获取实时价格，然后将所有内容写入 PBGui 数据库，以便其他页面快速加载。
单击 Services 总览页上的 PBData 卡片，打开包含三个标签页的详情面板：**Log**、**Settings** 和 **Status**。

## PBData 获取什么

### 价格（公共 WebSocket）

PBData 为每个交易所打开一个**公共** WebSocket，并订阅所有持有未平仓头寸的符号的价格行情。价格在内存中缓冲，每 10 秒刷新到数据库。

### 账户数据（REST 轮询器）

所有账户数据均通过 REST 获取——PBData **不**使用私有 WebSocket 连接。针对每个选定的用户（见 **Settings** 标签页 → Users）：

- **Combined poller**（每个交易所一个，按用户串行化）
  - balances（默认约每 300 秒）
  - positions（默认约每 300 秒）
  - orders（默认约每 60 秒）
- **History poller**（每个交易所一个）
  - income / funding 历史
- **Executions poller**（单个任务）
  - my trades —— *选择加入*，仅针对 Executions 下载列表中的用户

### 最新 1 分钟 K 线

独立任务为 Hyperliquid、Binance 和 Bybit 获取最新的 1 分钟 OHLCV K 线（供行情数据管道使用）。

## Users 与 Executions download（选择加入）

PBData 有两个独立的用户列表：

- **Users**
  - PBData 通过 REST 主动获取的用户
- **Executions download**
  - **选择加入的允许列表**：只有这些用户才会下载/存储成交（my trades）
  - 默认为**无**
  - 更改此列表会快速生效；PBData 在每次获取成交前都会重新检查它

## 定时器与性能

在 **Settings** 标签页的 **Timers** 下，你可以调节 PBData 轮询的激进程度。

- **Max private WS**
  - Dashboard 实时流层（`api/live.py`）可打开的私有 WebSocket 客户端数量的全局上限。这不会影响 PBData 本身（它只使用 REST），但该设置在这里管理，因为 PBData 拥有交易所连接池。
- **Startup delay (s)**
  - PBData 启动后、共享 REST 轮询器开始前的宽限期
- **Combined interval (s)**
  - 共享 combined REST 轮询的运行频率（balances + positions + orders 回退/刷新）
- **Balance interval (s)**
  - 专用 balance REST 轮询的运行频率
- **Positions interval (s)**
  - 专用 positions REST 轮询的运行频率
- **Orders interval (s)**
  - 专用 orders REST 轮询的运行频率
- **History interval (s)**
  - 共享 history 更新的运行频率
- **Executions interval (s)**
  - 共享 executions（my trades）的运行频率
- **Market data coin pause (s)**
  - 1 分钟行情数据管道中两次币种获取之间的暂停

通用建议：

- 间隔过小可能触发**限流（HTTP 429）**。
- 如果频繁出现退避，请增大间隔或减少活动用户数量。

### Dashboard 实时会话

Dashboard 只在浏览器实时会话需要时打开私有交易所 WebSocket。同一用户的会话共享监视器，配置的 **Max private WS** 限制可防止无限制地创建客户端。缺少所需私有流方法的交易所会自动使用 PBData 维护的数据库数据。

关闭标签页、注销、会话过期以及 API 重启都会释放关联的监视器和私有客户端。一次包含重复 1 用户和 10 用户会话的生产验证确认：监视器、订阅者、客户端、文件描述符和线程计数都会回落到空闲值。PBData 内存保持不变；FastAPI 内存在重复 10 用户周期后达到稳定的热缓存，而不是每个周期都增长。

经过身份验证的诊断可通过 `GET /api/live/status` 查看配置的限制以及当前的监视器、订阅者、私有客户端和清理任务计数。所有 Dashboard 实时会话关闭后，这些计数应回落到零。首个会话后 FastAPI 内存短暂升高属正常现象，因为交易所库和行情元数据保持热状态。

## 限流控制（REST 暂停）

PBData 在共享 REST 轮询器中会在用户之间设置一个小暂停。

- **REST pause/user (s)**
  - 共享 REST 轮询期间用户之间的全局暂停

### 每交易所共享 REST 暂停

某些交易所需要更大的暂停。

- 你可以设置按交易所的暂停。
- 如果某个值等于全局暂停，PBGui 不会保存覆盖项。
- 如果未设置覆盖项，PBData 使用其内置的按交易所默认值（例如：Hyperliquid/Bybit）。

## 日志查看器提示

PBData 的 **Log** 标签页使用实时日志查看器。它通过 WebSocket 流式传输日志行，支持：

- **Files 侧边栏** — 单击 **Files** 按钮（或工具栏中的文件名徽标）打开列出所有可用日志文件的侧边栏。单击文件进行切换。一次只显示一个文件。
- **Level 过滤按钮** — 切换 **DBG**、**INF**、**WRN**、**ERR**、**CRT**，按严重级别显示/隐藏行
- **Search** — 在搜索框中输入自由文本，或选择 **Preset**（Errors、Warnings、Connection、Restart/Stop、Traceback）。切换 **Filter** 复选框可在过滤（隐藏不匹配行）与高亮（显示所有行、高亮匹配项）之间切换。使用 **▲ / ▼** 按钮在匹配项之间跳转。
- **Lines** — 选择视图中保留的行数（200 / 500 / 1000 / 2000 / 5000）
- **控制按钮**：
  - ⏸ **Pause** / ▶ **Resume** — 冻结或恢复实时流
  - 🗑 **Clear** — 清除显示中的所有行
  - ↓ **Download** — 下载当前查看的日志
  - **# Lines** — 打开/关闭行号

**Log Level** 设置（控制 PBData 自身日志的详细程度）位于 **Settings** 标签页中，而不是日志查看器中。

## Status 标签页

**Status** 标签页显示 Fetch Summary 和 Poller Metrics 面板。

它提供紧凑的运行时快照，包含：

- balances / positions / orders 获取结果
- history / executions 结果
- 每个用户的最近获取时间戳和状态

如果尚未显示任何摘要，说明 PBData 可能还没有写入第一个摘要周期。

## 设置存储位置

大多数 PBData 设置持久化在 `pbgui.ini` 的 `[pbdata]` 段下，包括：

- `trades_users`
- 轮询间隔（`poll_interval_*_seconds`）
- `shared_rest_user_pause_seconds`
- 按交易所的覆盖项（`shared_rest_pause_by_exchange_json`）
- `ws_max`
- `log_level`

## 故障排除

### 我看到大量 429 / 限流警告

- 增大 **REST pause/user**
- 增大轮询间隔
- 减少活动 **Users** 数量
- 考虑对敏感交易所使用按交易所的暂停

### 成交没有下载

- 确保该用户已在 **Executions download** 中选择
- 检查 PBData 日志中的 skipped/filtered executions 消息

### UI 显示过期数据

- 检查 PBData 是否正在运行（控制条中的 Start/Stop 按钮）
- 打开 **Status** 标签页，检查 Fetch Summary 中的最近时间戳
- 如果系统过载，考虑增大 combined 轮询间隔

### 实时会话资源未回落到零

- 关闭所有 Dashboard 标签页，等待断开清理完成。
- 检查经过身份验证的 `GET /api/live/status`；监视器、订阅者、私有客户端和清理任务计数应稳定在零。
- 如果计数仍非零，检查 `PBGui.log` 中的 `LiveSession` 警告，并从 Services 页面重启 API。Dashboard 实时会话清理不需要重启 PBData。
