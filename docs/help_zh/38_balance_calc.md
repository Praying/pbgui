# 余额计算器

共享的 Balance Calculator 根据配置的批准币种、持仓数、钱包敞口限制、初始入场大小和交易所最小订单规模，估算运行 PBv7 或 PBv8 配置所需的钱包余额。

## 如何打开

从以下位置打开独立页面：

- **Information → Balance Calculator**：加载 PBv7 或 PBv8 实例，或粘贴 PBv7/PBv8 配置
- **PBv7 → Run**：单击实例上的 **$** 操作
- **PBv7 → Backtest**：打开配置或选择结果，单击 **Balance Calculator**
- **PBv8 → Backtest**：打开配置或选择 PBv8 结果，单击 **Balance Calculator**

两个 Backtest 页面还提供 **Calc Balance**，无需离开页面即可快速内联计算。

对于 PBv8，精确的 `approved_coins` 值 `all` 会从所选交易所的本地映射展开。只考虑使用 PB8 默认报价的活动线性 swap 市场，计算前移除按方向的忽略币种。

PB8 初始规模遵循活动策略架构：trailing 策略使用 `strategy.entry.initial_qty_pct`，而 EMA Anchor 使用其根 `strategy.base_qty_pct`。因此内联 Calc Balance 操作和独立页面为 PB8 Backtest 结果产生相同的建议。

## 布局

| 区域 | 内容 |
|------|---------|
| 左列 | 可编辑的配置 JSON |
| 工具栏 | 可选的带版本标签的 PBv7/PBv8 实例、交易所选择器和 Calculate 按钮 |
| 右列 | 建议、按方向的余额和币种最小订单信息 |

## 工作流

1. 从 Information、Run 或 Backtest 打开计算器。
2. 加载带版本标签的 PBv7/PBv8 实例、跟随 Backtest 传递，或粘贴 PBv7/PBv8 配置。
3. 配置了多个交易所时选择 **Exchange**。
4. 可选地直接在左侧文本区编辑配置 JSON。
5. 单击 **Calculate** 计算余额要求。

## 交易所选择

- Backtest 和 Run 传递会预选其检测到的交易所。
- 直接导航默认使用当前下拉框选择。
- 你可以随时使用 **Exchange** 下拉框更改交易所。

## 编辑配置

- 左侧文本区以 JSON 显示完整配置。
- 更改在单击 **Calculate** 时应用。
- 无效 JSON 显示错误而不提交计算。

## 结果

单击 **Calculate** 后，右列显示：

- 带 10% 缓冲的推荐钱包余额，向上取整到下一个 10 USDT
- 每个多/空币种所需的余额
- 计算使用的币种价格和最小订单信息

对于 PBv7，机器人参数从 `bot.<side>` 读取。对于 PBv8，持仓数和敞口从 `bot.<side>.risk` 读取，而初始入场大小从 `bot.<side>.strategy.<live.strategy_kind>.entry.initial_qty_pct` 读取。PBv7 Dynamic Ignore 仍然支持。两个版本都通过本地 CoinData 映射解析市场最小值。

## 故障排除

- **某一侧没有结果**：验证该侧有批准币种、正的持仓数和敞口限制，以及正的初始入场大小。
- **CoinData 未配置**：在 **System -> Services -> PBCoinData -> Pool** 下添加或激活 CMC 池密钥，并等待本地实体化。
- **PBv7 币种列表意外**：如果启用了 Dynamic Ignore，CoinData 设置可能过滤批准币种。
