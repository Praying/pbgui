# Market Data

此页面管理 PBGui 针对 Hyperliquid、Binance USDM、Bybit、OKX 和 Bitget 的行情数据工作流，包括 l2Book 存档下载、TradFi 符号映射、1m 自动刷新循环和 Build best 1m OHLCV 任务。

## 推荐工作流——最佳实践

这是让所有币种保持最新、回测立即开始的最快、最省存储的方式。

### 第 1 步——为所有币种启用 Auto-Refresh

1. 打开 **Settings (Binance USDM Latest 1m Auto-Refresh)** → 清除过滤器 → 单击 **Select visible** → **Save**
2. 打开 **Settings (Latest 1m Auto-Refresh) — Hyperliquid** → 清除过滤器 → 单击 **Select visible** → **Save**
3. 将交易所下拉框切换到 **Bybit** → 打开 **Settings (Bybit Latest 1m Auto-Refresh)** → 清除过滤器 → 单击 **Select visible** → **Save**
4. 如果你使用 OKX 和 **Bitget** 的本地 1m 数据集，请对它们重复。

这会为滚动更新循环注册所有币种。循环会自动保持最近几天的最新状态——初始回填后无需进一步手动操作。

Settings API 响应包含附加的 `apply` 对象，带 `timing`、`restart_required` 和安全 `message`。Latest-1m 设置在下一次 PBData 周期应用；存档路径和 TradFi 配置文件由下一个操作读取。不暗示全局 Market Data 设置监视器或服务重启。

### 第 2 步——运行 "Build best 1m all" 进行初始回填

转到 **Build best 1m OHLCV** 并单击 **Build best 1m all**（或选择所有币种并提交）。

这会为每个交易所排队一个后台任务，从上线之日起下载完整历史：

| 交易所 | 下载方法 | 预期时长（首次运行） |
|---|---|---|
| **Binance** | 并行月度 + 每日 ZIP（data.binance.vision）+ CCXT 补漏 | ~2–4 小时（~550 币种） |
| **Bybit** | CCXT（异步） | ~3 小时（~550 币种） |
| **OKX** | 官方存档 ZIP 加 REST 修复 | 取决于所选币种和历史 |
| **Bitget** | 仅 REST `USDT-FUTURES`，可选分布式 | 单下载器完整 BTC 历史 ~7–9 分钟 |
| **Hyperliquid**（加密） | l2Book 存档 + 1m_api 转换 | 取决于 l2Book 存档大小 |
| **Hyperliquid**（XYZ 股票永续） | Tiingo IEX/FX 1m | 取决于映射符号数和 Tiingo 配额 |

**来自实际运行的基准：**
- Binance LINK（6+ 年，2,239 天，74 个月度 ZIP）：并行 ZIP 下载 **41 秒**
- Binance 全部 ~550 币种（并行 ZIP）：**预计 2–4 小时**（外推：平均币种 ~3 年 ≈ 24 个月度 ZIP → ~20 秒/币种）
- Bybit 全部 548 币种（CCXT，实测）：**~3 小时**（仅 BTC = 102 分钟，短期币种增加比例很小）
- Bitget BTC 从上线起（仅 REST，实测）：360 万根 K 线 **~8 分 39 秒**；全交易所时长取决于所选币种和可选下载器。

两个任务都在后台运行。你可以关闭浏览器再回来。使用 **Running** 面板查看进度。

### 第 3 步——验证最后一个完成的任务

任务完成后，在任务面板中打开 **Done** 任务并单击 **🔍**（原始 JSON）。检查：
- `status: done`（不是 `failed`）
- `last_result.days_checked` — 匹配预期覆盖范围
- `last_result.minutes_written` > 0
- 任何 `notes` 条目（例如 `monthly_download_failed=...` 表示该月使用了每日 ZIP 回退——最近月份的 ZIP 尚未发布时正常）

### 第 4 步——Auto-Refresh 保持数据最新

初始回填后，每日更新是自动的：

- Binance：最近 **2–7 天** 每周期通过 CCXT 每 3,600 秒（1 小时）刷新
- Bybit：最近 **2–7 天** 每周期通过 CCXT 每 3,600 秒（1 小时）刷新
- OKX：最近 **2–7 天** 每周期每 3,600 秒（1 小时）刷新
- Bitget：最近 **2–7 天** 每周期通过公共 REST 每 3,600 秒（1 小时）刷新
- Hyperliquid：最近 **2–4 天** 每周期通过 API 每 1,800 秒（30 分钟）刷新

需要立即刷新时，在相应的 **Market Data Status** 面板中点击 **⏩ Run now**。

### 为什么这样

- **磁盘占用最小** — 数据存储为压缩 `.npz` 文件（每个币种每天一个）；`.npz` 比 PB7 未压缩的 `.npy` 缓存小约 35%——例如 BTC/USDT Binance：**61 MB**（pbgui `.npz`，2019 年 9 月至今）对比 **89 MB**（PB7 `.npy` 缓存，2019 年 12 月至今）
- **回测立即开始** — 无需按需获取；本地文件已预建并就绪
- **增量** — 后续 "Build best 1m all" 运行跳过已完成的天（预扫描），只下载新数据
- **无重复存储** — 每个币种每天一个 `.npz` 替换任何之前的部分版本

---

## 页面布局

展开器按此顺序显示：
1. 所选交易所的 Settings (Latest 1m Auto-Refresh)
2. 所选交易所的 Market Data 状态
3. Build best 1m OHLCV
4. TradFi Symbol Mappings
5. 从 AWS 下载 l2Book（仅 Hyperliquid）

## Market Data 页面

`Market Data` 页面现在直接在 FastAPI 实现上运行，侧边栏通过三个专用子部分暴露设置区域：

侧边栏现在只用于导航：它包含主页面分区加上上下文相关的 `Settings` 操作，没有单独的概览或状态摘要信息框。

- `Coin Refresh` — 交易所刷新设置和启用币种工作流
- `AWS / l2Book` — Hyperliquid 存档下载设置
- `TradFi / Tiingo` — 服务器端 Tiingo 配置文件状态和 TradFi 映射控件

