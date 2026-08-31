# Profit Sweep

## 用途

Profit Sweep 将已实现交易利润的可配置份额从交易账户转移到该交易所的固定内部目的地。它使用累计净已实现 PnL、funding、费用、交易所更正和高水位标记。提款和内部转账不计为交易亏损，亏损必须先恢复，新的利润才有资格。

每个交易所用户都有独立的策略，状态为 **Disabled**、**Dry**、**Live** 或 **Paused Unknown**。Profit Sweep 从不接受外部地址，也从不执行链上提款。

## 设置与权限

打开 **System > Profit Sweep** 前，先在 **System > API Keys** 下配置交易所用户。使用支持账户读取和内部转账的最小权限集：

- **Hyperliquid Standard/Manual** 要求配置并批准的 API agent。账户必须保持 Standard/Manual 模式。
- **Bybit** 要求读/写访问和钱包 `AccountTransfer` 权限。不需要提款权限。
- **Binance** 要求读取访问和 **Permits Universal Transfer**。不需要提款权限。
- **Bitget** 要求读取和转账访问加 API 口令。UTA 转账以禁用借贷方式提交。
- **Hyperliquid Vault** 操作使用配置的 leader API agent。Vault 本身没有私钥。

Overview 立即报告读取能力。请求 Live 或测试转账时，从新鲜服务器端快照检查写入能力。显示的路由不覆盖缺失凭据、错误的账户模式、过期历史、负债、锁定或交易所限制。

## 基本字段

- **Reference capital** 是利润被扫走前保留的交易资金。
- **Baseline mode** 在策略启用时或从可用的全生命周期历史开始记账。
- **Trigger percent** 设置相对于参考资金的利润门槛。
- **Sweep percent** 选择每个新高水位利润增量的份额。
- **Minimum transfer amount** 累积较小的到期金额，并应用于 Dry 和 Live 决策。
- **Safety reserve amount** 与所选储备模式一起，将可转账余额保留在源账户中。

**Keep trading capital** 将 Trigger percent 设为 `0`，Sweep percent 设为 `100`。它不启用或保存策略。高水位和亏损恢复仍然适用。

## 高级字段

策略限制包括固定、百分比或两者取大的储备；可选每笔转账和 UTC 日上限；以及首次 Live 追赶转账的单独上限。调度字段控制防抖、静默和稳定期、正常和 Vault 冷却、抖动、最大历史年龄和最大预检年龄。

Vault 高级字段控制提款模式、保留的 leader 权益、leader 份额安全缓冲、Vault 储备、条件成本处理以及所选 Main 目的地的活动策略。交易所精度、最小值、可转账余额、保证金、锁定、负债、借贷和恰好一次安全规则保持服务器所有。

## Dry 与 Live

**Enable Dry** 运行计划的只读决策。**Evaluate now** 始终是非提交预览：它不创建意图、不更改确认总额、不签署请求、不移动资金。符合条件的 Dry 结果显示在 Dry Decision Journal 中，标记为 `WOULD TRANSFER`。

**Evaluate now** 还刷新源、配置的内部目的地和当前可转账金额的 Exchange / Vault 余额卡片。对于 Vault 账户，**Your Vault Equity** 是 leader 拥有的当前权益，**Vault TVL** 是所有存款人的总权益，**Your Share** 是 leader 在该 TVL 中的份额。成功的 Live 激活或测试转账操作刷新相同的卡片。Vault 目的地更改会在 Main Perps 和 Main Spot 之间切换显示的目的地。已确认的空 Binance Funding Wallet 显示为零；失败或不支持的交易所余额读取显示为不可用。

对于 Unified 或 Portfolio Margin 模式下的 Hyperliquid Leader，PBGui 从共享的 USDC 现货清算余额显示 **Main Unified**。Hyperliquid 在这些模式下将单独的 perp `marginSummary` 值报告为无意义，通常为零。Standard/Manual Leader 继续显示单独的 Main Perps 和 Main Spot 余额。

