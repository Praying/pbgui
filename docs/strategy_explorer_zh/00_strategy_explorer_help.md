# Strategy Explorer - 帮助

Strategy Explorer 是 PB7 和 PB8 策略共用的可视化调试与分析 GUI。两个版本使用相同的页面外壳和工作流；版本特定的引擎、字段、标签和不可用控件会自动适配。

- 在选定的 **Analysis Time** 创建一个**快照**。
- 执行有边界的**模拟**或带成交记录的原生重放。
- 使用 **Compare** 工作流比较已保存的结果和新计算结果。
- 使用 **Movie Builder** 执行按时间步进的重放。

PB7 保留现有的本地/PB7 引擎行为。PB8 使用原生 PB8 计算和 K 线准备流程。

---

## 核心概念

### 交易所 / 币种

Strategy Explorer 始终针对一个市场运行：

- **Exchange**：例如 `bybit`
- **Coin**：所选配置和本地引擎数据中可用的市场

PB7 使用其配置的本地 OHLCV 数据源。PB8 使用 **PB8 native candles**；如果明确指定的 OHLCV 目录位于已批准的 PB8/PBGui 根目录之外，则会拒绝使用。没有合适的 K 线时，Strategy Explorer 会显示明确的不可用快照外壳，并带有传入的配置和调参字段，但无法计算原生理想订单，也无法重放所选时间窗口。

Exchange 和 Coin 是分析选择器。更改它们不会重写配置中的 exchanges，也不会重写其中可能不同的 Long 和 Short 已批准币种列表。

### Analysis Time（最重要的控件）

**Start Date** 和 **Start Time** 选择快照上下文窗口中的第一根 K 线。**Analysis Time** 是计算快照时位于右侧边缘的 K 线。

- **Chart Context** 从所选起点向前延伸。
- 这个有边界窗口右侧边缘的 K 线提供快照价格、指标和订单状态。
- PB7 保留现有的本地/PB7 引擎状态行为。
- PB8 根据传入的**空仓持仓**计算原生理想入场订单。
- PB8 根据所选价格处的**代表性假设持仓**单独计算平仓订单。

PB8 快照解释的是上述传入状态下的策略行为。它不是对实时账户、实时持仓或未来订单的预测。

### 上下文窗口

图表显示从 Start Date/Start Time 开始的有边界窗口：

- **Chart Context** 控制显示多少向前延伸的 K 线历史记录，以及在哪一处计算快照状态。

---

## 变体 / 模式

### 1) Snapshot（单视图）

共享快照会渲染入场和平仓订单、参考线，以及所选版本返回的策略参数。

PB8 从已安装的 PB8 运行时派生调参组、字段类型、选项和范围。编辑内容会写回规范化的嵌套 PB8 路径，同时保留完整的传入配置。

对于 PB7，这是现有的 PB7/Rust 计算视图。对于 PB8，入场和平仓输出来自上文所述的两种传入状态计算。因此，PB8 平仓订单展示的是一个代表性持仓，而不是历史或实时账户状态。

此模式有助于回答以下问题：

- “这些参数如何影响入场和平仓？”
- “为什么某个订单价位很紧或很宽？”
- “更改一个策略参数会如何影响快照？”

### 2) Simulation / native replay

**Simulation** 阶段遍历所选 K 线窗口并记录成交。

- **PBGui Simulation** 是现有的 PB7 本地 K 线遍历。
- **PB7 Backtest Engine** 使用现有的 PB7 引擎路径。
- **PB8 Native Replay** 在内存中运行原生 PB8 回测，不会写入结果目录。

PB8 重放严格受所选窗口和服务器限制约束：最多 20,000 根重放 K 线，以及 2,000 条显示成交。它从 PB8 的原生空仓状态开始；由于原生重放 API 不接受手动起始持仓，因此无法设置手动起始持仓。这是历史重放，不是对实时账户的预测。

### 3) Compare

PB7 保留现有的两种比较选项：

- **PB7 Backtest Result vs PBGui Simulation vs PB7 Backtest Engine**
- **PBGui Simulation vs PB7 Backtest Engine**