该页面上的共享 `Guide` 按钮直接在页面浮层中打开此 `Market Data` 主题，因此阅读时当前 Market Data 视图保持可见。

侧边栏不再显示单独的 `Actions` 分区。它改为暴露留在页面内的直接快捷方式：

- `OHLCV Data` 也留在 FastAPI 内：该面板活动时，侧边栏显示所选交易所的数据集按钮，而不是面板内标签页。
- `Build Best 1m` 为当前交易所打开专用 FastAPI 面板。
- `Download l2Books` 在选择 `Hyperliquid` 时直接打开嵌入的 Hyperliquid 数据操作面板。

`Build Best 1m` 和 `Download l2Books` 现在也使用与其他 Market Data 侧边栏条目相同的活动按钮高亮，因此当前打开的快捷分区直接在侧边栏中可见。

在该 FastAPI `Best 1m` 面板内，Hyperliquid 以聚焦方式复用完整的下载/构建操作组件：`Best 1m` 只显示构建内容，`Download l2Books` 只显示下载内容。额外的外部头部卡片、嵌套窗口框架和展开器头在那里被移除，只保留实际表单内容。

Hyperliquid `Best 1m` 现在也更接近较新的 FastAPI 编辑模式：构建范围使用与 Backtest/Optimize 编辑器相同的编辑器风格弹出日历，币种选择器渲染为多列启用币种网格，带 `Filter enabled coin list`、`TradFi only`、`No downloaded history`、`Select visible` 和 `Clear all`，而不是旧的紧凑下拉框。XYZ 构建选项限于具有可用 Tiingo 或 Tiingo FX 代码的规范映射；`pending`、`no_provider` 和 `delisted` 符号不提供，因为下载器无法获取它们。对于 XYZ 币种，`No downloaded history` 保留本地源索引中没有 Tiingo 支持的 `other_exchange` 分钟的任何符号，因此当前 Hyperliquid 日单独不会隐藏仍需要历史回填的币种。两个开关都可以与文本过滤器组合。可见币种行现在可直接点击，也支持鼠标拖动选择，因此无需逐个复选框即可标记或清除更大范围。快速拖动移动现在还会在光标更新之间插值行，因此快速绘制式选择不再跳过币种。

Hyperliquid `Download l2Books` 现在也使用相同的币种网格模式，而不是旧的紧凑下拉框。你可以过滤启用币种列表、直接点击可见行、批量选择当前过滤切片、清除显式选择，或跨可见网格拖动以快速绘制更大的下载范围。`XYZ-*` / TradFi 符号在那里被排除，因为 Hyperliquid l2Book 存档下载只适用于原生币种。选择保持为空时仍会排队所有剩余可下载币种。

聚焦的 Hyperliquid 面板现在在 `Best 1m` 和 `Download l2Books` 之间切换时也会重新适配其嵌入高度，因此较短的下载视图不再保留之前较高构建视图的空尾部和额外滚动条。

嵌入的 Hyperliquid 视图现在还避免了第二个内部页面滚动条，滚动保持在主 Market Data 页面上，而不是在页面和聚焦面板之间分割。

对于 Binance、Bybit、OKX 和 Bitget，币种选择器直接在 FastAPI 面板中使用设置风格的可用币种网格：`Filter available coin list` 缩小网格，`Select visible` 添加当前过滤切片，`Clear all` 重置显式选择，你可以用鼠标跨可见币种行拖动以快速添加或移除更大范围。快速拖动移动也填充中间行。选择保持为空时排队所有可用币种，而任何显式选择将 Best 1m 任务限制为恰好那些币种。

该 FastAPI `Best 1m` 视图对 Binance、Bybit、OKX 和 Bitget 直接以构建字段开始。冗余的介绍头文本和额外的顶部 `Refresh` 按钮被移除。

对于 Binance、Bybit、OKX 和 Bitget，FastAPI `Best 1m` 构建面板在完整构建表单下方直接显示过滤的 Job Monitor，因此无需离开面板即可观看所选交易所的排队、运行中、完成和失败任务。

构建区域现在也更扁平：币种/构建分区不再位于额外的圆角卡片框架内，嵌入的 Job Monitor 去掉其独立页面框架，使整个视图读起来像一个连续的 Market Data 面板。

嵌入的 Job Monitor 现在也随自身内容高度增长，因此外部 Market Data 页面已可滚动时，监视器区域内不再出现第二个滚动条。

嵌入监视器 URL 现在携带当前 PBGui serial 作为缓存破坏器，因此前端更新也会刷新 iframe 本身，`View` 等新监视器操作立即可见，而不停留在较旧的缓存副本上。

Hyperliquid 使用自己的内联数据操作页面而不是共享 iframe，该内联 Job Monitor 现在也为活动、完成和失败任务包含相同的 `View` 操作，使详情模态框在 Market Data 和 `System -> Services` 之间保持一致。两个监视器变体中的待处理行现在也暴露 `Run`，它请求一个额外的同类型手动并行槽位，因此一个选中的待处理任务可以与同类型正在运行的任务同时启动。活动行现在也保持稳定的排队/开始顺序，实时进度更新不再来回打乱两个运行中的任务。两个变体中的 `View` 和 `Log` 对话框也限制在可见浏览器视口内，并且现在跟随浏览器滚动位置和裁剪父面板（如可滚动的 `Build Best 1m` 容器），因此关闭按钮保持在实际可见的监视器区域内，而不是在其上方打开。

两个监视器变体严格以文本渲染任务负载、进度值和后端错误，同时保留相同的卡片、按钮、对话框和展开器。来自持久化任务或外部错误消息的意外值不能变成可执行页面标记。

其操作对话框现在也在页面内样式化：取消、删除、重试、重新排队和批量删除确认不再回退到浏览器原生弹出窗口。

