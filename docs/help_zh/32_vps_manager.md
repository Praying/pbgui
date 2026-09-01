# VPS Manager

**VPS Manager** 页面允许你添加、配置和维护运行 Passivbot 实例的远程 VPS 服务器。
每个 VPS 都通过从 Master（本地）服务器执行的 Ansible playbook 进行管理。

默认菜单项 **System -> VPS Manager** 打开独立的 **FastAPI** 页面。

---

## 总览表

主视图显示包含所有服务器（Master + VPS）及其当前状态的表格。

| 列 | 说明 |
|--------|-------------|
| **Name** | 服务器主机名（Master 显示为 local） |
| **Role** | 🧠 Master / 💻 VPS |
| **Online** | ✅ 可达 / ❌ 离线 |
| **Bots** | 该 VPS 当前报告的独立运行中机器人数量 |
| **Started** | 上次启动时间 |
| **Updates** | 待处理的 Linux 软件包更新；单击非零计数可查看软件包名称、已安装/候选版本、来源以及 Security/Kernel/Routine 分类 |
| **PBGui / PBGui Branch / PBGui GitHub** | 已安装版本、分支，以及是否与 GitHub 上游一致 |
| **PB7 / PB7 Branch / PB7 GitHub** | PB7 版本、分支，以及是否与 GitHub 上游一致 |
| **PB8 / PB8 Branch / PB8 GitHub** | PB8 版本、分支，以及是否与当前上游 PB8 修订版本一致 |

总览交互：

- 单击列头可按该列排序；再次单击同一表头可反转排序顺序。
- 每个可见列头都包含一个小隐藏图标，你可以直接从表格中移除该列。
- 表头行最右侧的一个小重置图标可恢复默认的总览列和默认排序。
- 列可见性和排序保存在浏览器本地。
- 在总览表中跨 VPS 行单击并拖动，可选择多个部署目标。

左侧边栏：

| 按钮 | 操作 |
|--------|--------|
| **Add VPS** | 打开添加/初始化表单 |
| **Refresh** | 可通过刷新图标强制立即重新加载所有 VPS 状态和版本数据 |
| **Overview / Settings / History** | 在实时总览表、共享部署设置和最近的部署历史之间切换 |
| **Import by Hostname** | 从 **Import Host** 侧边栏部分打开手动主机名导入对话框；主机名必须已通过本地 `/etc/hosts` 解析 |
| **Import Cluster Nodes** | 预览并从 Cluster Sync 节点将安全的 SSH 元数据导入本地 VPS Manager 主机条目；不导入机密 |

总览使用标准的共享 PBGui FastAPI 外壳。当你切换到 **Master** 或某个特定 **VPS** 时，左侧边栏会变为视图特定的操作列表。主总览区域保持聚焦于表格，而主机导入在加入现有 Cluster Sync 状态后，仍可从侧边栏作为基于主机名的手动操作或 **Import Cluster Nodes** 操作使用。

Master 和 VPS 详情头部重复显示 PBGui、PB7 和 PB8 版本卡片，带分支/提交和更新状态。已安装主机事实来自与总览行相同的 monitor-agent 快照。上游分支头来自持久的 VPSMonitor 发布缓存，因此渲染页面绝不运行 Git 或网络探测。

如果 PB8 安装或更新在验证前结束，VPS Manager 会保留检出目录可见，但将 PB8 标记为不可用。总览单元格显示红色警告，详情视图显示 **PB8 Update Required** 及记录的原因，专用的 **Update PB8** 操作保持高亮，直到成功更新移除运行时无效标记。

普通的 **Update PB8** 操作有意将 PB8 恢复到已验证上游 `master` 提交处的分离检出状态。当该分离提交与已验证的上游修订完全匹配时，VPS Manager 会将其标记为 `master`，而不是把底层 Git 状态显示为 `unknown`。显式的 **PB8 Branch** 视图可以改为跟踪来自配置上游或自定义远程/分支的已验证 v8 分支或提交。

