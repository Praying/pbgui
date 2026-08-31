# PBv7 Run

**PBv7 Run** 页面管理你的实时 Passivbot v7 交易实例。
每个实例将一个 API 密钥用户、一个机器人配置和一个目标 VPS 关联在一起。

---

## 实例列表

以表格形式显示所有已配置的 V7 实例。

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **Search / Status** | 过滤共享的 Run 表格而不改变实例状态 |
| **Refresh** | 重新加载所有实例和远程状态 |
| **Add Instance** | 创建新的空白实例 |
| **Backups** | 浏览、过滤、加载或删除 V7 配置备份 |

表格列：

| 列 | 说明 |
|--------|-------------|
| **Name** | 稳定的实例名称 |
| **User** | 分配给此实例的 API 密钥用户 |
| **Enabled On** | 机器人部署所在的 VPS（`disabled` = 未部署） |
| **Status** | 已确认的同步/运行时状态；`collecting` 表示尚无精确观测 |
| **Cfg Ver / Run Ver** | 本地存储的配置版本和运行进程确认的版本 |
| **TWE** | 总钱包敞口 — `L=` 多 / `S=` 空 |
| **Running On** | 报告确切受管进程身份的主机 |
| **Desired** | 运行时发布期望状态时为 Cluster 期望状态；否则 V7 显示 `-` |
| **Note** | 供你自己参考的自由文本备注 |
| **Actions** | P/G/T 强制模式、Edit、Balance Calculator、V8 迁移和 Delete |

PBGui AI 将活动机器人暴露为精确的操作目标。来自 Run 列表或其他页面的 `show_log` 请求会导航到现有实例编辑器，保持操作待处理，然后调用与编辑器侧边栏 **Log** 按钮相同的实时日志函数。

`P`、`G` 和 `T` 行按钮写入 `config.json` 中的 PB7 `live.forced_mode_long` 和 `live.forced_mode_short`，提升实例配置版本，创建之前配置的备份，并将更改后的配置同步到目标主机。它们是 Passivbot 强制模式操作，不是直接的交易所订单。编辑器会将 `graceful_stop` 等规范值通过匹配的 PB7 下拉选项显示，即使保存的配置使用长形式而不是短别名。

**V8** 保持 V7 运行配置不变，并通过 PB8 的官方迁移器传递完整的策略、Backtest 和 Optimize 结构。PBGui 在调用前移除自己的元数据和过期的临时加载器路径，提取退役的价格距离名称，并丢弃已禁用的退役波动率过滤器。V7 形状转换后，提取的值交给 PB8 的规范配置准备：正值变成 `live.order_replacement_churn_gate_market_dist_pct`，禁用值变成 `live.order_replacement_churn_gate_activation_count = 0`；显式冲突的旧/新设置由 PB8 拒绝。两个退役距离名称都不会写入 V8 草稿或显示供手动审查。成功且需要审查的 Run 迁移保持在 Run 工作流中，并作为短暂的未保存 PB8 Run 编辑器草稿打开；它们绝不会写入 Backtest 配置存储。成功调整的草稿保留其迁移报告，并显示一个紧凑的信息提示，说明无需手动字段审查。Run 审查只显示剩余的 Run 相关发现，不显示 `backtest.*` 或 `optimize.*` 发现。持久提示显示未解析字段和原始 V7 值，而不把退役的 V7 路径插入 V8 配置。现有的 V7 审查样式将受影响的规范机器人区段标记为红色。不可审查或无效的输出仍会以紧凑错误列表停止。

**状态值：**

| 图标 | 含义 |
|------|---------|
| **synced** | 机器人正在预期的 VPS 上以当前配置版本运行 |
| **outdated** | 机器人正在运行但配置版本不同 |
| **sync needed** | 实例已分配但当前版本未确认运行 |
| **stop needed** | 实例已禁用但仍报告有进程 |
| **collecting** | 尚无精确的进程观测 |
| **disabled** | 实例已禁用且没有报告进程 |

---

## 编辑表单