FastAPI `OHLCV Data` 面板现在将完整的数据审查工作流保留在一处。所选交易所直接在侧边栏获得数据集按钮：`1m`、`PB7 cache` 和单独的 `PB8 cache` 清单始终可用，而 Hyperliquid 还显示 `1m_api` 和 `l2Book`。主面板然后显示摘要指标、可过滤的清单表、可写数据集的删除工具、覆盖热图、可用时的分钟热图，以及可选的 OHLCV 详情图表。两个运行时缓存清单都是只读的，即使交易所、时间框架和币种名称匹配也使用单独的 SQLite 清单键。

该 FastAPI OHLCV 详情图表现在使用惰性缩放加载。初始 iframe 只提供粗略图层，因此长历史可靠地重新打开，滚轮缩放按需拉取更精细的 K 线，而不是预先嵌入完整的 `15m` / `5m` / `1m` 金字塔。

iframe 模板本身现在再次作为真实 HTML/JS 提供，因此图表不再因为嵌入脚本中的转义引号字符而停滞在空白的 `Loading chart...` 面板上。

在 Hyperliquid `OHLCV Data` → `l2Book` 中，`Select All` / `Deselect` 旁边的工具栏现在也暴露一个默认关闭的开关，以包含完全没有 l2Book 文件的已启用非 XYZ 币种。这使得可以清单表中直接发现 l2Book 覆盖完全缺失的币种，而不是只看到已至少有一个存档小时的币种。

`OHLCV Data` 侧边栏现在保持仅按钮。`Delete older than` 被 `Delete by Date` 替换；单击它打开一个小对话框，带截止日期选择器和删除预览，而不是把该额外输入块永久嵌入侧边栏。

该对话框现在也更接近更清晰的 Backtest 编辑器日期控件模式：截止字段有可见日历按钮，当前删除范围在小的可滚动列表中显示所选币种名称，因此多币种删除在确认前保持显式。

最终删除确认现在也保持在 PBGui 样式内：删除操作打开居中的确认窗口，带当前范围和适用时的所选币种，而不是浏览器原生弹出窗口。

在 `OHLCV Data` 中选择一个或多个币种时，侧边栏暴露与当前数据集视图匹配的排队操作。在 `1m`、`1m_api` 和 `PB7 cache` 中，这保持当前交易所所选币种的 `Build best 1m`。在 Hyperliquid `l2Book` 中，侧边栏改为为那些所选币种暴露 l2Book 下载排队操作，因此清单视图不再在那里提供无关的 Best 1m 任务。清单侧边栏现在仅按钮：排队/删除确认和错误不再保留在持久侧边栏提示中，而是通过正常 toast/通知路径或现有确认对话框。此清单 UI 中的可见币种标签现在只使用短币种名称，包括表格、侧边栏操作按钮和热图/OHLCV 标题。

在 `PB7 cache` 和 `PB8 cache` 中，表格上方的工具栏在 `Select All` 和 `Deselect` 旁边还包括一个小的时间框架快速过滤器。用它选择币种前在 `all`、`1m` 和 `1h` 行之间切换，避免同一币种存在于两个缓存时间框架时出现的短名称重复。

在 Hyperliquid 清单视图中，类型过滤器现在也支持 `xyz only`、`xyz mapped` 和 `xyz not mapped`。表格为 Hyperliquid 行显示 `mapping` 列，因此你可以立即看到每个可见 XYZ 工具的有效 TradFi 映射状态，包括 `mapped`、`no provider` 或 `pending` 等状态。活动 XYZ 工具不再仅仅因为 `tradfi_symbol_map.json` 中的旧条目尚未刷新而显示为 `delisted`；实时 Hyperliquid 映射仍列出该符号时，PBGui 现在解析活动的非 delisted 状态。

清单表现在也使用与 FastAPI Backtest/Optimize 表格相同的鼠标选择行为：单击切换单行，跨行拖动添加或移除连续范围，`Select All` 只选择过滤后当前可见的行。

清单表头也可排序。单击列头在当前数据集视图中可见行的升序和降序之间切换。

## Copy Data

使用 **Copy Data** 通过 SSH 用 `rsync` 将本地 OHLCV 文件从此 PBGui `data/ohlcv` 树复制到另一个 PBGui 主机。

- **SSH command without target** — 用作 rsync 远程 shell 的 SSH 命令。不要在这里包含最终目标。支持的形式为 `ssh`、`ssh -p 2222`、`ssh -J user@jump-host` 和 `ssh -J user@jump-host -p 2222`；`-o ProxyCommand` 等支持 shell 的选项被拒绝。
- **Remote target** — rsync 使用的最终 SSH 目标，例如 `user@target-host`、`target-host`、用于反向隧道的 `localhost` 或 SSH 配置别名。
- **Destination data/ohlcv root** — 目标主机上的绝对 `data/ohlcv` 根目录。目标 PBGui 使用与本机相同的路径时留空。

复制任务更新新文件和更改过的文件。它们从不使用 `--delete`，因此只存在于优化器系统上的文件保持不动。

先单击 **Test connection** 运行只读 SSH 和目标路径检查。它不创建目录，也不复制文件。

要在真实复制前验证确切目标路径和预计 rsync 传输，请单击 **Dry run**。干运行排队一个带 `--dry-run --stats --itemize-changes` 的后台任务；它跳过远程 `mkdir`、不写文件，并在嵌入的 Copy Job Monitor 日志中记录每个交易所的 rsync 统计。

### Copy Schedules

使用 **Copy Schedules** 自动保持一个或多个优化器系统最新。计划存储当前 SSH 命令、远程目标、目标根目录和交易所选择。

- 输入计划名称和 1 到 168 整小时的间隔。
- 启用计划并单击 **Save schedule**。其首次自动复制在一个完整间隔后开始。
- 使用 **Run now** 从已保存设置立即复制。
- 使用 **Edit** 将计划加载回 Copy Data 表单，更改其目标、交易所、间隔或启用状态，然后再次保存。
- 计划复制跨 API 重启持久。上一个任务仍待处理或运行时，计划绝不会开始第二次复制。

每个自动或手动计划运行像常规复制任务一样出现在同一嵌入 Copy Job Monitor 中。其自己的复制任务活动时删除计划被阻止；分离的复制工作器在 API 重启后安全继续。

