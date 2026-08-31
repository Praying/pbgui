# 教程：Strategy Explorer 快速入门

本教程帮助你从"打开 Strategy Explorer"开始，在共用的 PB7/PB8 页面外壳和工作流中逐步理解所看到的内容。

---

## 1) 选择市场

1. 直接打开 Strategy Explorer，或从 PB8 Run、PB8 Backtest、Backtest Results 或 Pareto Explorer 中使用 **Strategy Explorer**。
2. 在共用控件中：
   - 选择 **Exchange**
   - 选择 **Coin**
3. 确认所选窗口的 K 线已加载。

PB7 使用现有的本地 OHLCV 选项。PB8 将其数据源标记为 **PB8 native candles**，并使用原生 PB8 K 线准备流程。通过传递打开时，会预加载其配置和适用的覆盖配置。

---

## 2) 设置 Analysis Time

1. 使用 **Start Date** 和 **Start Time** 选择一个时刻。
2. 一开始将 **Chart Context** 设置得相对较小，例如 3-10 天。

经验法则：

- Start Date/Start Time 选择第一根显示的 K 线。Chart Context 向前延伸；其右侧边缘的 K 线就是 Analysis Time，并提供快照状态。
- PB8 入场订单使用传入的空仓持仓；PB8 平仓订单使用该价格处的代表性假设持仓。

PB8 快照不是实时账户状态，也不是预测。

---

## 3) 阅读快照

请关注：

- 入场订单价位
- 平仓订单价位
- 可用的策略参考线或跟踪线
- Long/Short 参数和摘要值

PB7 保留现有的本地/PB7 引擎快照行为。PB8 显示的是传入状态下的原生理想订单，而不是历史上实际挂在交易所的精确订单。

问问自己：

- 入场价位是否符合预期？
- 代表性的平仓输出是否过于激进或保守？
- 更改参数后是否产生预期效果？

---

## 4)（可选）运行 Simulation

如果你想查看历史成交：

1. 打开 **Simulation**。
2. PB7 用户选择 **PBGui Simulation** 或 **PB7 Backtest Engine**。
3. PB8 用户运行 **PB8 Native Replay**。

PB8 重放是针对所选 K 线的有边界原生回测，服务器限制为 20,000 根 K 线和 2,000 条显示成交。它不会预测实时账户。

---

## 5) 后续步骤

- 如需将已保存结果与计算结果核对，请继续阅读"Compare"。
- 如需为 K 线窗口制作动画，请继续阅读"Movie Builder"。
