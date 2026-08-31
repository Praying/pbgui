# PBCoinData 服务

PBCoinData 是一个后台服务，负责获取 CoinMarketCap（CMC）的列表与元数据，并构建交易所符号映射。这些映射为 PBRun 使用的动态币种过滤逻辑（`ignored_coins.json` / `approved_coins.json`）提供数据支撑。

## PBCoinData 做什么

PBCoinData 运行一个守护循环（60 秒周期），执行以下任务：

- 按可配置的调度获取 CMC 列表（排名、市值、成交量、标签）
- 获取 CMC 元数据——主要是 `notice` 字段（用于动态过滤的下架/迁移警告）
- 为所有 V7 支持的交易所（binance、bybit、bitget、gateio、hyperliquid、okx）构建按交易所区分的符号映射（`data/coindata/{exchange}/mapping.json`）
- 检测各交易所的跟单交易（copy-trading）符号（bybit：来自 CCXT 市场数据；binance/bitget：通过经过身份验证的 API 并自动发现用户）
- 通过基于交易所行情价格的消歧逻辑，解析重复的 CMC 符号（如 HOT、ACT）
- 为 Hyperliquid HIP-3 股票永续合约符号运行 TradFi 同步（网页抓取仅限 Master，规格同步在所有节点进行）
- 运行自愈循环，自动重试映射失败的交易所（指数退避）
- 将服务日志写入 `data/logs/PBCoinData.log`

## 配置

单击 Services 总览页上的 PBCoinData 卡片。凭据在 **Pool** 中管理；非机密调度设置保留在 **Settings** 中。

### CMC 池

使用 **Pool -> Add Key** 添加一个或多个 CMC 密钥。机密存储在仅所有者可访问的凭据保险库中，绝不会由状态 API 或显示控件返回。

- 允许 **Imported / externally used**（导入/外部使用）的密钥，并参与本地公平选择。
- 当同一提供商配额在本 PBGui 条目之外共享时，标记 **Shared quota**。
- Cluster Sync 分发密封代次；不要把 CMC 密钥放进 `pbgui.ini`，也不要为每个 VPS 单独配置一个。
- 可用时 Leases 负责协调使用，但属于尽力而为。如果租约不可用，每个节点会回退到本地软预算。
- 提供商的 `429` 会让该密钥进入冷却，请求可故障转移到另一个合格密钥。无效、已禁用、已耗尽、冷却中或冲突的密钥会被跳过。
- **Rotate** 是可选的，会用一个新的不可变代次替换所选密钥。**Disable** 保留其历史；**Delete** 会发布一个墓碑记录。

PBCoinData 可以在没有就绪池的情况下运行，以刷新交易所侧的映射输入；但在至少一个活动密钥完成实体化之前，CMC 列表与元数据获取会被跳过。

### 调度

| 设置 | 默认值 | 说明 |
|---|---|---|
| `Fetch Interval` | `24` | 重新获取 CMC 列表的频率（小时） |
| `Fetch Limit` | `5000` | 每次 CMC 调用获取的最大符号数 |
| `Metadata Interval` | `1` | CMC 元数据刷新频率（天） |
| `Mapping Interval` | `24` | 交易所映射重建间隔（小时） |

大多数部署使用免费的 Basic 套餐即可。状态栏和 Pool 标签页会显示就绪状态、活动密钥数、健康度、代次、本地使用量、提供商报告时的剩余额度、冷却状态、失败情况以及不含机密的租约统计。

## PBCoinData 详情面板

单击 Services 总览页上的 PBCoinData 卡片（或使用侧边栏）打开详情面板：

- 控制条显示当前状态（运行中/已停止）以及 Start/Stop/Restart 按钮
- **Log** 标签页提供实时过滤的 PBCoinData 日志查看器
- **Pool** 标签页管理 CMC 凭据以及不含机密的池/租约状态
- **Settings** 标签页提供上文所述的配置表单

## 自愈循环

如果某个交易所的映射构建失败（例如由于临时网络错误），PBCoinData 会在下一个周期自动以指数退避重试该交易所。日志中会出现 `[self-heal]` 条目记录这些重试。

## 数据文件

| 路径 | 说明 |
|---|---|
| `data/coindata/coindata.json` | CMC 列表快照 |
| `data/coindata/metadata.json` | CMC 元数据快照 |
| `data/coindata/{exchange}/mapping.json` | 交易所符号 → CMC 币种映射 |
| `data/coindata/{exchange}/ccxt_markets.json` | 原始 CCXT 市场快照 |
| `data/logs/PBCoinData.log` | 服务日志 |

## 故障排除

- **没有 CMC 数据**：确认 PBCoinData 正在运行，且 **Services -> PBCoinData -> Pool** 报告至少一个已实体化的活动密钥
- **映射过期**：检查 `data/logs/PBCoinData.log` 中是否有重复的 `ERROR` 或 `self-heal` 条目
- **CMC 限流错误（429）**：受影响的密钥进入冷却，池会尝试另一个合格密钥；如果所有密钥都持续受限，请增大 `fetch_interval`
- **PBRun 中的忽略/批准列表没有更新**：确认 `data/coindata/{exchange}/` 下存在映射文件，并重启一次 PBCoinData