## Settings (Latest 1m Auto-Refresh) — Hyperliquid

控制 Hyperliquid 符号的自动 1m K 线刷新循环。

- **Enabled coins** — 从所有已知 Hyperliquid 符号多选
- **Clear filter + Select visible / Clear all** — 快速启用或禁用所有币种
- **Cycle interval (s)** — 所有启用币种刷新频率（默认：1800 秒）
- **Pause between coins (s)** — 币种间延迟以避免限流（默认：0.5 秒）
- **API timeout per coin (s)** — 每币种请求超时（默认：30 秒）
- **Min / Max lookback days** — 最新获取的窗口（默认：2 / 4 天）
- 更改保存到 `pbgui.ini`，并在下一个周期应用——无需重启。

Hyperliquid latest-1m 追赶请求现在可以正确保留完整配置的 4 天 `candle_snapshot` 预算。之前本地限流器中的突发上限不匹配可能强制重复 `budget_timeout` 结果，即使 API 请求本身有效。

## Settings (Binance USDM Latest 1m Auto-Refresh)

控制 Binance USDM 永续的自动 1m K 线刷新循环。

- **Enabled coins** — 从所有已知 Binance USDM 币种多选
- **Clear filter + Select visible / Clear all** — 快速启用或禁用所有币种
- **Cycle interval (s)** — 所有启用币种刷新频率（默认：3600 秒）
- **Pause between coins (s)** — 币种间延迟（默认：0.5 秒）
- **API timeout per coin (s)** — 每币种请求超时（默认：30 秒）
- **Min / Max lookback days** — 最新获取的窗口（默认：2 / 7 天）
- 更改保存到 `pbgui.ini`，并在下一个周期应用——无需重启。

带乘数前缀的合约在该资产只有这一个市场时保留其短币种名称，例如 `1000SHIB` 保持 `SHIB`。如果同一交易所和报价同时列出两个合约，PBGui 保持它们分开：`1000CAT` 是 Simon's Cat，`CAT` 是 Binance 和 Bitget 上无前缀的 Caterpillar 市场。现有 Market Data 选择从旧的歧义 `CAT` 名称迁移到 `1000CAT`；如果你想在自动刷新或 Best 1m 构建中也包含无前缀市场，请单独选择 `CAT`。

## Settings (Bybit / OKX / Bitget Latest 1m Auto-Refresh)

这些交易所使用相同的启用币种、周期间隔、暂停、API 超时和最小/最大回看控件。默认值为 3,600 秒周期，2–7 天回看。更改在下一次 PBData 周期应用，无需重启。

对于 Bybit，该窗口中每个完成的 24x7 市场日都会在写入刷新文件前验证所有 1,440 个连续分钟。失败的分页或不完整的已关闭日被丢弃而不替换现有数据，下一个小时周期重试。覆盖还会替换该日的源覆盖，因此热图不能保留过期的分钟可用性。

自动 Bybit 周期只刷新运行中的 UTC 日。在 `00:15 UTC` 或之后的第一个周期，PBData 为每个启用币种完成前一天。成功结果记录在 `data/ohlcv/checksums.sqlite` 中并在重启后存活；只有失败的币种在后续小时周期重试。

Bitget 只列出活动的 USDT 线性 swap。其最新刷新和历史 Best 1m 回填使用公共 `USDT-FUTURES` REST K 线端点。一个本地下载中的工作线程共享 18 req/s 限制器并在限流时一起退避；避免并发启动多个 Bitget 下载，因为交易所限制适用于公共 IP。没有 Bitget 存档回退。本地非分布式回填会重新请求不完整的历史日，并报告 Bitget 无法提供的分钟数。

## Market Data Status

使用此部分监控最新获取循环、清单和后台任务健康度。

状态展开器打开时每 5 秒自动刷新。

Market Data Status 面板和 Gap Heatmap 的短 toast 消息现在也写入 PBGui 全局通知日志，因此你稍后可以从右上角通知铃重新打开它们，而不是只依赖短暂页内弹出。

### 控制按钮

- **⏩ Run now** — 跳过剩余等待并立即触发下一个刷新周期
- **⏹ Cancel queued refresh** — 刷新已排队时出现以替代 Run now；在周期开始前取消它
- **⏹ Stop current run** — 活动周期中出现；发送停止信号，使 PBData 在当前币种完成后中止

### 进度条

周期运行时，进度条显示 `coins done / total` 和当前正在处理的币种。

### 状态表

显示最后一个完成周期的每币种结果：
- 只显示当前启用币种集中的币种；FastAPI 监视器立即过滤过期行，下一个 PBData 周期也会从存储状态中丢弃它们。
- `last_fetch` — 上次尝试的时间戳
- `result` — `ok`、`error` 或 `skipped`
- `lookback_days` — 获取的天数
- `minutes_written` — 该次运行写入的 K 线数
- `note` — `no_local_data` 表示之前没有本地数据；自动使用最大回看
- `next_run_in_s` — 到下一个周期的预计秒数

对于 Bybit，状态还用 `current_result`、`current_minutes_written`、`finalization_day`、`finalization_result` 和 `last_finalized_day` 将当日刷新与每日完成分开。

### 重启行为

重启后，PBData 在其正常启动偏移后开始新周期。已完成的 Bybit 完成使用持久校验和目录跳过；失败或中断的币种保持有资格进行下一个小时尝试。

## OHLCV 完整性

打开 **OHLCV Integrity** 检查 Market Data 顶部所选交易所的每日校验和目录。只读扫描、摘要、分组发现、校验和和公共参考比较支持 Binance USDM（`binanceusdm` 存储）、Bybit、OKX、Bitget 和 Hyperliquid 加密。Hyperliquid XYZ/TradFi 目录在实现会话感知验证前被排除。

更新后自动排队初始 Bybit 扫描。Binance USDM、OKX、Bitget 和 Hyperliquid 加密的扫描在首次推出中有意手动，因为组合存档包含大约 180 万个每日文件。选择交易所并使用 **Run full scan**；完整性扫描任务串行化。扫描完成前，该交易所显示 `Pending`。非 Bybit 目录是时间点快照，其底层文件更改后必须重新扫描。