**Import Cluster Nodes** 读取本地已实体化的 `cluster_nodes` 状态，并导入具有 SSH 元数据的非本地节点，无论其 Cluster Sync 模式如何。已禁用的 Cluster Sync 节点仍然可以导入 VPS Manager；禁用只意味着 PBCluster 不应通过该节点复制。导入只写入安全的本地 VPS Manager 元数据，如 hostname、SSH host、SSH user、SSH port 和 Remote PBGui Dir；不导入密码和私钥。CMC 机密从来不是 VPS Manager 字段：Cluster Sync 会单独实体化密封的池代次。如果本地 `/etc/hosts` 缺失或把主机名指向了不同的 IP，导入预览会显示所需的主机条目更改，应用步骤在写入前会要求输入本地 sudo 密码。对话框会要求输入每个导入主机的 VPS 用户密码；未填密码的行会被跳过，而输入的密码只使用一次来刷新远程设置、安装监控 SSH 密钥，并且只在当前浏览器/API 会话中保留，供后续基于 SSH 的操作使用。

页面保持实时 WebSocket 连接，用于总览行、进度日志和分支状态。持久的 VPSMonitor 服务每 60 秒在后台检查 PBGui、PB7 和 PB8 上游分支头，跨 API 重启保留最后已知结果，并在瞬时 Git 检查失败时将其标记为过期。因此 Master 和 VPS 的更新颜色不需要页面打开或手动 Refresh 操作。即使上游 `master` 前进，PB7 的已验证固定提交也按策略保持当前。完整分支历史和自定义远程/分支提交只在分支管理请求时加载。浏览器身份验证仅限 Cookie；PBGui 绝不把会话令牌渲染到此页面，也不发送浏览器 Bearer 头。

本地 Master 行始终显示当前运行 API 进程导入的 PBGui 版本。过期的 monitor-agent 缓存仍可提供最近已知的软件包或 PB7/PB8 详情，但不再用过时值替换本地 PBGui 版本。更新按钮的颜色仍基于提交，并要求存在已验证的缓存上游提交；仅凭过期缓存文本绝不会声称有可用更新。

手动 PBGui 代码更新后，仍在运行的旧 VPSMonitor 可能尚未暴露发布缓存。版本卡片保持橙色而不是声称有更新，运行时更新按钮保持中性，直到存在经过验证的上游比较。共享顶部导航的 **Restart** 提示会检测这种能力不匹配，并在重启 API 之前重新加载 VPSMonitor。

实时更新不再在你从侧边栏选择另一台主机时关闭 **VPS** 选择器。

实时刷新现在只更新发生变化的状态区域，因此 Add/Edit 表单中的输入保持光标位置，打开的密码显示字段在收到新的监视器或进度数据时保持打开。

---

## Master 管理

打开左侧控制栏中的 **Master** 管理本地服务器。

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **Overview** | 返回主 VPS Manager 总览 |
| **Back to Master Overview** | 从分支/日志子视图返回普通 Master 详情视图 |
| **Task Logs** | 打开已存储 Master playbook 日志的专用共享日志查看器界面 |
| **Host Logs** | 打开本地服务日志和文件目标的专用共享日志查看器界面 |
| **PBGui Branch** | 打开 PBGui 分支管理视图 |
| **PB7 Branch** | 打开 PB7 分支管理视图 |
| **PB8 Branch** | PB8 已安装时打开 PB8 分支管理 |
| **Update PBGui and PB7 / Update PBGui and PB8** | 连同所选运行时一起更新 PBGui；PB7+PB8 组合主机提供两个操作 |
| **Update PBGui** | 只更新 PBGui |
| **Install PB7 / Update PB7** | 安装缺失的 PB7 运行时，或更新现有 PB7 检出和虚拟环境 |
| **Install PB8 / Update PB8** | 从上游 `master` 安装 PB8，或更新现有独立 PB8 检出和虚拟环境 |
| **Update Linux** | 运行 Linux 软件包更新（可选重启复选框） |
| **Reboot Master** | 重启本地服务器 |
| **Install or Update rustup** | 安装或刷新 Rust 工具链 |

**Master** 内容区还包含：
- 一个 CoinData / 最后命令状态的实时状态网格
- 用于分支或提交切换的 **PBGui Branch Management**
- 支持可选自定义远程/分支 URL 的 **PB7 Branch Management**
- 针对已安装 PB8 检出的 **PB8 Branch Management**，支持独立的分支/提交选择以及可选的自定义远程/分支 URL
- 一个 **Monitor** 部分，包含服务器指标以及来自实时进程和 Cluster Sync 期望状态的带运行时标签的 PB7 和 PB8 活动
- 一个 **Progress** 部分，带独立的状态桶；侧边栏操作启动 master ansible 任务时，主窗格切换到共享的 **Command Log Viewer** 显示完整输出，**Home** 返回普通 master 总览