Hyperliquid 现货清算响应成功但余额列表为空，意味着账户有零 Spot USDC，显示为 `0 USDC`。只有缺失或格式错误的余额响应显示为不可用。

**Enable Live** 前，选择 Live 基线：

- **Fresh** 在激活快照处开始权利，并排除之前的 Dry 权利。
- **Include Dry Period** 从当前 Dry 代基线重新计算权利。

活动基线模式与所选设置分开存储。在任何 Live 转账确认前，在活动的 **Fresh** 策略上选择 **Include Dry Period**，并使用显式真实资金确认的 **Apply baseline to active Live**。PBGui 然后从 Dry 期间追溯重新计算 Live 基线，并调度新的 Live 评估；之前的 Dry 利润可能立即到期。普通策略保存从不触发此重新计算。确认的 Live 转账后或意图未解决时该操作被阻止，防止重复权利。

可选的首次 Live 追赶上限只限制第一次追赶；任何剩余部分保持到期。启用 Live 需要共享确认，保存所选设置，并运行服务器拥有的预检。Live 然后评估，在交易所 I/O 前准备持久意图，最多提交一次，并协调结果。**Disable** 阻止未来的计划提交，而不删除转账历史。

## 调度

**Hybrid** 结合 PBData 收入提示与周期性回退。提示启动结算防抖，而静默和稳定期允许成交、费用、返佣和 funding 结算。**Interval** 只使用周期性评估。抖动将账户分散到时间上，冷却限制成功转账，新鲜度限制拒绝旧或不完整数据。

提示只唤醒调度器。每个提交的决策获取新鲜交易所数据，历史或最终快照不完整时失败关闭。

## 交易所路由

- **Hyperliquid Standard/Manual：** USDC，Perps 到用户自己的 Spot 余额。
- **Bybit：** USDT 或 USDC，Unified Trading Account 到 Funding。
- **Binance：** USDT 或 USDC，USD-M Futures 到 Funding。
- **Bitget Classic：** USDT，USDT Futures 到 Spot。
- **Bitget UTA：** USDT，UTA 到 Spot/Funding，禁用借贷。
- **Hyperliquid legacy Vault：** USDC，leader 拥有的 Vault 权益到 Leader Main Perps，可选后接 Main Perps 到 Main Spot。

服务器解析当前 Bitget 模式，并针对所选交易所用户验证每条固定路由。路由绝不跨到另一个 UID 或外部目的地。

## Vault 与存款人

Vault 记账使用 leader 自己的当前 Vault 权益、份额和现金流，而不是将总 Vault PnL 分配给 leader。属于其他存款人的存款、提款和利润不成为 leader 扫走权利。可归属的 leader 佣金已经保留在 Main Perps 中，因此在此版本中仅作诊断；它绝不导致从 Vault 再次提款。

资格还考虑 `maxWithdrawable`、共享保证金、保留的 leader 权益、强制 leader 份额加安全缓冲、锁定、持仓、订单和配置的储备。**Flat Only** 要求没有未平仓持仓或订单。**Margin Buffered** 只允许在保守的可提款上限内活动。所有权不明确、Vault 关闭或锁定、份额不一致或禁止活动时失败关闭。

**Main Perps** 在 Vault 提款后结束。**Main Spot** 创建第二个持久意图，只转发确认为已收到的金额。关闭成本、强制减仓、取消、缺失已收金额或意外目的地活动可以暂停未来的扫走。

## 费用与条件成本

Bybit 将其内部路由记录为免手续费。Binance 和 Bitget 对这些内部路由不暴露转账费字段，因此 PBGui 不记录直接费用，也不将其视为交易所保证。Hyperliquid Perps-to-Spot 对用户自己的活动地址通常没有 gas、交易或滑点成本。

Vault 提款可能产生 `closingCost`、交易费或滑点，如果使用保证金持仓必须减仓。PBGui 记录协调的费用和成本字段，并应用配置的条件成本策略。选择 Main Perps 避免可选的第二次转发请求。

