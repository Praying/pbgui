# VPS Monitor

VPS Monitor 是每个已配置 VPS 主机的实时运维仪表板。PBAPIServer 通过 Cookie 身份验证的 WebSocket 发送状态，因此页面无需轮询即可更新，并且不会在 HTML、JavaScript、URL 或 WebSocket 参数中暴露浏览器会话。

## 你可以监控什么

- 每个主机的 SSH 连接状态
- 实时 CPU、RAM、磁盘、swap 和机器人进程指标
- PBCluster、PBRun、PBData、PBCoinData 和 PBMonitorAgent 的服务状态
- 跨主机的机器人实例和同步详情
- 实时服务和机器人日志
- 监视器代理心跳、缓存文件健康度和收集器错误

## 监视器代理数据源

每个 VPS 运行 `pbgui-monitor-agent.service`。它本地测量一次主机，并为所有连接的 PBGui Master 写入缓存文件。VPS Monitor 只消费此监视器代理缓存；缓存缺失、过期或无效时没有直接的收集器回退。

规范实时流是：

```text
data/monitor_agent/live_metrics.ndjson
```

完整缓存集是：

```text
data/monitor_agent/live_metrics.ndjson
data/monitor_agent/live_metrics.latest.json
data/monitor_agent/instance_snapshot.json
data/monitor_agent/host_meta.json
data/monitor_agent/service_status.json
data/monitor_agent/package_status.json
data/monitor_agent/collector_status.json
```

快照 JSON 文件以原子方式替换。NDJSON 流使用 PBGui 管理的、基于字节的保留与轮转，因此其磁盘占用保持有界，同时读取者可以继续跟随该流。

## 代理健康度

每个主机卡片显示 **Monitor Agent: OK, Stale, Missing, Error, or Unknown**，并且始终将来源标识为 `monitor-agent cache`。

- 实时遥测在最后一个样本后 **15 秒** 内为健康。
- 收集器心跳在 **30 秒** 内为健康。
- **Stale** 表示有效年龄超过了上述某个限制。
- **Missing** 表示所需的缓存文件被报告为缺失。
- **Error** 表示代理、所需文件或收集器循环报告了错误。
- **Unknown** 表示尚未收到可用的监视器代理诊断。

详情面板显示心跳和有效年龄、每个必需文件的状态以及有界的收集器错误。SSH 连接是独立的：主机可能在 SSH 上保持 **connected**，而其监视器代理遥测已经过期。

## 标签页与工作流

- **Dashboard**：主机、SSH、遥测和监视器代理健康度
- **Instances**：运行中和已部署的 PB7/PB8 机器人实例，带明确的运行时身份；log 和 kill 操作保持该身份，因此同名不会定位到错误的运行时
- **Services**：PBCluster、PBRun、PBData、PBCoinData 和 PBMonitorAgent 的状态与重启操作
- **Live Logs**：实时服务和机器人日志流

## 实时日志功能

- 真实的文件行号
- 日志块的分组折叠与展开
- 带高亮的全文搜索
- 自动滚动和紧凑模式
- 带流控制的主机和服务选择器
- Restart 会预先武装所选日志流，因此启动早期的行在无需手动 Fetch 的情况下仍然可见

## 要求

- PBAPIServer 必须正在运行。
- 目标 VPS 主机必须在 PBAPIServer 设置中启用（`System → Services → PBAPIServer → Settings`）。
- 每个 VPS 上必须安装并运行 `pbgui-monitor-agent.service`。
- 浏览器必须能够访问 PBAPIServer WebSocket 端点。

## 故障排除

在受影响的 VPS 上检查监视器代理：

```bash
systemctl --user status pbgui-monitor-agent.service
journalctl --user -u pbgui-monitor-agent.service
```

需要时重启它：

```bash
systemctl --user restart pbgui-monitor-agent.service
```

- **没有数据显示**：从 `System → Services` 启动 PBAPIServer。
- **缺少一个主机**：确认该主机已在 PBAPIServer 设置中启用。
- **Agent Missing**：更新或迁移 VPS 安装，使 `pbgui-monitor-agent.service` 和所有缓存文件都已安装。
- **Agent Stale**：检查服务状态和 journal。SSH 可能保持连接，而遥测已经过期。
- **Agent Error**：查看主机详情中的有界收集器错误，然后检查服务 journal 以获取完整的本地错误。
- **日志不流式传输**：检查 `PBApiServer.log` 中的连接错误。