更改 PB7 或 PB8 本地分支会立即更新显示的源和目标，并在它们不同时启用 **Switch Local Branch**。所选远程分支可以保持 **Use local branch target**；在该模式下，PBGui 从所选远程获取相同分支名。

在集群模式下，**Update PBGui** 和 PBGui 分支切换会同步本地 PBCluster systemd 用户单元并重启 PBCluster。PBCluster 也出现在本地服务监控和服务控制视图中。手动 `git pull` 不会重启 PBCluster；之后请使用 `systemctl --user restart pbgui-pbcluster.service`。

PB8 使用 `<install_dir>/pb8` 和 `<install_dir>/venv_pb8`，验证 PB8 CLI、Rust 扩展、V8 配置架构和源码指纹，然后将 `pb8dir` 和 `pb8venv` 保存到 `pbgui.ini`。本地和远程 Master 会收到完整的 PB8 配置文件用于回测和优化。受管的 VPS runner 只收到最小的实时配置文件，使用不带下载缓存的 pip，验证后移除临时 Rust 构建目录，并启用共享的 PBRun 控制器进行 PB8 实时监督。所有更新验证成功后，现有受管 PB8 实时机器人恰好重启一次，以便加载新的 PB8 版本；失败的更新不会触发该重启。首次远程 PB8 安装要求安装文件系统上至少有 3 GiB 可用空间。已验证的现有 PB8 运行时在低于首次安装储备时仍可更新。playbook 在任一操作前后都会报告可用空间以及 PB8 检出/虚拟环境大小。RAM 大小不是安装门槛。

首次远程 PB7 安装也要求至少有 3 GiB 可用空间。当新鲜遥测报告的剩余空间不足时，VPS Manager 会禁用 **Install PB7**，playbook 会在 rustup 或 Git 下载前重复检查。已验证的现有 PB7 安装在低于首次安装储备时仍可更新。

总览批量更新遵循每台所选 VPS 上已安装的内容。**Update Passivbot (PB7/PB8)** 和 **Update PBGui + Passivbot (PB7/PB8)** 将仅 PB7 主机分派到 PB7 playbook，仅 PB8 主机分派到 PB8 playbook，组合主机分派到有序的 PB7+PB8 playbook。因此混合选择保持一个并行或串行部署，而不会把 PB7 任务应用到仅 PB8 主机。
组合的本地 Master PBGui/运行时更新会推迟 API 重启，直到每个导入的运行时更新和验证步骤完成。命令日志在此工作期间保持打开，并在 API 重启前收到其最终状态。
成功的 Master PBGui 更新还会重启活动的 PBRun 控制器，使其自动采用新的代码 serial；有意停止的 PBRun 服务保持停止。
未安装 PB8 时，**Install PB8** 显示为填充的蓝色操作，与常规更新按钮保持区别。

---

## VPS 管理

单击左栏中的 VPS 卡片打开其详情视图。

侧边栏操作：

| 按钮 | 操作 |
|--------|--------|
| **Overview** | 返回主 VPS Manager 总览 |
| **Hostname selector** | 不离开 VPS 上下文，直接在已保存的 VPS 主机之间切换 |
| **Back** | 从分支/日志/设置子视图返回普通 VPS 详情视图 |
| **Task Logs** | 打开所有已存储 VPS playbook 日志及其历史的专用共享日志查看器界面 |
| **Host Logs** | 打开 VPS 服务日志和文件目标的专用共享日志查看器界面 |
| **Change VPS** | 打开已保存主机设置的 VPS 配置视图 |
| **PBGui Branch** | 打开 PBGui 分支管理视图 |
| **PB7 Branch** | 打开 PB7 分支管理视图 |
| **PB8 Branch** | PB8 已安装时打开 PB8 分支管理 |
| **Initialize** | 运行初始 VPS 设置向导 |
| **Delete VPS** | 从 PBGui 移除该 VPS |
| **Update PBGui** | 更新此 VPS 上的 PBGui |
| **Install PB7 / Update PB7** | 在仅 PB8 主机上安装 PB7，或更新现有 PB7 运行时 |
| **Update PBGui and PB7 / Update PBGui and PB8** | 连同所选运行时一起更新 PBGui；PB7+PB8 组合主机提供两个操作 |
| **Install PB8 / Update PB8** | 新鲜遥测报告支持的角色且至少有 3 GiB 可用磁盘时提供安装；已验证的 PB8 运行时可在没有首次安装储备的情况下更新 |
| **Update Linux** | 运行 `apt upgrade`（可选重启复选框） |
| **Reboot VPS** | 重启 VPS |
| **Cleanup VPS** | 移除旧软件包和日志 |