## 测试转账与转回

受支持的标准和 Hyperliquid Vault 账户在 **Exchange / Vault** 中显示 **Test transfer**。它独立于策略、Dry journal、扫走权利和确认的 Live 总额。

1. 单击 **Test transfer**，输入正十进制金额（标准账户默认 `1`，Vault 默认 `5`），然后继续。
2. 审查源、目的地、资产和真实资金将移动的显式警告。
3. 确认提交一个通过固定路由持久化的正向操作。
4. 在 Test Transfers 表格中查看其状态。
5. 最新正向操作 **Confirmed** 且合格时，单击 **Transfer back** 并确认固定反向路由。

对于 Hyperliquid Vault，正向路由从 Vault 提款到 Leader Main Perps。此 Vault-to-Main 路由在 Leader 使用 Unified 账户模式时也有效；只有可选的 Main Perps-to-Spot 转发需要 Standard/Manual 模式。显式确认的手动测试不继承自动 **Flat Only** 策略，但 Hyperliquid 在持仓或订单活动时报告 `alwaysCloseOnWithdraw` 仍然阻止它，因为路由测试不得改变交易状态。PBGui 否则允许在新鲜保守的 leader 拥有 Vault 上限内的任何正测试提款。默认保持 5 USDC。**Transfer back** 只在协调的已收金额至少为 5 USDC 时提供，因为 Hyperliquid 拒绝更小的 Vault 存款。

对于标准账户，返回使用协调的已收金额（可用时），否则使用请求金额。返回从不重新提交正向操作。**Unknown** 没有重试或转回操作；检查交易所和日志，而不是创建盲重复。

正向或返回操作后，PBGui 执行单独的刷新只读余额刷新。该刷新失败时，持久操作状态保持权威，页面要求你用 **Evaluate now** 重试余额读取。

Hyperliquid 接受手动测试提交后，PBGui 在将结果分类为 Unknown 前轮询固定只读账本查询最多十秒。账本索引延迟绝不触发另一次提交；只有协调读取被重复。

每个正向测试操作携带一个浏览器生成的幂等 UUID。PBGui 在交易所 I/O 前原子地声明该持久操作，因此并发请求或丢失 HTTP 响应后的确切重复正向请求返回同一操作而不再次提交。Transfer back 绑定到已确认的正向操作，只允许一个持久反向操作，并拒绝重复请求而不是再次提交。Submitting 状态的测试转账阻止 API 重启。启动通过交易所历史协调中断的已提交测试，绝不重复其写入请求。

Hyperliquid 目前将成功的 `agentSendAsset` 移动记录为 `delta.type = "send"` 的非 funding 账本事件。签名操作包含规范令牌 ID（`USDC:0x…`），而 Ledger 事件报告符号（`USDC`）。PBGui 在确认操作前比较该符号加确切目的地、DEX 对、金额、nonce 和时间窗口。

对于 Spot-to-Perps 返回，描述符的逻辑目的地是 `default_perps`，而签名操作和 Ledger 事件使用账户自己的钱包地址作为 `destination`。协调比较签名操作目的地，因此正向和反向路由使用相同的提供商身份。

PBGui 通过固定密封端点发布 Hyperliquid 签名操作，并只存储有界、地址编辑的提供商拒绝原因。签名和请求体从不持久化或渲染。在此诊断支持之前创建的较旧失败 Vault 测试操作只能显示 Hyperliquid 拒绝了操作；需要新的显式确认测试才能获得确切编辑的提供商指导。

Hyperliquid L1 提交在没有可选签名上下文或过期时使用只包含 `action`、`signature` 和 `nonce` 的当前规范信封。`vaultAddress` 和 `expiresAfter` 的 Null 字段与官方 SDK 完全一样省略。目标 Vault 保留在签名的 `vaultTransfer` 操作内。PBGui 计算 Leader 保留时减去一个微 USDC，使提款后余额严格大于 100 USDC 和配置的份额下限，而不是恰好等于。

