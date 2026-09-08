# Transfers

## 用途

**System > Transfers** 提供固定内部账户之间的显式手动转账。它从不接受外部地址，也不更改 Profit Sweep 的到期金额、基线、高水位标记或已确认清扫总额。

支持的路由对来自每次新鲜的账户快照：

- Hyperliquid Standard：Perps 到 Spot 以及 Spot 到 Perps。
- Hyperliquid Vault：Vault 到 Leader Main Perps、Leader Main Perps 到 Vault，以及在 Standard/Manual leader 模式下 Leader Main Perps 到 Main Spot 加上 Main Spot 到 Main Perps。
- Bybit：Unified 到 Funding 以及 Funding 到 Unified。
- Binance：USD-M Futures 到 Funding 以及 Funding 到 USD-M Futures。
- Bitget Classic：USDT Futures 到 Spot 以及 Spot 到 USDT Futures。
- Bitget UTA：UTA 到 Spot 以及 Spot 到 UTA。

## 内部转账

1. 在侧栏选择一个受支持的交易所账户。
2. 选择一个服务器公布的固定路由。
3. 查看新鲜的源余额、实际可转账金额、目的地余额、资产和路由最小值。
4. 输入不超过 **Available to transfer** 的金额。
5. 点击 **Review transfer**。
6. 在 PBGui 对话框中确认确切的账户、路由、金额、源和目的地。

PBGui 从所选的已配置账户解析每个源和目的地。路由选择器只包含服务器派生的允许路由；地址和资产不可自由编辑。不需要 Profit Sweep 策略。

**Direction** 选择器直接位于 **Amount** 和 **Review transfer** 旁边。如果 Hyperliquid Vault leader 使用 Unified 或 Portfolio Margin，Hyperliquid 会将 Main Perps 和 Main Spot 公开为一个共享的 **Main Unified** 余额。PBGui 随后正确省略 Main 到 Spot 的方向，并在转账控件旁显示该说明；这些合并账户之间不需要内部转账。

对于 Vault 账户，预览区分 **Your Vault Equity** 与完整的 **Vault Account Value** 以及 Hyperliquid 的用户特定 **Your Max Withdrawable** 值。它还列出每个经过清理的开放 Vault 持仓，包括币种、方向、数量、仓位价值、入场价、未实现 PnL、清算价和杠杆类型。转账不直接修改或平仓，但移动保证金会影响 Passivbot 基于钱包敞口的仓位规模、可用保证金和后续订单大小。

## 操作安全

每笔转账都获得浏览器生成的幂等 UUID，并在交易所 I/O 之前持久化。账户操作锁防止它与另一个 Profit Sweep 或手动转账操作竞争。未解决的 Profit Sweep 意图或手动转账会阻止新转账。

PBGui 每个操作最多提交一次，并执行有界的账本对账。丢失的浏览器响应只能使用保留的相同操作 ID、路由和金额重试。**Unknown** 操作公开 **Reconcile**，它只查询交易所历史，从不重新提交转账。提交中的操作阻止 API 重启；启动时对账已提交的操作，并将中断的预提交转账标记为失败而不发送它。

某些交易所历史记录不包含 PBGui 的操作 UUID。因此 PBGui 在同一个十分钟匹配窗口内阻止自己的相同路由和金额操作。在 PBGui 操作期间不要通过其他客户端发起相同的手动转账；外部创建的相同记录可能无法可靠区分。

转账历史与 Profit Sweep Live 意图和 Test Transfers 分开。它显示路由、请求和收到的金额、时间戳、状态以及有界的错误或对账原因，而不暴露地址、描述符、签名、凭据或原始提供商响应。

提交声明之后的意外错误被记录为 **Unknown**，保留描述符和 nonce，并只记录经过清理的诊断信息。

## 路由与资产

路由对、资产和最小转账金额由每次快照中经过验证的交易所能力得出。刷新侧栏中的账户以获取当前值。当交易所返回缺失或不一致的账户数据时，PBGui 拒绝该操作而不是猜测。

## 转账历史

转账历史按时间顺序列出每笔记录的操作。完成的行显示请求的金额和收到的金额（当交易所报告时）。失败和 Unknown 行显示有界原因，例如被拒绝的权限、超出可转账余额或不匹配的路由。

## 常见问题

- **我需要在 Transfers 页面配置 Profit Sweep 策略吗？** 不需要。Transfers 完全独立于 Profit Sweep 策略运行。
- **为什么某个方向不可用？** 路由来自最新的服务器快照。如果账户模式或保证金设置不匹配，该方向会被省略。刷新账户以确认。
- **如果我在转账过程中关闭浏览器会发生什么？** 操作 ID 在提交前已持久化。重新打开页面并使用 **Reconcile** 查询交易所历史。PBGui 不会自动重新提交。