**VPS** 内容区还包含：
- 一个密码、swap 和防火墙字段的设置/配置网格；**Apply VPS Changes** 在本地保存更改，并在 VPS 上应用更改过的 swap 和防火墙设置
- **PBGui Branch Management**、**PB7 Branch Management** 和已安装运行时的 **PB8 Branch Management**，切换/更新工作流与 Master 页面相同
- 一个 **Remote Monitor** 部分，包含服务器指标以及来自详细进程指标和 Cluster Sync 回退的带运行时标签的 PB7 和 PB8 活动
- 一个 **Progress** 部分，包含 init、setup 和 update 运行的独立状态桶；需要完整 ansible 输出时，使用侧边栏操作按钮打开共享的 **Command Log Viewer**

在集群模式下，VPS 上的 **Update PBGui** 和 PBGui 分支切换会同步 PBCluster 服务文件，并在配置了这些服务的地方重启 PBCluster、PBRun 和 PBCoinData。VPS systemd 迁移检查包括 PBCluster，远程服务/主机日志视图暴露 `PBCluster.log`。纯 VPS runner 仍然不需要 `pbgui-api.service` 或 `PBApiServer.py`。

组合的 PBGui/运行时更新通过一个瞬态 systemd 单元推迟其 API 重启，直到完整的 Ansible runner 退出。重启单元禁用 systemd 自身的环境展开，因此 Bash PID/启动时间检查保持完整，不会终止同一 playbook 导入的后续 PB7/PB8 安装。

PB7 和 PB8 分支管理保持独立的浏览器状态和远程缓存。在任一运行时视图中，选择已知远程或输入分支 URL，加载其分支和提交，选择本地目标分支，然后运行带标签的切换/更新操作。当所选源分支在已加载的远程中缺失时，操作保持禁用。其中一个选择器打开时，实时状态更新不会重建分支面板。在没有分支管理选择的情况下运行普通 **Update PB8** 仍会恢复已验证的上游 `master`；只有有意跟踪另一个已验证的 v8 分支或提交时才使用 **PB8 Branch**。

侧边栏将详细的日志工作流与普通主机总览分开：
- **Task Logs**、**Host Logs**、**Change VPS**、**Initialize** 或 **Delete VPS** 等实用操作保持在分隔线上方，而可执行的 ansible playbook 按钮分组在下方
- **Task Logs** 为所选 VPS 打开一个专用的过滤查看器，包含所有已存储的 playbook 日志，包括轮转的历史文件
- **Initialize**、**Setup VPS**、**Update PBGui**、**Update PBGui and PB7**、**Update Linux** 或 **Cleanup VPS** 等操作会自动将主窗格切换到共享的 **Command Log Viewer**
- **Host Logs** 为服务日志、运行中的机器人日志和 `PBCluster.log` 等文件式目标打开专用的 **Host Log Viewer** 界面
- **Back** 从分支、设置或日志界面返回普通 VPS 详情视图，不丢失所选主机上下文
- 每个可调用的 VPS Manager 任务现在都在共享查看器中保留自己的当前日志和轮转历史条目；保留默认值为 10 个历史文件，可通过 `pbgui.ini` 中的 `[vps_manager] task_log_history` 更改
- 当 ansible 输出已包含终端 ANSI 颜色时，共享查看器现在会在浏览器中保留这些颜色，而不是只依赖文本模式猜测
- 带有粘连结果标记或 `\n` / `\r` 等转义负载控制序列的 ansible 任务日志，现在会在共享查看器中展开为可读的独立显示行
- 带 JSON 正文的结构化 ansible 结果负载现在会美化打印为多行块，使 `stat` 结果等嵌套元数据可以在共享查看器中直接阅读
- 本地 **Update PB8** 重试会在锁为空、至少五分钟旧且没有 Ansible/PB8 构建进程仍在运行时，自动恢复崩溃更新遗留的孤儿写锁；恢复记录在任务日志中，而最近、已填充或活动持有的锁保持阻止

