# VPS 监控告警

VPS 监控告警现在随实时 VPS 监控一起在 **PBAPIServer** 内运行。不再有独立的 `PBMon` 守护进程。

## 监控什么

API 服务器保持 VPS 监视器连接，并直接根据实时内存状态评估活动告警条件。

| 告警类型 | 触发时机 |
|------------|----------------|
| **Offline host** | 与受监控 VPS 的 SSH 连接断开 |
| **Service problem** | 受监控的 VPS 服务宕机或已发起重启 |
| **System threshold** | 主机超过配置的内存、CPU、swap 或磁盘阈值 |
| **Instance threshold** | 受监控的 Passivbot 实例超过配置的限制 |
| **HL API key expiry** | Hyperliquid API 密钥即将到期 |

仅当至少一个使用该交易所用户的 PB7 或 PB8 实时配置仍可能需要该密钥时，才发送 HL 到期警告。当所有匹配的机器人均已安全停止或禁用时，PBGui 会抑制进一步警告；如果机器人重新启用，则恢复警告。活动、冲突、不确定或仍在运行的实例会继续告警。

活动告警在导航栏中以专用告警指示器显示。徽标显示 `new/ack` 计数。

## 在哪里配置

打开：

1. **System -> Services**
2. 选择 **PBAPIServer**
3. 打开 **Settings** 标签页
4. 进入 **VPS Monitoring** 部分

`Alerts / Telegram` 块允许你配置：

- **Telegram Bot Token**
- **Telegram Chat ID**
- 哪些活动告警组在 GUI 中可见
- 哪些问题与恢复事件发送到 Telegram

设置分组为：

- **Offline Hosts**
- **Services**
- **System Thresholds**
- **Instance Thresholds**

每组都允许细粒度的 Telegram 路由，同时保持 UI 紧凑。

## GUI 行为

- GUI 只显示**当前活动的问题**
- 已清除的告警自动消失
- 如果问题稍后再次出现，它会重新变为 **new/unacknowledged** 状态
- 你可以从导航浮层确认单个告警或所有可见告警
- 在同一个问题持续期间，即使严重程度或详情发生变化，已确认的告警也保持已确认状态。PBGui 有意不在一个连续事件内因恶化而重复告警；只有解决后重新开启才会开始新的事件。

## Telegram 设置

1. 打开 Telegram 并与 **[@BotFather](https://t.me/botfather)** 聊天
2. 发送 `/newbot` 并复制 **Bot Token**
3. 使用 `/start` 与机器人开始对话
4. 查找你的 **Chat ID**，例如通过 **[@userinfobot](https://t.me/userinfobot)**
5. 将两个值保存在 **PBAPIServer -> Settings -> VPS Monitoring** 中

> 你必须先给机器人发送至少一条消息，它才能给你发消息。

## 日志

告警路由与 VPS 监控活动通过 API 服务器和 VPS 监视器日志记录，主要是：

- `PBApiServer.log`
- `VPSMonitor.log`

## 故障排除

| 症状 | 检查 |
|---------|-------|
| 没有 Telegram 告警 | 验证 PBAPIServer 设置中的 Bot Token 和 Chat ID · 检查 `PBApiServer.log` 和 `VPSMonitor.log` |
| 告警徽标一直为空 | 确认告警组已启用 GUI 可见性，且 VPS 主机包含在受监控主机中 |
| "Chat not found" | 在测试告警前先向机器人发送 `/start` |
| 恢复后告警消失 | 符合预期：GUI 只列出活动问题 |
