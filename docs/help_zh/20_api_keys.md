# API 密钥

管理交易所 API 凭据和 TradFi 提供商配置。交易所用户仍保存在 `api-keys.json` 中；TradFi 密钥单独存储在仅限 PBGui 所有者访问的凭据保险库中。

---

## 页面布局

此页面作为独立的 FastAPI 页面运行，并使用共享的 PBGui 工作台导航。标题栏将当前路径显示为 **System / API Keys / Users**，紧凑型导航栏包含页面各部分，主面板则包含当前选中的视图。

### 侧边栏按钮

| 按钮 | 操作 |
|---|---|
| **+ Add User** | 打开用于新建交易所用户的创建表单 |
| **HL Expiry Check** | 批量检查所有 HL 用户的 Hyperliquid 密钥到期时间 |
| **Bybit Expiry Check** | 批量检查所有 Bybit 用户的 Bybit API 密钥到期时间和 IP 白名单 |
| **Comments** | 打开备注管理面板 |
| **HL Warning Config** | 配置 Hyperliquid 到期 Telegram 警告阈值 |
| **TradFi** | 打开 TradFi Data Provider 面板 |
| **🗄 Backups** | 打开备份浏览器和差异查看器 |
| **📋 Logs** | 打开实时日志查看器（流式传输 `ApiKeys.log` 和其他日志） |
| **Refresh** | 从磁盘重新加载用户列表 |
| **🟠 Restart** | 当 API 或其他受管理的 PBGui 服务运行旧版代码时显示；单击可查看并重启受影响的服务 |

---

## 用户列表

显示 `api-keys.json` 中的所有条目。

- **Filter box** — 输入内容可按名称或交易所搜索；紧凑的 280px 输入框将清除按钮保留在右边缘内；状态保存在 URL 中（`?filter=`）
- **Column headers** — 单击可排序；只有当前活动列会显示其方向指示器，并且排序方向会保存在 URL 中（`?sort=`、`?dir=`）
- **Keyboard navigation** — 在筛选框中按 ArrowDown 会选中第一行；ArrowUp/ArrowDown 可在各行之间移动；按 Enter 可打开选中的用户
- **In Use badge** — 当用户被运行中的机器人引用时显示

用户名严格以文本形式呈现，行操作使用委托的浏览器事件。因此，从备份或 Cluster Sync 导入的名称无法被解释为页面标记或 JavaScript；行单击、键盘导航、Edit 和 Delete 的行为与之前相同。

### 到期列

- **HL Expiry** — 显示 Hyperliquid 用户的剩余天数/到期日期（从本地缓存读取，不调用 API）；可按升序排序（最快到期的排在最前）
- **Bybit Expiry** — 显示 Bybit 用户的剩余天数（从本地缓存读取）

---

## 创建/编辑用户

单击用户行将其打开，或使用 **+ Add User**。URL 哈希会更新为 `#edit/username`，因此刷新浏览器后会重新打开同一用户。

编辑器将用户名和交易所身份信息与交易所凭据分组区分。**Test Connection** 与凭据控件放在一起，并在控件内联位置报告结果。可选的 Quote、Options 和 Extra 值保留在折叠的 **Advanced (optional)** 部分中，而 Save 和 Delete 则保留在表单页脚中。

按 **Escape** 可关闭表单而不保存。如果表单中有未保存的更改，PBGui 会打开主题化确认对话框；选择 **Cancel** 可继续编辑，选择 **Leave** 可放弃更改。

### 编辑表单字段

| 字段 | 说明 |
|---|---|
| **Username** | `api-keys.json` 中的键；可以重命名，输入新名称并保存 |
| **Exchange** | 交易所名称（例如 `bybit`、`hyperliquid`、`bitunix` 或 `weex`） |
| **API Key** | 交易所 API 密钥 |
| **Secret** | API 密钥 |
| **Passphrase** | 某些交易所要求填写，包括 OKX 和 WEEX |
| **Wallet Address** | 仅适用于 Hyperliquid |
| **Private Key** | 仅适用于 Hyperliquid |
| **Is Vault** | Hyperliquid 保险库模式 |
| **Quote** | 可选的 CCXT 透传值（例如 `USDT`） |
| **Options** | 可选的 JSON 对象（例如 `{"defaultType": "swap"}`） |
| **Extra** | 用于交易所特定字段的可选 JSON 透传值 |

### 已存储的凭据