设置网格上方的状态卡片是实时操作提示：
- Linux 软件包状态独立于 VPS 会话密码。正常显示刷新只从 monitor-agent 缓存读取。成功的 **Update Linux** 会在任何请求的重启后执行一次最终软件包探测，原子地更新该缓存，并让 Master 立即消费它。
- 在 Overview 或主机头部单击非零 **Updates** 值，可检查缓存的 apt 软件包列表，包括新安装的依赖和计划移除的软件包。安全更新标记为尽快安装，移除需要依赖/服务审查，内核更新建议维护窗口并可能需要重启，常规更新可与正常维护一起安排。不完整的列表保持未分类，而不是低估紧迫性。较旧的代理缓存保持可读，但在 PBGui 刷新代理负载前可能只显示计数。
- **Credential Capability** 和 **Credential Protocol** 在可用时报告不含机密的 CMC 池就绪状态、活动密钥数以及目录/已实体化代次。
- **Monitor Agent Cache** 始终显示 **Source: agent cache** 和明确的 **OK**、**Stale**、**Missing** 或 **Error** 状态。非 OK 缓存并不意味着 SSH 离线；SSH 连接和遥测/缓存健康度分开显示。
- 面板列出 `live_metrics.ndjson`、`instance_snapshot.json`、`host_meta.json`、`service_status.json`、`package_status.json` 和 `collector_status.json` 及每个文件的有效年龄。实时数据在 15 秒后过期，collector 状态在 30 秒后过期。Collector 循环及其最后错误单独列出。
- 待处理的 Linux 更新和需要重启的提示只来自经过验证的 `package_status.json` 代理负载。在主机当前启动之前收集的肯定重启提示会被丢弃，因为该重启已经发生。其他过期负载保留其最后已知值并清楚标记。缺失、无效或错误的负载保持 **N/A**，绝不会显示为零更新或当前系统状态。
- PB8 **PNL Tdy** 使用每条 PB8 成交日志条目中嵌入的交易所成交时间戳。未注明日期的启动批量摘要代表历史同步，绝不会分配给当天。
- 单击机器人的 CPU、内存或 swap 值可打开其特定运行时的 24 小时历史。同名的 PB7 和 PB8 实例保持独立，有效的零 swap 样本会被保留。
- PB8 **ERR 4W** 和 **TB 4W** 来自本地 monitor agent 对原生和 stderr 日志的有界 UTC 小时扫描。**PNL Hist** 使用最新的权威 PB8 成交批次总数，与同名机器人的旧版 PB7 历史保持分开。PB8 不提供可靠的每日净 PNL，因此 PBGui 显示权威总数而不虚构每日曲线。
- 详情页还包括一个单行摘要表以及一个与之前服务器视图类似的远程服务器资源快照。

对于非 OK 代理，请在内联修复中使用 **Update PBGui**。该操作安装或刷新代理服务并重启它，UI 随后允许下一个 30 秒收集器周期重新填充状态。要在受影响主机上手动检查或恢复它，请精确运行：

```bash
systemctl --user status pbgui-monitor-agent.service
systemctl --user restart pbgui-monitor-agent.service
journalctl --user -u pbgui-monitor-agent.service
```

`Cleanup VPS` 还会在 VPS 上安装或刷新两个小型每日清理 cron 任务：一个用户级任务用于 pip 和 rustup 缓存，一个 root 级任务用于 `journalctl --vacuum-time=1d`。这些周期任务静默运行，不保留自己的日志历史。

**VPS User Password** 等敏感登录字段包含一个眼睛按钮，你可以临时显示为当前会话输入的值。VPS Manager 没有原始 CoinMarketCap 密钥字段或显示操作。

显示状态在实时更新期间保留，因此打开眼睛按钮不会在新 WebSocket 数据到达时立即翻回隐藏。

---

## 添加新的 VPS