持久化描述符使用排序 JSON 进行稳定完整性检查，但 Hyperliquid MessagePack 哈希依赖对象键顺序。每次签名和提交前，PBGui 以当前官方架构顺序重建 `agentSendAsset` 和 `vaultTransfer` 操作。这在 API 重启和准备操作间保持确定性。标准账户和 Vault Live 转账都使用其验证的 API agent 路径。

## 意图与协调

**Live Transfer Intents** 表格显示持久的 **Prepared**、**Submitting**、**Confirmed**、**Failed** 和 **Unknown** 状态。Prepared 在交易所 I/O 前持久化。Confirmed 只在协调后更新记账。Failed 是明确的非转账结果。

Unknown 意味着 PBGui 无法证明交易所是否执行了请求。策略变为 **Paused Unknown** 并阻止新的 Live 提交。**Reconcile** 使用相同的持久操作身份再次查询交易所；它绝不盲目提交第二次转账。测试转账操作保持独立，并有意不为 Unknown 提供重试操作。

对活动 Live 策略的更改需要显式财务确认和确切当前策略指纹，防止过期浏览器标签页覆盖较新设置或激活与审查不同的设置。结算资产或基线记账更改、基线重置和策略删除要求先禁用 Live。已确认的 Vault 提款无法立即创建其 Main-Spot 转发腿时，PBGui 暂停策略并暴露同一第一腿的协调；它绝不执行另一次 Vault 提款。

## 故障排除

- **Unsupported or unavailable：** 在 API Keys 下验证交易所类型、凭据、权限、Hyperliquid agent 批准和账户模式。
- **Live 激活被拒绝：** 查看 Overview 原因，然后检查完整历史、快照新鲜度、资产、负债、保证金、锁定和转账权限。
- **没有扫走发生：** 检查模式、触发、高水位恢复、最小金额、储备、限制、冷却、到期金额和下次评估时间。
- **测试转账被拒绝：** 使用不超过新鲜可转账余额的正金额。低于 5 USDC 的 Vault 提款允许但不能提供 Transfer back。可返回的 Vault 测试要求正的保守 leader 拥有提款上限、提款后严格大于 100 USDC 和 5% Leader 保留、至少收到 5 USDC，以及足够的 fresh Leader Main 余额用于返回。Hyperliquid 报告 `alwaysCloseOnWithdraw` 时，先停止交易、平掉 Vault 并取消所有订单再测试。对于 Binance，为 API 密钥启用 **Internal/Universal Transfer**；不需要提款。
- **Bybit Evaluate 正常但转账不可用：** 为 API 密钥启用 **Account Transfer** 权限。钱包和交易历史读取对 Dry 评估仍然足够；PBGui 不从多资产抵押总额推断可转账 USDT 金额。
- **Bitget Spot 显示不可用：** Wallet Transfer 权限足以移动资金。只有 PBGui 应显示 Spot 余额和查询转账历史时才启用 Bitget Spot 读取权限。Bitget 返回成功同步转账 ID 但禁止历史读取时，PBGui 从该交易所确认确认而不重新提交。

Bitget Classic 转账历史协调使用必需的 `coin`、`fromType` 和持久化 `clientOid` 过滤器。Bitget 将转账数量命名为 `size`；PBGui 对 Futures-to-Spot 和 Spot-to-Futures 都将其与请求金额精确匹配。
- **Unknown 操作：** 不要重试或转回。比较操作时间和金额与交易所历史，打开 Logs，并且只对 Live 意图使用 Reconcile。
- **Vault 暂停：** 检查锁定、持仓/订单、leader 份额、保留权益、目的地活动、已收金额以及任何关闭成本或强制减仓。

浏览器请求使用 PBGui HttpOnly 会话 Cookie。API 密钥、私钥、口令、描述符、固定路由负载和原始交易所响应不会渲染到此页面。