重复完整扫描复用纳秒修改时间和大小未变的文件的目录结果。这些文件仍被发现，因此删除或新添加的天保持可见，但其 NPZ 负载不重新打开或重新哈希。更改的文件以及初始/当日分类可能更改的天总是重新验证。

对于每个币种，其最早本地每日文件中的连续后缀分类为 `inception_partial`；扫描器不合成第一个本地文件之前的缺失日期。较晚的部分日和内部缺口保持无效。最新部分已关闭日不能仅凭其本地位置被接受。

发现按币种分组，带损坏天数、日期范围、缺失分钟数和验证原因。所有五个交易所提供 **Repair coin** 和 **Repair all**。Bybit 使用其精确日完成器；Binance USDM、OKX 和 Bitget 通过其正常构建器只重新获取请求的损坏日。Hyperliquid 修复从可用 Hyperliquid API/L2Book 数据改进该精确日，然后从 Binance 后接 Bybit 填充剩余分钟。每条路径重新计算校验和，结果仍不完整时保留发现。

完整性验证 Passivbot 使用的高、低、收盘和成交量值。High/Low 之外的交易所 Open 值被接受，因为 Open 不存储在 Passivbot 的回测表示中。对于 Hyperliquid，**Normalize fallback candles** 为 Cross-Exchange Fallback 创建的历史 `other_exchange` 分钟提供已确认的维护任务。它只扩展 High/Low 以包含现有 Open/Close；时间戳、Open、Close、Volume、缺口和源分配保持不变。新生成的回退 K 线自动规范化。

表格总是加载所有当前损坏的天。**Repair all** 在一个可取消的后台任务中顺序运行它们。一天失败保留在结果中，不停止其余修复。完整性任务完成时摘要卡片和行自动刷新。

Repair Queue 每个币种使用一行，而不是为每个损坏日重复币种。每行汇总其损坏天数、日期范围、总缺失分钟数和原因计数。**Repair coin** 运行一个顺序批次，范围为该币种的所有损坏日。

使用 **Details** 在修复前检查每个损坏日。分钟覆盖视图显示 24 个每小时的 24 小时行，每分钟一个单元格：存在的 K 线为绿色，最早本地日上的前导范围为黄色（可能是交易所上线边界），内部缺口为红色，尾部缺口为橙色。分组币种有多个发现时提供日选择器，范围表列出精确 UTC 开始/结束时间和分钟数。

分钟图上方，**Surrounding Days** 显示所选日期前后各七天，作为紧凑的 24 小时覆盖行。完整小时为绿色，部分小时为橙色，缺失小时为红色。任何已编目的相邻日都可以点击检查其完整分钟覆盖，包括不属于 Repair Queue 的有效日。

Repair Queue 的 **Missing** 计数排除最早本地币种日上的前导范围，因为交易可能只是晚于 `00:00 UTC` 开始。详情视图仍以黄色显示那些缺失分钟。只有从第一个可用 K 线到 `23:59 UTC` 的缺失分钟算作损坏。

Repair All 重试瞬时网络/超时失败一次。Bybit 从确切当前工具的 `launchTime` 独立验证交易所上线时间，当本地损坏文件会掩盖它时。Binance 从确切当前市场的 `onboardDate` 应用等效检查，因为 Binance 可能复用符号同时仍通过存档和 API 服务上一代工具。任一交易所确认更新的上线时间时，**Repair coin** 或 **Repair all** 自动移除该日期之前完整的过时本地代，包括其源索引覆盖和校验和行，同时保留自确认上线时间起的所有天。未来的 Binance 完整构建也从该当前 `onboardDate` 开始，因此旧代不会再次下载。任务结果单独报告移除的天。Binance BTC USDT 期货于 `2019-09-08 19:00 UTC` 上线，Bybit XTZ 于 `2021-01-11 05:50 UTC` 上线，各自有一个独立确认的源原生缺口；PBGui 只记录那些确切分钟为 `source_gap`，而不是伪造 K 线或重复尝试不可能的修复。如果仍有天失败，成功的修复保持保存，但批次显示在 **Failed** 下并带部分结果，而不是作为完全成功显示在 Done 下。

Hyperliquid 精确日修复在运行正常 Binance 后接 Bybit 回退前，检查本地和配置的存档/NAS L2Book 小时。它还在最终验证前为该精确日上任何现有历史 `other_exchange` K 线扩展 High/Low 以包含 Open/Close。历史日仍不完整时，PBGui 将每个精确缺失分钟与当前捐赠工具的本地 `onboardDate`/`launchTime` 元数据比较。被证明早于两个捐赠者的分钟（包括没有匹配捐赠者的原生 PURR 历史）编目为 `source_gap`。元数据说捐赠者可能覆盖某分钟时，PBGui 要求对两个捐赠者都成功查询精确日，才接受该分钟不在其保留历史中；网络或交易所错误保持该日损坏且可修复。源缺口行离开 Repair Queue，但在单独的 **Source gaps** 摘要计数中保持可见。状态绑定到未更改的 NPZ 指纹或完整日的持续缺失，因此新或修改的数据自动严格重新验证。PBGui 绝不为此分类创建结转 K 线。

**Unavailable Coin Data** 表限定到所选交易所，并列出其当前 `mapping.json` 中缺失或不活动的每个本地币种，包括现有文件仍然有效的币种。**From** 和 **To** 显示每个市场的最早和最晚本地每日 OHLCV 文件。单击行或跨行拖动选择范围，然后使用 **Remove selected** 或 `Delete` 键。**Remove all** 选择每个当前可移除的不可用市场。一个服务器端预览重新验证完整选择，并在所需确认前显示其市场数、文件数、大小和日期范围。一个持久批量任务然后在删除其完整 PBGui OHLCV 原始数据和源索引前立即重新检查每个市场；单个失败不跳过后续市场并保持在任务结果中可见。不安全行从 Remove all 排除。移除的市场从 Repair Queue 排除。PB7 和 PB8 运行时缓存不移除。**Repair all** 跳过不可用市场并单独报告其数量。