1. 单击左侧边栏中的 **Add VPS**，或使用 **Import Host** 部分的 **Import by Hostname**，从已在本地 `/etc/hosts` 中映射的主机名预填 Add 表单。
2. 按照页面顶部的步骤卡片操作：
   - 准备一个 Ubuntu VPS
   - 将主机名添加到本地 `/etc/hosts`
   - 先保存 VPS 记录
   - 从 Add 视图运行 **Initialize & Setup VPS**，或稍后打开主机并从 **Change VPS** 页面完成初始设置
3. 填写 **Step 4: Initialize & Setup your VPS** 表单和 **Save VPS Entry** 默认值。
4. 为当前 runner 栈选择 **PB7**，为干净的极简 PB8 runner 选择 **PB8 Live only (no PB7)**，或选择 **PB7 + PB8** 安装两个运行时。组合配置文件先安装带 PBRun 的 PB7，然后安装 PB8 实时配置文件。仅 PB8 的设置跳过 PB7 检出和虚拟环境，但启用共享的 PBRun 控制器，并且每个包含 PB8 的配置文件都需要至少 3 GiB 可用空间用于 PB8 构建。
5. 单击 **Save VPS** 创建或更新存储的记录。
6. 单击 **Initialize & Setup VPS** 直接从 Add 视图启动引导运行。初始化和设置运行时，UI 停留在当前主机的任务日志上。对于仅 PB8 和组合主机，PB8 克隆、虚拟环境安装和验证作为同一设置任务中的第二个 play 运行，并出现在同一设置日志中。
7. 设置成功后，PBGui 在本地将该主机注册为 Cluster 节点候选。单击 VPS 详情页上的 **Add to Cluster** 完成加入。PBGui 会打开一个进度窗口，用于注册、SSH 修复、身份检查、拉取/推送同步、实体化和 PBRun 启动。加入活动期间窗口无法关闭；API 拥有的任务在页面重新加载或导航后继续，并在 VPS 详情页重新打开时恢复。
8. 同一个 **Add to Cluster** 操作可用于在自动候选注册存在之前设置好的 VPS。普通 VPS 加入不需要手动 **Edit**、**Repair SSH**、**Probe Active Nodes** 和 **Join & Sync** 步骤。
9. 初始化成功后，使用 **Change VPS** 和 **Apply VPS Changes** 进行常规已保存设置的更改。

如果 VPS 被重装，其 SSH 主机密钥会变化。Add 页面预检会阻止初始化并显示 **Review changed key**。通过可信渠道验证显示的 SHA-256 指纹，然后明确确认替换。PBGui 只原子地替换该主机名和 IP 的冲突用户 `known_hosts` 条目，并重复连通性检查。

**Import Existing VPS** 应用相同的保护。密钥变化时显示 **Replace stored key and probe again**，而不是让导入永久阻塞。你验证并接受显示的确切指纹后，PBGui 会再次获取它，原子地只替换该主机名和 IP，并重复导入探测。对话框打开期间指纹发生变化会被拒绝。保存导入会重新连接 VPS Monitor，并在同一 Master 上请求立即重试 PBCluster，因此已确认的密钥不需要在 VPS Manager 或 Cluster Sync 中再次审查。

---

## 典型工作流

### 更新所有服务器
1. 单击 **Master (local)** → **Update PBGui and PB7** → 等待日志显示 *successful*
2. 对每个 VPS：单击主机名 → **Update PBGui and PB7**

PBGui 更新工作流会为集群模式主机重启 PBCluster，并在 VPS 主机上安装/重启 `pbgui-monitor-agent.service`。基于代理的软件包和收集器状态可能保持过期，直到下一个 30 秒收集器周期。如果你用 `git pull` 手动更新任何主机，请随后在该主机上用 `systemctl --user restart pbgui-pbcluster.service pbgui-monitor-agent.service` 重启 PBCluster 和 monitor agent。

### 切换到功能分支
1. 打开 Master 或 VPS 详情
2. 展开 **Branch Management** → 选择目标分支 → 单击 **Switch Branch**

PBGui 分支切换使用与 PBGui 更新相同的 PBCluster 服务同步/重启处理。

### 实体化 API 密钥
- 使用 **System -> Cluster Sync** 预览并在可达节点上实体化 `api-keys.json`。
- CMC 池凭据是独立的密封代次。在 **Services -> PBCoinData -> Pool** 下管理它们，并让 Cluster Sync 实体化；没有按 VPS 的 CMC 密钥。