PB8 提供 **Stored PB8 Result vs Fresh PB8 Replay**。PB8 结果传递会在服务器端通过与所有者绑定的不透明草稿 ID 保留已验证的结果位置；浏览器不会接收或编辑该路径。Compare 会读取已保存的成交，并针对传递的配置和窗口运行一次有边界的原生重放。除非存在已验证的已保存结果或与运行时不同的固定配置，否则 Compare 不会报告成功；当 K 线数量限制只覆盖已保存成交范围的一部分时，会显示警告。

### 4) Movie Builder

PB7 保留现有的三个引擎：

- **PBGui Simulation**：带有不断变化的网格和成交的本地重放。
- **PB7 Backtest Engine**：PB7 引擎成交/即将成交视图。
- **PB7 fills.csv (from backtest)**：无需重新计算，直接可视化记录的结果成交。

PB8 提供 **PB8 Native Replay**。它的影片使用原生 PB8 重放返回的真实分步聚合 K 线和成交。PB8 上游不会公开每一帧的历史理想订单轨迹，因此 PBGui 无法显示每根 K 线对应的精确历史挂单入场/平仓梯级。每帧为空的订单梯级是有意设计的。基于成交的持仓标注仅在显示的成交范围内可用，并会在达到成交显示限制后停止。

---

## 直接传递 PB8

你可以从以下位置直接打开共享的 PB8 Strategy Explorer：

- **PB8 Run**
- **PB8 Backtest**
- PB8 **Backtest Results**
- PB8 **Pareto Explorer** 结果

这些传递会通过经过身份验证的不透明草稿传入规范配置和适用的覆盖配置。如果引用的稀疏覆盖配置无法加载，PBGui 会阻止传递，而不是打开不完整的配置。PB8 Backtest Results 传递还会为 **Compare** 保留已验证的已保存结果来源信息，但不会在页面或 URL 中暴露文件系统路径。它会首先选择结果数据集已验证的来源交易所、具有已保存成交的第一个已批准币种，以及该成交的 UTC 时间；已验证的数据集元数据作为后备信息。

PB8 参数字段如果距离当前 Optimize 下限或上限在 5% 以内，会直接在调参面板中标记。如果配置没有某个字段的 Optimize 边界，则使用已安装运行时的参数范围。要比较两个 Pareto 候选项，请选择第一个候选项，点击 **Pin Explorer Baseline**，再从同一结果中选择另一个候选项，然后打开 **Strategy Explorer**。结果发生变化或页面重新加载时，页面级基准会被清除。与所有者绑定的草稿会同时携带两个配置，**Compare** 会让两者通过相同的原生 PB8 重放契约运行。

PB8 Strategy Explorer 草稿属于当前经过身份验证的会话，闲置 10 分钟后过期；API 重启会立即清除草稿。浏览器请求使用同源 HttpOnly 会话 Cookie，绝不会使用渲染或存储的 bearer token。最多同时运行两个原生 PB8 辅助操作。运行时更新冲突或辅助操作槽位已占用时，会返回可重试的繁忙响应。更改配置或操作控件会使较早的浏览器请求失效，因此迟到的结果无法覆盖当前选择。

---

## Long/Short 网格显示（阅读方式）

Strategy Explorer 可以根据配置显示 Long 和/或 Short。

### Long

- **Long entry grid**：开启或增加 Long 持仓的买入订单。
- **Long close grid**：减少或关闭 Long 持仓的卖出订单。

### Short

- **Short entry grid**：开启或增加 Short 持仓的卖出订单。
- **Short close grid**：减少或关闭 Short 持仓的买入订单。

### 双边启用

当 Long 和 Short 都启用时：

- Snapshot 可以同时显示两边的输出。
- Movie Builder 提供 **Side** 值 `Auto`、`Long` 和 `Short`。

请记住，PB8 快照的平仓计算会针对每一边分别使用独立的代表性假设持仓。

---

## 常见问题

### “我看不到任何订单/标记”

先检查所选市场、方向和时间窗口：

- Analysis Time 或影片窗口可能没有覆盖任何成交。
- PB8 的某一方向可能因风险/持仓设置而被禁用。
- PB8 Movie Builder 不包含每帧的历史理想订单梯级；使用 Snapshot 检查某个传入状态下的原生理想订单。
- PB8 Backtest Results 传递会为 Compare 提供已保存结果来源信息；请确认所选的新重放窗口覆盖了已保存成交。

---

## 下一步

- 在 Strategy Explorer 页面内的 Strategy Explorer 文档选择器中阅读教程。
