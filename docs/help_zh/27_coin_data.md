# Coin Data

Coin Data 页面现在位于 FastAPI UI 外壳中，专注于符号映射质量、CoinMarketCap 覆盖率和交易所交易约束，而不改变底层 CoinData 服务的逻辑。

## 此页面做什么

- 构建并刷新各交易所的符号映射
- 合并 CoinMarketCap 数据，如排名、市值、标签和元数据
- 更新实时价格以及派生的 `vol/mcap`
- 显示跟单交易可用性以及交易所限制，如最小数量、最小成本、精度和杠杆

## FastAPI 布局

该页面使用标准的 FastAPI 外壳：

- 共享的顶部导航和 About 对话框
- 左侧边栏用于操作和视图切换，桌面端宽度可调
- 主内容区顶部为过滤器行，下方恰好有一个活动表格视图
- 表格分区标题沿用现有 FastAPI Backtest 和 Run 页面的样式

FastAPI 头部中的 Guide 按钮打开共享的帮助系统。

## 侧边栏操作

- `Refresh Selected Exchange`
  - 获取市场、更新跟单交易缓存、重建映射，并刷新当前交易所的价格
- `Refresh All Exchanges`
  - 对所有 V7 交易所运行相同的工作流
- `Refresh CMC + Selected Exchange`
  - 重新加载 CMC 列表和元数据，然后刷新所选交易所，使可见表格立即使用新的 CMC 数据
  - 现有工作流运行时，显示居中的忙碌浮层，并根据已完成的刷新步骤给出真实百分比进度
- `Refresh CMC + All Exchanges`
  - 重新加载 CMC 列表和元数据，然后重建所有交易所，使每个交易所映射在单次运行中与新 CMC 数据对齐
  - 在更长的完整重建工作流中，使用相同的真实百分比忙碌浮层
- `Matched Symbols`
  - 显示匹配的主结果表
- `CMC Unmatched`
  - 只显示未匹配的 CMC 符号表
- `HIP-3 Symbols`
  - 只显示 Hyperliquid HIP-3 表，且仅在 `hyperliquid` 交易所显示
- `Only Copy Trading`
  - 将主表限制为跟单交易符号，且仅在支持跟单交易过滤的交易所显示（`bybit`、`binance`、`bitget`）

## 新鲜度信息

Coin Data 在 `Filtered symbols` 旁边以内联状态显示新鲜度信息。

- 可见文本是所选交易所刷新和最近一次 CMC 刷新的紧凑摘要。
- 悬停内联状态会显示详细的市场、映射、价格、跟单交易缓存、列表和元数据时间戳。

## CMC 就绪状态

CMC 刷新操作要求本地已实体化的 CMC 池中至少有一个活动凭据代次。Coin Data 在启动 CMC 任务前会进行检查，并在池不可用时直接报告错误；仅交易所刷新仍然可用。在 **System -> Services -> PBCoinData -> Pool** 下添加或检查密钥。不要把密钥加到 `pbgui.ini`。

在 VPS 目标上，就绪状态是不含机密的可用性元数据：协议版本、活动密钥数以及目录/已实体化代次。节点只有在所需的密封代次在本地实体化后才算就绪。

## 过滤器与表格行为

主要过滤器：

- Exchange
- 最小 `market_cap` 在输入时实时更新，编辑时保持十进制输入稳定，并使用 `250` 作为编辑器风格的 `+/-` 步长
- 最大 `vol/mcap` 在输入时实时更新，保留 `0.` 和 `0,` 等直接十进制输入，`+/-` 会跨过从当前交易所数据派生的可读取整阈值，而不是使用微小的原始值步长
- Tags 使用与 PBv7 Run/Backtest 相同的可搜索芯片式多选，下拉框内没有复选框
- 过滤器行右侧的 `Reset` 按钮用于恢复默认过滤状态

FastAPI UI 改进：

- 可滚动表格中的粘性表头
- HIP-3 表在桌面端保留自己的滚动容器，长符号列表仍可正常使用，专用的 `DEX` 选择器放在 HIP-3 分区标题中而不是全局过滤器行
- 更紧凑的表格行和标签芯片，减少浪费的纵向空间
- 全宽表格布局，列分布均衡，页面使用可用宽度且数值之间没有过大的间隙
- 桌面端活动表格视图扩展以使用剩余的窗口高度，而不是在表格下方留下空白
- 匹配、未匹配和 HIP-3 视图均可排序的表头
- 标签、通知和长值的悬停提示
- 行选择带居中的浮动详情面板：浏览器窗口允许时打开即自动适配内容，可从各边和四角拖动和调整大小，显示所有标签不截断，映射存在时提供直接的 `Open CMC` 链接，并使用 `X` 关闭按钮，而不仅仅在表格下方显示通知
- 单一活动主表格视图（从侧边栏切换），而不是同时显示匹配表和辅助表
- 单行桌面过滤器栏，没有单独的 `Filters` 标题块

页面包含：

- **Matched symbols** 表：过滤后匹配的非 HIP-3 行
- **CMC unmatched** 表：当前未匹配到 CMC 的符号
- **HIP-3 symbols** 表（仅 Hyperliquid）
- 对所有非 Hyperliquid 交易所隐藏 `HIP-3 Symbols` 侧边栏按钮。
- 在不支持跟单交易检测的交易所上隐藏 `Only Copy Trading` 侧边栏按钮。

## Hyperliquid 说明

- 报价偏好默认为 `USDC`，其次是 `USDT0`
- 如果没有找到 HIP-3 符号，Coin Data 可以自动重建一次 Hyperliquid 映射
- HIP-3 行单独显示并使用专用的 `DEX` 选择器；`market_cap`、`vol/mcap` 和 tags 等基于 CMC 的过滤器应用于匹配的非 HIP-3 行

## 数据文件

Coin Data 在以下位置读写：

- `data/coindata/coindata.json`
- `data/coindata/metadata.json`
- `data/coindata/<exchange>/ccxt_markets.json`
- `data/coindata/<exchange>/mapping.json`
- `data/coindata/<exchange>/copy_trading.json`

## 故障排除

### 没有显示行

- 刷新所选交易所
- 暂时放宽过滤器（`market_cap=0`、更高的 `vol/mcap`、无标签）
- 检查 CMC 和映射时间戳
- 如果 `Only Copy Trading` 处于活动状态，请禁用它

### 某些符号缺少价格

- 再次刷新所选交易所
- 验证交易所市场时间戳是否最新
- 对于 Hyperliquid，请记住某些符号依赖 market-info 回退定价

### CMC 未匹配计数很高

- 先刷新 CMC 数据，再刷新所选交易所
- 检查符号是否新上市或使用交易所特定的命名变体
- 如果 CMC 刷新被阻止，请在重试前确认 PBCoinData Pool 已就绪