单击行上的 **Edit** 或单击 **Add** 后打开。

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| 🏠 Home | 返回实例列表 |
| 💾 Save | 保存更改并将配置同步到 VPS |
| 📥 Import | 导入现有的 Passivbot 配置文件 |
| 📊 Backtest | 直接在此实例的配置中打开 FastAPI Backtest 页面作为草稿 |
| 🔍 Strategy Explorer | 打开预加载此配置的 Strategy Explorer |
| 💰 Balance Calculator | 为此实例打开独立的 Balance Calculator |
| ⚡ Calc Balance | 内联计算推荐余额（以弹出窗口显示） |
| 📖 Guide | 打开本指南 |

编辑表单中的关键设置：

| 分区 | 说明 |
|---------|-------------|
| **User** | 选择 API 密钥用户（交易所账户） |
| **Enabled On** | 部署目标 VPS。选择器只显示主机名；已配置的目标在其当前能力无法确认时仍然可见，而验证仍会阻止不安全的目标更改 |
| **Note** | 列表中显示的可选标签 |
| **Logging level** | Passivbot 日志详细程度选择器，选项为 `warning`、`info`、`debug` 和 `trace` |
| **Long / Short** | 机器人参数 — 持仓、TWE、入场/平仓范围 |
| **JSON editors** | Raw JSON、Long JSON、Short JSON、Import JSON 和基于 JSON 的 Additional Parameters 在输入时验证；无效 JSON 显示精确的行/列并阻止 Save，直到修复。加载到 Run 的旧配置（包括粘贴的导入和 Backtest→Run 草稿）也会在 Long/Short JSON 中保留 `neutralized` / `review` 标记 |

Import 对话框的 **User** 字段可搜索。输入已配置的交易所用户名的一部分并选择匹配的建议；任意的未知名称会被拒绝。
| **Filters** | 此实例基于 CoinMarketCap 的符号过滤器 |
| **Apply Filters** | 立即从 Market Cap、成交量比率、标签、CPT 和 notice 设置重建 Long/Short approved 和 ignored 列表 |
| **Approved / Ignored coins** | 批准的币种选择器现在直接使用 Passivbot 的规范 `all` 处理。旧的 `empty_means_all_approved` 开关不再显示或保存回写 |
| **Coin Overrides** | 按币种的参数覆盖（机器人参数、实时模式、独立配置文件）。允许的内联参数从已安装的 PB7 运行时加载；已打开的编辑器在元数据到达时刷新，加载失败时显示明确错误而不是空分区 |
| **Dynamic Ignore** | 仅 PB7 的运行时监视器，持续重建币种列表。PB8 显示为禁用，因为其监督器目前使用 Apply Filters 产生的显式列表。 |

### Dynamic Ignore 和 CMC 池

Dynamic Ignore 是目标主机能力，不是按实例或按 VPS 的密钥设置。保存、同步或启动前，PBGui 检查不含机密的主机元数据，包括凭据协议 v2、活动本地 CMC 池，以及匹配的目录/已实体化代次。如果目标报告没有活动池或状态仍未知，操作会被阻止并报告原因。请先在该主机上实体化 Cluster CMC 池。禁用的实例不需要池就绪。

---

## 典型工作流

### 启动新的实时实例
1. **Add** → 选择 **User** 和 **Enabled On**（目标 VPS）
2. 配置 **Long / Short** 参数和币种过滤器 → **💾 Save**
3. 状态列将显示 🔄，直到 VPS 确认激活

### 更新运行中的机器人
1. 使用 **Edit** 打开实例 → 调整参数 → **💾 Save**
2. 配置自动推送到 VPS；状态显示 🔄 直到确认

### 上线前验证参数
1. 使用 **Edit** 打开实例
2. 单击 **📊 Backtest** → 使用相同配置运行回测
3. 单击 **🔍 Strategy Explorer** → 检查入场/平仓订单、测试参数更改、运行有界模拟、比较成交并构建重放影片

### 检查余额是否足够
1. 使用 **Edit** 打开实例
2. 单击 **⚡ Calc Balance** 查看当前配置所需的推荐余额
3. 或单击 **💰 Balance Calculator** 打开完整的独立计算器

### 禁用机器人
1. 使用 **Edit** 打开实例 → 将 **Enabled On** 设为 `disabled` → **💾 Save**
2. 机器人会在 VPS 上自动停止