凭据详情仅返回固定掩码和存在状态信息。Secret、Passphrase 和 Private Key 只能替换：将其留空可保留已存储的值，或输入新值并保存。PBGui 永远不会显示这些值。

API Key 眼睛按钮是唯一能够显示已存储交易所凭据的功能。它会针对选中的用户执行经过身份验证的同源 POST 请求，使用 `Cache-Control: no-store`，并在隐藏该值、选择另一用户、身份验证失效或离开页面时清除该值。

TradFi 保险库密钥有所不同：已存储的值永远不会返回浏览器。其眼睛按钮只能显示在当前编辑期间输入的文本。将字段留空可保留已存储的值，或输入替换值并保存。

### 验证

- 标准交易所要求提供 **API Key + Secret**
- 使用 Passphrase 的交易所还要求提供 **Passphrase**
- Bitunix 要求提供 **API Key + Secret**；WEEX 还要求提供 **Passphrase**
- Hyperliquid 要求提供 **Wallet Address**；Private Key 仅在创建时必填（编辑时留空可保留现有值）
- Username 必须唯一；如果新名称已被使用，或该用户正由机器人使用，则重命名会被拒绝

### Check Expiry / Test Connection

这两个按钮均使用表单中**当前输入的凭据**，而不仅仅是已保存的凭据。这样你就可以在提交 Save 之前验证新密钥。

- **Check Expiry**（HL / Bybit）— 结果仅供预览；只有单击 Save 后才会持久保存
- **Test Connection** — 实时测试连接；也会使用尚未保存的凭据

**Check Expiry** 使用的未保存 Hyperliquid 私钥只会在经过身份验证的 POST 请求正文中发送。它们绝不会添加到请求 URL 中；未提供未保存覆盖值的检查会继续使用已存储的密钥。

---

## 备份

每次保存前都会自动创建备份。备份以带时间戳的 JSON 文件形式存储在 `data/api-keys/` 中。

通过侧边栏中的 **🗄 Backups** 打开（URL 哈希：`#backups`）。

| 条目 | 说明 |
|---|---|
| **Current (live)** | 每个 PB 版本（pb7/pb6）的当前 `api-keys.json`；可选择用于差异比较 |
| 带时间戳的条目 | 之前的保存版本；**Restore** 会覆盖当前文件（会先创建恢复前快照） |

### 差异查看器

以并排或统一方式比较任意两个条目：
- 绿色 = 新增，红色 = 删除，灰色 = 未更改的上下文
- 当两个版本匹配时显示"✓ Files are identical"

---

## Cluster Sync

交易所用户会投射到本地 `api-keys.json` 中。远程交易所 API 密钥写入由 **Cluster Sync** 管理。

保存交易所凭据时，PBGui 会在集群状态中记录更新后的 API 密钥元数据和受限密钥数据块。使用 **System -> Cluster Sync** 可预览并明确地将 `api-keys.json` 实体化到可访问的节点上。

仅当目标文件不同时，集群实体化才会在 Master 节点上创建替换备份。这些备份与常规 API 密钥备份一起存储在 `data/api-keys/` 中。VPS 运行节点会跳过本地备份，以原子方式写入经过验证的密钥数据块，并且不会重启机器人或部署任何其他文件。

TradFi 配置改用凭据协议 v2 密封信封。它们只发送给活动的 Master；VPS 节点可以中继密文，但无法解密或投射 TradFi 凭据。

---

## HL Warning Config

通过侧边栏中的 **HL Warning Config** 打开。

- 左侧状态卡片显示该值是否已在 `pbgui.ini` 中明确配置，以及当前有效的警告时间窗口。
- 右侧设置卡片包含带标签的 1–365 天阈值、每日提醒说明和 Save 操作。请求运行期间，Save 会显示进行中状态。
- 如果 `hl_expiry.telegram_warning_days` 已存在于 `pbgui.ini` 中，面板会将其显示为 **configured**。
- 如果 INI 条目仍然缺失，面板现在会显示 **Not configured**，并明确说明 PBAPIServer 当前会回退到默认的 **7-day** 警告时间窗口。
- 单击 **Save** 会将所选阈值写入 `pbgui.ini`，并将面板状态切换为已配置。

---

## 实时日志查看器

通过侧边栏中的 **📋 Logs** 打开。

通过 WebSocket 实时流式传输日志文件。

### 控件