校验和共享使用配置的 Config/Optimize 存档：

- **Publish checksum snapshot** 在 Bybit 完成完成且所有五个交易所扫描完成后启用每日一次发布。
- **Publish archive** 只接受配置的可写自有 GitHub 存档，带服务器端访问令牌。
- **Reference archive** 可以独立选择任何配置的公共 GitHub 存档。仅比较系统不需要令牌或集群成员资格。
- **Publish now** 要求所有五个交易所扫描完成，创建一致的 SQLite 备份，压缩为 `checksums.sqlite.gz`，并替换固定 `checksums-latest` GitHub 发布上的资产。
- **Refresh reference** 匿名下载该发布资产，验证它，失败时保留之前的良好副本，并只读地与本地目录比较。

校验和快照只包含 OHLCV 标识符、每日计数、验证状态、时间戳和内容哈希。存档凭据保持服务器端，绝不包含在 Market Data 任务负载、发布 URL 或日志中。所选参考仓库必须是公共的才能匿名下载。

---
- PBGui 和 PB7 缓存数据的只读清单
- 基于源码的覆盖视图
- 股票永续构建的带日/月上下文的任务进度
- 在股票永续分钟视图中，`market holiday` 和 `expected out-of-session gap` 的叠加高亮可以关闭，以直接检查原始缺失缺口
- 分钟视图包括可选的 `OHLCV chart` 展开器，带交互式 Plotly K 线和成交量条，用于快速视觉验证
- FastAPI 页面上的概览和分钟热图保持 Plotly 滚轮缩放禁用，其 Plotly modebar 只在悬停时出现。因此正常页面滚动不会意外缩放那些热图，但需要时绘图工具仍然可用
- 图表使用惰性缩放：完全缩小时显示粗略 K 线（通常 `1d`），放大时自动重新计算更细时间框架——无需手动选择时间框架
- 在 FastAPI 页面上，那些更细的 K 线在 iframe 内按需获取，使非常长的历史保持响应，而不是预先加载完整细分辨率负载
- 那些 FastAPI 惰性加载现在使用更小的时间框架特定窗口，只获取当前需要的精确细图层，使缩放交互明显更流畅
- FastAPI 图表以平移模式打开并保持其 Y 轴可移动，因此缩放后你可以上下拖动可见 K 线，而不是被迫保持自动适配的垂直位置
- FastAPI 图表现在还在重新渲染间保持你选择的 Plotly 交互模式，并将平移/缩放吸附回真实 K 线跨度，因此它不再意外翻转工具或漂移到空图表窗口
- 过期的 FastAPI 缩放请求一移动就立即中止，相同时间框架的平移避免额外重新布局工作，除非可见跨度真正改变，使图表在快速检查期间更响应
- 在数据边缘，FastAPI 现在保持当前缩放跨度并使其靠近最近有效边界，而不是弹回完整范围，使靠近端点的拖动感觉更自然
- FastAPI 现在还将新获取的细窗口合并到已加载的客户端图层中，而不是替换它，因此你刚检查的 K 线不会在进一步平移时再次消失
- FastAPI 现在还区别对待缩放和平移限制：缩放裁剪到与加载数据的实际所选重叠，而平移在边缘保持跨度。使矩形缩放行为更接近你实际选择的区域
- 缩回但仍在同一细时间框架内时，如果缓存的客户端窗口不再覆盖大部分可见范围，FastAPI 现在重新加载该相同时间框架。避免图表仍显示 `1m` 但所选窗口大部分为空的情况
- FastAPI 现在还将已加载的细时间框架窗口跟踪为单独的客户端覆盖间隔，而不是折叠成一个 `first candle .. last candle` 块。缩放检查可以看到之前加载窗口之间的真实未覆盖孔洞并获取它们，而不是在可见图表区域内留下空白区
- FastAPI 重新加载相同细时间框架时，现在重绘实际 Plotly 轨迹，而不是只更新布局。确保新获取的 K 线立即可见，而不是留下图表徽标为 `1m` 而缺失部分看起来仍然为空
- FastAPI 现在还检查当前相同时间框架视图中加载 K 线的实际数量。`1m` / `5m` / `15m` 窗口实际为空（尽管当前时间框架徽标）时，它触发相同时间框架重新加载，而不是只信任覆盖启发式
- FastAPI 现在还在限制或重新渲染图表前规范化没有显式时区的 Plotly relayout 范围。深层 `1m` 缩小因此保持在预期时间窗口，而不是按浏览器本地时区偏移跳回
- FastAPI 现在还在复用前以更高小数精度规范化 Plotly 滚轮/relayout 时间戳。避免罕见的深层 `1m` 滚轮缩小中可见范围可能崩溃成空条，即使预期窗口中有 K 线
- 币种名称作为标签显示在图表左上角
- 对于股票永续，历史股票拆股日期显示为垂直虚线橙色线并带注释（如 "Split 20:1"）；OHLCV 数据自动按拆股调整
- 拆股因子数据按交易所存储在 `data/coindata/hyperliquid/split_factors.json`（从 Tiingo Daily API 获取）

## TradFi Symbol Mappings

此部分是 XYZ 股票永续符号路由的控制中心。

### 表格

映射表由以下构建：
- Hyperliquid 映射数据（`mapping.json`）
- 手动/丰富条目（`tradfi_symbol_map.json`）

显示的列包括：
- Symbol（Hyperliquid 链接）
- HL Price / Tiingo Price
- Description / Type / Status
- Start Date / Fetch Start
- Pyth 链接
- 验证和备注

表格过滤器：
- 按状态过滤
- 按符号过滤（匹配 XYZ 符号和 Tiingo 符号/代码）
- 按类型过滤（规范类型，如 `equity_us`、`fx`）

开始日期语义：
- Start Date：提供商元数据（`tiingo_start_date`）
- Fetch Start：有效最早获取日期
  - IEX 股票使用 `max(Start Date, 2016-12-12)`
  - Start Date 未知时为空

### 操作按钮

按钮排列在两行对齐行中。

内联映射编辑器默认保持隐藏，只在显式单击 `Edit` 时打开。

第 1 行（所选符号工作流）：
- Search ticker
- Edit
- Test Resolve
- Fetch start date
- Refresh spec

第 2 行（全局工作流）：
- Auto-Map
- Fetch all start dates
- Refresh metadata
- Refresh prices
- View specs

按钮下方的操作结果框可以再次关闭，Auto-Map 结果暴露可展开类别，如 `Not found` 和 `Skipped`，以便检查哪些符号受影响。

此部分上方的 Tiingo 组件是 PBGui 本地跟踪器，不是权威的 Tiingo 仪表板用量视图。PBGui 现在将这些卡片标记为本地计数器，并在 Tiingo 返回实时 `server_429` 退避时显示警告。这意味着即使本地 `Hour` / `Day` / `Month Bandwidth` 计数器尚未归零，你也可以直接看到当前重试等待。

Auto-Map 摘要计数现在遵循表格中可见的相同非 delisted 映射行，因此原始 JSON 文件中的旧 delisted 残留不再混入结果总数。

Auto-Map 现在还在决定跳过前将这些可见行与当前 Hyperliquid XYZ 活动协调。这意味着 `tradfi_symbol_map.json` 中带过期原始 `delisted` 标志的活动行再次作为活动处理，`LLY tracks ... Eli Lilly and Company` 等描述性股票文本现在通过 Tiingo 名称检查，而不是落入 `Skipped`。

待处理行保持单个 `auto-map: not found` 备注标记，因此重复 Auto-Map 运行不再用重复片段刷屏 Note 列。

TradFi 类型处理现在更紧密地遵循实时 XYZ 规范缓存：规范解析器读取专用的 Description 和 Underlying 列，Auto-Map 从派生工具类型决定直接查找、FX 映射和 `no_provider`，而不是只依赖静态符号列表。

`Search ticker` 现在在浮动 PBGui 实用窗口本身中打开：你可以编辑 Tiingo 查询、运行搜索、检查带当前 Tiingo 价格（可用时）的可见结果列表、与所选 XYZ 符号的当前 Hyperliquid 价格比较，并从同一窗口直接应用匹配。Tiingo 对命中没有报价时，价格显示为不可用，而不是误导性的 `0.0000`。带 `BNO:BAT` 等 Tiingo 交易所后缀的搜索命中也会自动与底层 Tiingo 报价代码匹配，因此它们仍可以显示正确价格。

### Specs 弹窗

`View specs` 打开一个弹窗，包含：
- 源/获取时间戳/行数
- 原始 XYZ 规范页面链接
- 像其他 PBGui 实用窗口一样可移动、调整大小和关闭的浮动窗口
- 使用大部分窗口高度的大表格视图
- 可点击链接：
  - Pyth Link
  - HL Link

Pyth 链接现在保留 `pythdata.app` 所需的编码符号分隔符，因此 `AMZN/USD` 等符号通过 `%2F` 打开，而不是落在 404 页面上。

### 备注

- `Fetch start date` 仅限股票（每日元数据端点）。
- FX 符号不使用专用的开始日期元数据获取按钮。
- Auto-Map 和元数据/价格刷新要求活动 Tiingo 保险库配置文件。直接在 **Settings -> TradFi / Tiingo** 下显示、配置或替换其令牌，或在 **Setup -> API Keys -> TradFi** 下管理高级配置文件元数据。批量状态和设置响应保持不含机密。

## 从 AWS 下载 l2Book

下载 Hyperliquid l2Book 存档文件（Requester Pays）。

在 FastAPI 页面上，Hyperliquid 下载面板现在使用与 `Best 1m` 相同的启用币种网格选择器：`Filter enabled coin list` 缩小可见切片，`Select visible` 一步添加过滤行，`Clear all` 重置显式选择，你可以点击或跨可见行拖动以快速构建下载集。`XYZ-*` / TradFi 符号在这里被过滤掉，因为没有它们的 Hyperliquid l2Book 存档下载。选择保持为空时，PBGui 仍排队所有剩余可下载的 Hyperliquid 币种。

工作流：
1. 配置 AWS 配置文件和区域
2. 选择币种和日期范围
3. 运行自动下载任务

UI 行为：
- 下载任务队列直接显示在下载控件下方
- `Last download job` 是可折叠摘要面板
- 摘要包括状态、币种、范围、计数（已下载/已跳过/失败）、大小统计、进度百分比和时长

成本行为：
- 现有本地文件先被跳过
- 跳过的文件不触发 S3 传输/下载工作

存储路径：
- `data/ohlcv/hyperliquid/l2Book/<COIN>/<YYYYMMDD>-<H>.lz4`

## Build best 1m OHLCV

这会为合格符号启动后台构建任务。

在 FastAPI 页面上，Binance USDM、Bybit、OKX 和 Bitget 直接在 `Best 1m` 构建面板中使用设置风格的可用币种网格。你可以用 `Filter available coin list` 缩小列表、单击单行、跨可见行拖动以快速添加或移除更大范围，或通过 `Select visible` 批量添加当前过滤切片。显式选择保持为空时，PBGui 为当前交易所排队所有可用币种。

在 Hyperliquid 上，聚焦的 `Best 1m` 构建面板现在使用相同的 `Filter enabled coin list` + 多列网格模式进行币种选择，并使用共享弹出日历样式用于 `Start date` / `End date`，替换旧的单行下拉框和浏览器原生日期字段。可见币种行可以直接点击，或通过跨网格拖动鼠标以更大范围选择。

### 任务类型

**`hl_best_1m`** — Hyperliquid XYZ 股票永续：
- 资格：映射状态 `ok` + 存在 Tiingo 代码
- 控件：Build best 1m、Start date、End date、Refetch TradFi from scratch