| 控件 | 说明 |
|---|---|
| **Files** 按钮/侧边栏 | 切换可折叠的左侧边栏，其中列出所有可用日志文件；单击文件可进行切换 |
| **DBG / INF / WRN / ERR / CRT** | 按日志级别切换可见性 |
| **Lines** | 要加载的初始行数（200 – 5000） |
| **⏸ Pause / ▶ Stream** | 暂停或恢复实时流式传输 |
| **🗑 Clear** | 清除终端视图 |
| **↓ Download** | 将当前加载的行下载为文本文件 |
| **# Lines** | 切换行号显示 |
| **— Preset —** | 预设搜索模式（Errors、Warnings、Connection、Traceback、…） |
| **Search box** | 实时搜索/筛选；**Filter** 复选框会隐藏不匹配的行；▲▼ 可在匹配项之间导航 |

主要日志文件：
- `ApiKeys.log` — API 密钥编辑器活动
- `VPSMonitor.log` — VPS 监控
- `PBGui.log` — 常规 UI 活动

---

## 备注

通过侧边栏中的 **Comments** 打开（URL 哈希：`#comments`）。

管理 `api-keys.json` 中的 `_comment_*` 顶层条目，即不与任何交易所用户关联的自由文本备注。

---

## TradFi Data Provider（股票永续合约回测）

通过侧边栏中的 **TradFi** 打开（URL 哈希：`#tradfi`）。

Hyperliquid XYZ 交易对的股票永续合约回测需要传统资产（股票、FX）的 1 分钟 OHLCV 数据。

该视图分为三个主题区域：用于查看 yfinance 软件包状态和执行测试的 **Recent backtests**、用于选择已存储提供商元数据的 **Long-history vault profiles**，以及用于管理凭据和生命周期操作的 **Profile configuration**。可以使用指针选择配置行，也可以使用键盘将焦点移至配置行，并通过 **Enter** 或 **Space** 激活。

> 💡 **建议用于获取完整的股票永续合约历史数据：**在此处添加 **Tiingo** 配置，然后使用 PBGui 的 **Market Data** 模块，通过 **Build best 1m OHLCV** 构建完整的本地 1 分钟 OHLCV 存档。

### yfinance（自动默认值）

- 无需配置；自动用作最近约 7 天数据的回退来源
- 免费，无需 API 密钥
- **Install** / **Uninstall** 按钮用于管理 Python 软件包

### 扩展提供商（可选，用于更早的历史数据）

| 提供商 | 所需密钥 | 免费层级的 1m 数据深度 | 备注 |
|---|---|---|---|
| **alpaca** | key + secret | 5+ 年 | 免费（IEX 数据源，有 15 分钟延迟，适用于回测）。**推荐。** |
| **polygon** | 仅 key | 2 年 | 付费方案提供更长的历史数据 |
| **finnhub** | 仅 key | 不可用 | 免费层级不提供 1 分钟日内数据 |
| **alphavantage** | 仅 key | 非常有限 | 免费层级每天 25 次 API 调用 |

选择提供商时会显示注册链接。

已保存的配置仅显示提供商、活动状态和代次等元数据。当字段为空时，**Test Connection** 会在服务器端使用已保存的配置；在保存前，也可以使用经过身份验证的请求正文中提供的一次性凭据。单击 **API key** 旁的眼睛按钮，只会显示所选配置中已存储的第三方密钥；隐藏该值、选择另一配置、身份验证失效或离开页面时，该值会再次被清除。也可以通过同一凭据保险库，直接在 **Market Data -> Settings -> TradFi / Tiingo** 下显示、创建或替换 Tiingo token。

PBGui 会通过原子合并和重试处理，自动将 Master 端的活动 TradFi 配置投射到其保留的 PB7 `api-keys.json` 子树中。不要手动编辑 PB7 TradFi 条目。替换提供商密钥会创建新的保险库代次；提供商轮换是可选操作，凭据迁移并不要求执行轮换。

---

## `api-keys.json` 字段参考

```json
{
  "myuser": {
    "exchange": "bybit",
    "key": "...",
    "secret": "...",
    "passphrase": "...",
    "quote": "USDT",
    "options": {"defaultType": "swap"},
    "extra": {}
  },
  "myhl": {
    "exchange": "hyperliquid",
    "wallet_address": "0x...",
    "private_key": "0x...",
    "is_vault": false
  }
}
```

---

## 上游参考

- https://github.com/enarjord/passivbot