**`binance_best_1m`** — Binance USDM 完整历史回填：
- 从官方 Binance 存档（data.binance.vision）下载完整的上线至今 1m OHLCV——月度 + 每日 ZIP——带 CCXT 补漏
- 从所有可用 Binance 币种中选择
- 控件：Start date、End date、Refetch
- 存储：`data/ohlcv/binanceusdm/1m/<COIN>/YYYY-MM-DD.npz`（压缩 NumPy 存档；PB7 缓存使用未压缩 `.npy`——相同数据大约大 35%）

**`bybit_best_1m`** — 可用币种的 Bybit REST/CCXT 历史回填。

**`okx_best_1m`** — OKX 存档回填，缺失 K 线和成交量用 REST 修复。

**`bitget_best_1m`** — Bitget USDT-FUTURES 仅 REST 历史回填：
- 使用 `data/coindata/bitget/mapping.json` 中的 Bitget 符号，写入 `data/ohlcv/bitget/1m/<COIN_DIR>/YYYY-MM-DD.npz`。
- 本地非分布式回填验证完整历史日为 1,440 分钟；上市日和当前 UTC 日可以保持部分。
- 可选 **Distributed download** 将缺失日期范围拆分到所选 VPS 下载器和/或 master。远程下载器流式返回原始 K 线；只有 master 写入 NPZ 和源索引文件。后续运行即使在 `Refetch` 关闭时也会再次计划不完整的中间历史日；上市/范围开始和当前 UTC 边界日保持部分日例外。

### 任务管理

任务面板显示三个部分：
- **Pending** — 排队等待执行的任务
- **Running** — 当前执行的任务，带实时进度
- **Failed / Done** — 已完成任务

聚焦的 Best 1m 历史标签页在历史限制前应用所选任务类型，因此无关的高频任务不会隐藏当前交易所操作的完成或失败任务。

API 重启可以通过服务 cgroup 停止单独的 Market Data Queue 控制器。任何未取消的运行中任务移回 **Pending**，其持久化进度完整，重建的工作器从已写入的数据恢复它，而不是将其标记为失败。显式取消和真实处理错误仍将任务移到 **Failed**。

操作：
- **Run** — 将一个待处理任务标记为手动优先级，并允许一个额外的同类型任务与已运行的任务并行开始
- **View** — 打开完整任务详情（摘要、负载、进度、最后结果）
- **Cancel** — 从嵌入监视器请求运行中任务的协作取消；工作器在下一个安全检查点停止
- **Retry** — 将失败任务重新排队到 Pending
- **Delete** — 移除单个任务
- **Delete selected / Delete all** — 从 Failed 或 Done 列表批量删除

### 进度显示

运行时，面板显示：
- 阶段：`starting`、`running`、`done`
- 当前币种
- 块完成/总数
- 写入的分钟数
- 时长
- 对于 Binance：获取的页数、覆盖天数
- 对于 HL TradFi：月份 YYYY-MM 日 X/Y、Tiingo 配额用量、429 等待状态

### 数据策略（hl_best_1m）

Build best 1m 在所选日期窗口中从最新到最旧运行。

对于加密符号（非 XYZ）：
- 先使用本地 `1m_api` 和本地 `l2Book` 转换
- 用永续交易所回退数据填充剩余缺口
- `l2Book` 只在此加密路径中使用（不用于 XYZ 股票永续）

对于 FX 映射的股票永续（`tiingo_fx_ticker`）：
- 以周块使用 Tiingo FX 1m（减少请求数）
- 不重新获取时使用现有 `other_exchange` 历史作为锚点
  - 开始游标 = 最早现有 `other_exchange` 日减 1 天
- `Refetch` 从所选/结束日重新开始，并在允许范围内向后重建
- 周末会话边界使用观察到的源行为：
  - 周五收盘 = 纽约本地时间 17:00（UTC 中感知夏令时）
  - 周日重开 ≈ 22:00 UTC（固定）
- 已知缩短的 FX 假日会话：
  - `12-24` 和 `12-31`：约 22:00 UTC 提前收盘
  - `12-25` 和 `01-01`：约 23:00 UTC 延迟重开

对于股票映射的股票永续（`tiingo_ticker`）：
- 使用 Tiingo IEX 1m
- 不重新获取时使用现有 `other_exchange` 历史作为锚点
  - 开始游标 = 最早现有 `other_exchange` 日减 1 天
- 下限保持 `max(tiingo_start_date, 2016-12-12)`
- 原始优先写入行为：Tiingo 返回的任何分钟条都写入（写入路径没有额外的市场时间裁剪）

写入安全规则：
- TradFi 写入（`other_exchange`）只填充缺失分钟或已标记为 `other_exchange` 的分钟
- 现有 `api` / `l2Book_mid` 分钟不被 TradFi 覆盖

日期控件：
- `Start date` 限制要处理的最早日
- `End date` 限制要处理的最新日（默认 = 今天）

### 进度与等待（hl_best_1m）

任务面板可以显示：
- `month YYYY-MM day X/Y`
- Tiingo 月请求用量
- 配额/429 等待状态，带等待秒数和原因

## Tiingo 凭据

直接在 **Settings -> TradFi / Tiingo** 下显示、创建或替换 Tiingo 令牌，或在 **Setup -> API Keys -> TradFi** 下管理高级配置文件元数据。两条路径使用同一个凭据保险库。输入从不为空预填；存储的密钥只在显式单击眼睛后请求，隐藏或离开页面时清除。不要把 Tiingo 加到 `pbgui.ini` 或手动编辑 PB7 TradFi 条目。

此页面为活动 Tiingo 保险库令牌提供显式显示和安全创建/替换输入、运行时配额指示器（小时/日/月带宽）、提供商链接，以及使用活动保险库配置文件的映射工具。配置文件列表和设置响应保持不含机密。

## 故障排除

如果构建任务短暂出现然后消失：
1. 检查 `data/ohlcv/_tasks/failed` 中最近的失败任务
2. 确认工作器运行最新代码（需要时重启工作器）
3. 验证 Tiingo 保险库配置文件和符号映射状态
4. 为所选符号使用 `Test Resolve`

如果 Build coin 列表为空：
- 确保符号已映射且状态为 `ok`
- 确保映射中存在 Tiingo 代码或 FX 代码
