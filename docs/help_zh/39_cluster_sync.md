# Cluster Sync

Cluster Sync 让多个 PBGui Master 和 VPS runner 保持在相同的期望 V7 和 API 密钥状态，而无需外部存储服务。

当你运行多个 Master、跨多个 VPS 运行机器人，或希望 VPS 节点在没有 Master 在线时保留足够的本地状态以安全重启时，使用它。

如果你正在升级现有的 PBRemote/API Sync/V7 SSH Sync 部署，请在加入生产 VPS 节点前阅读 [Cluster Mode Migration](40_cluster_migration.md)。

---

## 什么是集群

集群是一组共享一个复制集群状态的 PBGui 安装。

| 术语 | 含义 |
|---|---|
| **Cluster** | 整个 PBGui 同步组。它有一个稳定的 `cluster_id`。 |
| **Node** | 一个 PBGui 安装。节点可以是 Master 或 VPS runner。 |
| **Master** | 用于管理配置、API 密钥、VPS 节点和同步状态的 PBGui 服务器。 |
| **VPS runner** | 可以运行 PB7 机器人并存储集群状态本地副本的服务器。 |
| **Desired state** | 集群关于哪个机器人应该存在、应该在哪里运行以及是否应该运行的决策。 |
| **Operation log** | 集群更改的追加式历史。PBGui 从中重建期望状态。 |

每个节点有一个稳定的 `node_id`。主机名、IP 地址、SSH 端口、VPS Manager 名称或 `pbname` 改变时，此 ID 不变。

---

## Cluster Sync 覆盖什么

Cluster Sync 覆盖：

- V7 机器人配置，包括币种覆盖 JSON 文件。
- V7 期望状态：启动、停止、移动、删除和墓碑。
- 显式的 V7 强制模式配置更改，如 Panic、Graceful Stop 和 Take Profit Only。
- `api-keys.json` 的 API 密钥分发。
- 所有活动状态副本的 CMC 池凭据，以及 Master 的 TradFi 保险库配置文件。
- Master 和 VPS 节点上的本地状态副本。
- 节点间复制使用的受限集群同步 SSH 密钥。

Cluster Sync 不覆盖：

- DB Tools 行同步或数据库文件复制。
- Dashboard 和模板同步。
- 自动 panic 决策、自动强制卖出或重复机器人清算行为。
- 自动故障转移移动。

---

## 更改如何穿过集群移动

PBGui 不把缺失文件视为删除。每个重要更改都写成显式操作。

示例：

- 保存或激活 V7 配置会写入 upsert 操作。
- 通过 Dashboard 或 Run Config 设置 Panic、Graceful Stop 或 Take Profit Only 会写入并同步配置操作。
- 移动机器人会写入 move 操作。
- 停止机器人会写入 stop 操作。
- 删除机器人会写入 delete 或 tombstone 操作。
- 更新 `api-keys.json` 会写入 API 密钥操作。
- 添加、轮换、禁用或删除 CMC/TradFi 保险库条目会写入签名的凭据协议 v2 操作和密封 blob。

每个节点将已知操作计数器与另一个节点比较。缺失操作和所需 blob 被传输，然后接收节点重建其本地期望状态。

每次 V7 保存都在发布操作前存储一个不可变的内容寻址快照。因此你可以反复保存，或将一个实例从主机 A 移动到主机 B 再立即移动到主机 C；每个操作保持可传输，而接收者实体化最新的期望主机和配置。

这使同步可重复且可安全重试。

凭据协议升级是零阶的。每个更新的进程首先通过本地仅所有者可访问的影子记录保持其自己的旧版 CMC/TradFi 凭据可用，不更改旧版源也不发布它。混合 v1/v2 集群保持在被动的 **waiting for upgrade** 状态。在每个活动状态副本宣告 v2 之前，不会开始冻结、清点或删除；禁用和已移除节点被忽略。最终 v2 同步自动开始切换，没有指定最后一个节点或服务重启。

---

## V7 机器人与期望状态

对于每个 V7 实例，期望状态存储：

- 当前配置版本
- 机器人应该运行还是停止
- 允许运行它的分配节点
- 所有可同步配置 JSON 文件的清单哈希
- 冲突状态
- 已删除机器人的墓碑状态

PBRun 在启动机器人前检查期望状态。

PBRun 只在以下情况启动机器人：

- 机器人存在于期望状态中
- 它没有被墓碑化
- 它没有冲突
- 期望状态说 `running`
- 分配节点匹配本地节点
- 本地配置版本和清单哈希匹配期望状态

如果检查失败，PBRun 不会启动机器人，PBGui 显示阻止原因。

Panic、Graceful Stop 和 Take Profit Only 是显式的 PB7 配置更改。Cluster Sync 像任何其他 V7 配置更新一样分发它们。它们不是直接的交易所订单，也不是 Cluster Sync 做出的自动 panic 决策。

---

## 机器人移动和删除

移动是显式的。如果机器人从一个 VPS 移动到另一个，旧 VPS 在得知移动操作后不得启动它。

删除是显式的。PBGui 绝不会仅仅因为本地 V7 实例在远程文件或远程状态列表中缺失而删除它。

墓碑防止旧配置被过期节点带回。

---

## 离线节点与重启

即使没有 Master 在线，VPS 也可以重启。

启动行为：

1. VPS 启动 PBGui/PBRun。
2. Cluster Sync 尝试在短时间内联系已知对等节点。
3. 如果对等节点可达，VPS 拉取缺失操作并重建期望状态。
4. 如果没有对等节点可达，VPS 使用其本地期望状态。
5. PBRun 只启动分配给此 VPS 的机器人。

过期的本地状态只是警告。PBRun 不会仅仅因为本地集群状态较旧而阻止启动。

这是有意的：主机可能在夜间离线几个小时，没有自动故障转移时，PBGui 不应仅仅因为状态过期就停止正常的重启恢复。

### 检查点与有界历史

PBCluster 可以用已验证的检查点加最近操作尾部替换旧操作历史。清理默认禁用。打开 **Cluster Sync -> Retention** 查看集群范围策略和实时自动清理状态。

**Retention** 和 **History Days** 中的值在单击 **Save Retention Policy** 前只是草稿。允许的历史窗口为 1 到 3650 天；默认是七天。

可用设置：

- **Disabled**：构建并验证检查点，但从不删除历史或 blob。
- **Enabled (automatic)**：持续保留配置的操作历史窗口，并在所有安全检查通过时移除不可达 blob。现有的签名 `oplog` 和 `oplog_and_blobs` 策略都被视为这种自动模式。

**Automatic cluster cleanup** 是主要的运维显示。它每五秒从 PBCluster 的持久化状态刷新，而不打开 SSH 连接或推进清理。它显示当前阶段、已提交检查点和副本确认、保留和删除的操作/blob 计数、阻止项以及最新评估时间。维护在策略更改后以及至少每小时评估一次。**Advanced node diagnostics** 下的 **Run Node Diagnostics** 是可选的，只计算详细的按节点投影。

报告列的含义：

- **Projection**：`dry_run` 表示可选的节点诊断只计算了候选，没有删除任何内容。
- **Checkpoint**：从该节点当前验证状态和有效策略计算的确定性影子检查点 ID。
- **Eligible Ops**：操作文件早于有效历史窗口且位于或低于检查点基线的部分。
- **Eligible Size**：这些合格操作文件的组合磁盘大小；不包括配置、凭据、检查点或 blob。
- **Retained Ops**：保留在最近尾部中的操作文件。
- **Required Blob Set**：投影检查点和保留状态所需的确切配置、机密和密封哈希的计数与摘要。相等的摘要证明所需 blob 收敛，即使本地垃圾不同。
- **Local Garbage Blobs** 和 **Local Garbage Size**：清理前投影的本地存储不可达 blob 及其组合大小，或清理开始后最近匹配的自动 GC 评估的值。
- **Blob GC Projection**：`projected` 表示只读模拟，或自动 blob GC 是否被基于状态的安��门阻止、就绪或完成。投影还在完成后报告已删除的 blob 计数和字节数。
- **Migration Seal / Error**：本地密封结果或节点错误。`not reported` 表示远程预览不暴露其密封结果；提交协议仍独立验证每个副本的密封。

值为按节点的。相等的行通常描述每个节点上相同的复制操作集，不得加总为不同的集群操作。合格性要求签名的操作时间戳早于截止时间，且操作序列位于或低于已提交检查点基线。本地文件年龄有意不是第二个等待门槛：迟到的副本包含相同的签名操作年龄，验证的检查点加副本确认提供删除安全。
本地垃圾值描述每个节点的本地内容寻址存储，当一个节点有额外孤儿副本时可能合法地不同。检查点 ID、Eligible Ops、Retained Ops 和 Required Blob Set 摘要仍必须跨副本收敛。

**Run Node Diagnostics** 从影子检查点、当前/上一检查点保护、使用有效历史窗口的模拟操作修剪、保留操作尾部和实时邮箱引用投影 blob 候选。`projected` 值因此是预览；`checkpoint_missing` 等阻止项仍会阻止删除。一旦存在匹配的自动 GC 评估，表格显示其实际候选和状态。**Run Node Diagnostics** 从不更改或删除数据。

PBCluster 还在正常操作同步后检查副本相关的 blob 覆盖。活动 Master 比较来自适用影子或活动/上一检查点、保留 oplog 和实时邮箱的验证引用，然后只发送有能力的对等节点上缺失的 blob。本地存储不完整的 Master 也会在重新分发前从另一个 Master 拉取验证的缺失 blob。这修复了操作计数器已经匹配的收敛节点，而不实体化配置或在覆盖查询中暴露机密内容。

保存启用策略后，PBCluster 复制它，提交带每个活动状态副本确认的匹配检查点，并自动应用保留。如果副本不可用或任何状态检查失败，状态变为 **Retention paused**，不删除任何内容，集群健康时维护自动恢复。没有基于时间的激活或稳定性门槛。旧的不可达 blob 保留一小时的技术最小年龄，因此上传不会在其引用操作存储前被删除。

更改策略会写入签名的集群操作。自动保留不会绕过安全检查：每个活动状态副本必须独立确认同一检查点，凭据协议 v2 迁移必须已密封，检查点缩减器必须匹配完整重放。冲突会自动暂停删除。

检查点之后的操作被签名并绑定到其检查点 ID。落后于已删除历史的节点在同步尾部前安装经过验证的检查点和所需 blob。PBGui 拒绝分歧的过期尾部，而不是合并它。感知检查点的 Join 和 Join Existing Cluster 不需要旧的 genesis 操作文件。

---

## 冲突

当两个 Master 在彼此同步前从同一父版本更改同一机器人时，可能发生冲突。

PBGui 检测到冲突时：

- 实例被标记为冲突
- PBRun 不得自动启动它
- Cluster 页面显示竞争操作
- 用户必须选择或创建获胜版本
- 解决写入新操作

PBGui 对 V7 实例冲突不使用盲目的后写胜。

---

## 凭据

Cluster Sync 跟踪交易所 `api-keys.json` 更新和凭据保险库代次。

期望状态只存储元数据，如 serial 和负载哈希。API 密钥内容存储为受限机密数据，不得出现在日志或正常期望状态 JSON 中。

在节点上安装 API 密钥使用 Cluster Sync 实体化安全步骤：

- 现有文件不同时在 Master 节点上创建备份
- VPS runner 节点跳过本地备份
- 写入新文件
- 验证负载
- 不重启机器人或部署其他文件

CMC 和 TradFi 保险库条目不使用交易所 API 密钥 blob。凭据协议 v2 为每个操作签名，并将每个机密代次密封给其合格接收者。CMC 使用 `cluster` 受众（活动 Master 和 VPS 副本）；TradFi 使用 `masters` 受众。VPS 可以验证、存储和转发不透明的 TradFi 信封，但不是接收者，无法解密它。

协议 v1 对等节点永远不会收到 v2 凭据操作。凭据迁移和新凭据发布会等待，直到每个活动状态副本报告协议 v2 加密能力。

CMC 租约是尽力而为的协调元数据，不是使用已实体化密钥的依赖。权威或中继不可用时，本地软预算选择继续。提供商 `429` 响应让受影响密钥进入冷却，并在可能时故障转移到另一个合格池密钥。导入、外部使用和共享配额密钥是有效的池成员；提供商轮换是可选的。

活动成员变化时，PBGui 为新接收者集重新封装现有机密代次。新节点在重新封装、精确代次实体化和确认完成前不得将凭据能力报告为活动。TradFi 在此过程中保持仅 Master。

---

## 集群同步 SSH 密钥

Cluster Sync 使用专用的受限 SSH 密钥进行常规复制，而不是普通管理 SSH 密钥。

管理 SSH 凭据只用于引导、密钥安装和恢复。

集群同步密钥受到限制，不能打开普通 shell 或运行任意命令。它们通过 OpenSSH 强制命令安装，只允许集群同步操作，如读取状态向量、发送操作、发送 blob 和重建期望状态。

这限制了集群同步密钥泄露时的损害：该密钥不应允许交互式登录、端口转发、代理转发或不受限制的 SFTP。

---

## VPS 到 VPS 防火墙规则

Cluster Sync 不修改主机防火墙规则。管理员必须使用 VPS Manager 防火墙控件或自己的防火墙工具，为每个需要入站访问的已启用对等节点允许配置的 SSH 端口。

**Repair SSH** 和 **Repair All SSH** 安装受限的 Cluster Sync 密钥，但不打开网络端口。PBGui 保持每个现有防火墙规则不变。

---

## Cluster 页面

专用的 **Cluster Sync** 页面是监控 Cluster Sync 的主要场所。

页面分为 Overview、Setup、Nodes、Credentials、V7 State、Tombstones、Retention 和 Oplog 分区。它在后台刷新本地状态、节点、期望状态和最近 oplog 条目，并就地更新更改的卡片和节点表格字段，而不是重新加载整个屏幕。

**Nodes** 视图以总成员数、启用同步的节点数、Master 数和带 SSH 元数据的节点数的摘要卡片开始。其成员表保持表头可见，窄屏时水平滚动，明确标记本地节点，并将常规同步/设置操作与 SSH 修复和节点移除分开。本地节点的同步切换和移除保持禁用。

页面显示：

- 集群身份和本地节点身份
- 所有已实体化节点及其角色
- V7 期望状态
- 冲突和墓碑状态
- 存在时的 API 密钥元数据
- 最近的本地操作日志条目
- 对可以出站到达现有 Master 的第二个 Master 的显式 Join Existing Cluster 操作
- 已知 VPS 节点和现有本地 V7 配置的引导预览/应用操作
- 已知集群节点的只读远程 hello 探测状态
- 对没有集群身份的可达节点的显式 Join & Sync 操作
- 对已加入节点的只读 Preview 操作，比较远程状态用于诊断或重试
- 可编辑的节点同步模式、SSH 端点、Remote PBGui Dir 和出站对等允许列表
- 对不再拥有 V7 配置的过期节点的禁用节点移除
- 签名的历史保留策略和有界的只读按节点清理报告

Bootstrap 为已知 VPS Manager 主机写入显式本地 `ADD_NODE` 操作，为本地配置写入 `UPSERT_CONFIG` 操作。VPS Monitor 元数据可用时，Bootstrap 保留已知主机是 Master 还是 VPS runner。它绝不从缺失文件或缺失 VPS 条目推断删除，也不清除墓碑。探测列在可用时运行只读的受限 `hello` 命令；它不安装密钥、写入远程文件、启动机器人、停止机器人或部署任何内容。

节点同步模式控制 PBCluster 可以联系哪些节点：

- **Disabled** 将节点保留在集群历史中，但将其排除在同步之外。
- **Outbound Only** 意味着节点不需要入站 SSH；它仍然可以发起向允许对等节点的同步。
- **Reachable via SSH** 让允许的对等节点通过其 SSH host、SSH user、SSH port 和 Remote PBGui Dir 联系该节点。

本地 Master 从运行中的检出检测自己的 Remote PBGui Dir，并在可能时将其存储为 home 相对路径。它还从本地网络和登录用户填充缺失的本地 SSH host/user 元数据。加入或导入后审查远程节点元数据，尤其是私有 VPN 地址优于公共地址时。

引导或导入后，VPS 节点通常以 **Disabled** 候选开始。对于 VPS Manager 主机，使用 VPS 详情页上的 **Add to Cluster**：它自动执行可达模式更新、SSH 修复、身份探测、加入和最终同步。只在诊断、自定义拓扑更改或恢复时使用单独的 **Edit**、**Repair SSH**、**Probe Active Nodes** 和 **Join & Sync** 操作。

节点显示 **No Identity** 时，**Join & Sync** 写入远程集群身份，并拒绝覆盖不同的现有身份。然后它推送缺失的本地操作、重建远程集群状态、实体化分配的 V7 配置和 API 密钥，并在远程为最新时再次启动 PBRun。在 VPS runner 上，Join 先停止 PBRun，使运行中的机器人在过渡期间不被评估；passivbot 进程保持不动。在 Master 节点上，PBRun 不被停止或启动。

协议 v2 操作到达后，PBCluster 还会将符合条件的密封凭据实体化到仅所有者可访问的保险库。交易所 `api-keys.json` 实体化和密封凭据实体化是独立步骤。

要将新设置的 VPS runner 添加到现有集群，在 **System -> VPS Manager** 中添加并设置 VPS，然后在其详情页上单击 **Add to Cluster**。PBGui 使用 VPS Manager 已存储的 SSH host、user、port 和 Remote PBGui Dir，安装受限密钥，拒绝外来或不匹配的身份，加入节点并完成同步和实体化。此正常路径不需要 Cluster Sync 页面操作。

之后打开 **System -> Cluster Sync -> Nodes** 只用于查看状态或配置自定义对等拓扑。VPS runner 不需要手动添加到 Master 的对等允许列表中，Master 才能推送到该可达 VPS，除非 Master 的出站对等列表被显式限制。

**Login Key** 列描述常规 PBCluster 同步登录，而不是加入结果。**Skipped** 表示节点当前不在本地出站同步拓扑中，例如因为本地 Master 的同步对等列表还不包含该 VPS。它不意味着 Join 失败。

在无法被主 Master 入站到达但可以出站 SSH 到它的第二个 Master 上使用 **Join Existing Cluster**。Master 应加入现有集群时，在 Bootstrap 前执行此操作。密钥登录已经工作时，该操作使用 VPS Monitor SSH 池，或在密钥安装前提示一次性 SSH 密码。它按与 VPS Manager 相同的顺序搜索上游 PBGui 目录（`remote_pbgui_dir`、`~/software/pbgui`、`~/pbgui`），读取上游 Master，本地 oplog 为空时自动采用上游 `cluster_id`，拉取上游操作和 blob，将本地 Master 注册为带检测到的本地路径/IP/用户元数据的 `outbound_only`，在上游 Master 上安装本地 Cluster SSH 密钥并推送注册操作。SSH 密码只用于该请求，不会被保存。如果此本地安装已有不同集群的集群操作，除非启用恢复选项，自加入拒绝覆盖它们。恢复在替换为上游集群状态前，将之前的本地集群状态归档到 `data/cluster/archives/` 下。加入后，只在其他允许对等节点应发起 SSH 回连时将该 Master 切换到 **Reachable via SSH**。

PBCluster SSH 访问是技术设置状态。在 VPS 上的正常 PBGui 设置/更新期间，PBGui 现在创建专用的本地 PBCluster SSH 密钥，并在 VPS 上安装 Master 的公共密钥，带只能运行 `cluster_sync_command.py` 的强制命令。PBCluster 使用此专用密钥且 `IdentitiesOnly=yes`；用户不需要手动创建或复制 SSH 密钥。

VPS 节点默认不向其他对等节点发起 SSH 扇出。runner VPS 只联系显式 `sync_peers`；这避免意外的 VPS 到 VPS 网状网络。Master 仍然可以推送到可达的 VPS 节点，除非其出站对等列表被显式限制。

对节点使用 **Edit** 配置其同步模式、SSH host/user/port、Remote PBGui Dir 和允许的出站对等节点。更改其对等允许列表、SSH 元数据或更新该节点后，对单个节点使用 **Repair SSH**：它读取远程 PBCluster 公共密钥，将其指纹存储在集群元数据中，并为 Master 和任何配置的对等源安装所需的受限密钥。较大更新或拓扑更改后，当几个活动可达节点可能需要密钥刷新时，使用 **Repair All SSH**。它对每个活动节点运行相同的修复流程，报告失败节点、出站安装错误和缺失源密钥，并保持禁用/仅出站入站目标不变。正常 SSH 密钥登录尚不可用时，PBGui 提示受影响节点的 SSH 密码，仅为此请求用该密码重试，且不保存。只对不再拥有 PB7 或 PB8 配置的禁用非本地节点使用 **Remove**；它写入 `REMOVE_NODE` 操作并从实体化成员中移除节点，同时保持 oplog 历史完整。

已加入节点显示 **OK** 时，**Preview** 操作读取远程状态向量和期望状态。它比较 actor 序列号、V7 实例元数据、墓碑和 API 密钥元数据与本地状态。它还计算远程缺失哪些本地操作、本地缺失哪些远程操作范围，以及后续写入阶段需要哪些哈希引用。Preview 是只读的；它不复制操作、blob 或配置。

从 Preview 窗口，**Push Missing Ops + Rebuild** 是显式的重试/诊断远程写入操作。只在远程没有本地缺失的操作时可用。它启动一个后台推送任务，发送当前 V7 配置 blob、API 密钥负载 blob、API 密钥机密 blob，批量发送远程状态向量缺少的本地 oplog 条目，任务运行时报告本地进度，然后运行远程 `rebuild`。进度报告不分割或减慢远程同步。如果远程包装器较旧，尚不能接受批量命令，PBGui 在可用处回退到较慢的逐项上传。

操作和配置 blob 同步后，Preview 窗口显示单独的 **V7 Config Materialization Preview** 和 **PB8 Config Reconciliation Preview** 卡片。**Materialize V7 Configs** 将分配的、非冲突的 V7 JSON 配置写入远程 `data/run_v7`。**Reconcile PB8 Configs** 精确协调分配的 `data/run_v8` JSON bundle，包括备份的过期文件移除和墓碑目录删除。远程状态不同或所需 blob 缺失/无效时，两种手动重试都拒绝运行。

PB8 实时配置使用单独的 `UPSERT_PB8_CONFIG` 和 `DELETE_PB8_CONFIG` 操作、`pb8_instances` / `pb8_tombstones` 期望状态映射，以及 `data/run_v8` 的精确 bundle 清单。对等节点必须宣告 `pb8_instances_v1`；存在活动 PB8 期望状态时，较旧对等节点被阻止，而不是接收它们无法解释的操作流。实体化需要本地 PB8 检出加当前仅所有者可访问的 PB8 交易所密钥投影。它原子地协调完整 JSON bundle，在 `data/backup/v8` 下备份移除的文件，并且绝不启动或停止机器人。只有 V7、PB8 和 API 密钥预览都最新时，手动实体化后 PBRun 才启动。

Preview 窗口还显示 **API-key Materialization Preview**。**Materialize API Keys** 是从复制的机密 blob 安装 `api-keys.json` 的手动重试操作。现有文件不同时，Master 节点先创建正常的 `data/api-keys/` 备份；VPS runner 节点跳过本地备份。写入是原子的并验证最终哈希。

CMC/TradFi 保险库迁移可恢复且自动。它清点旧版 CMC/TradFi 字段，在活动 v2 副本间建立签名的写入者冻结，导入并密封不可变代次，等待精确实体化确认，然后备份并移除未更改的旧版字段。不要把 CMC 机密重新加到 `pbgui.ini`、按 VPS 清点或自动化中，也不要手动编辑 PB7 TradFi 条目。完成清理不需要轮换。

---

## 出问题怎么办

如果节点离线：

- 从 Cluster 或 VPS Manager 页面检查 SSH 可达性。
- 检查节点是否启用同步。
- 检查 host、port、user 和主机密钥元数据。

如果机器人不启动：

- 打开 Cluster 页面检查阻止启动的详情。
- 验证机器人分配给此节点。
- 检查冲突或墓碑状态。
- 验证本地配置版本匹配期望状态。

如果出现冲突：

- 不要在节点间手动复制文件。
- 在 Cluster 页面上审查竞争操作。
- 选择或创建正确的获胜配置。
- 让 PBGui 写入解决操作。

如果出现外来集群警告：

- 不要强制同步。
- 验证节点属于此 PBGui 集群。
- 只有确定是正确的节点时，才加入或重置远程集群身份。

如果 **Repair All SSH** 报告出站错误：

- 对于 `SSH authentication failed`，输入命名节点提示的 SSH 密码并从模态框重试。密码是临时的，不会被保存。
- 对于 `Remote host is unreachable`，验证节点的 **Reachable via SSH** 元数据和网络/防火墙访问，然后运行 **Probe Active Nodes**。
- 对于缺失源密钥，先在源节点上运行 **Repair SSH**，或在源节点存储 Cluster SSH 公共密钥后重新运行 **Repair All SSH**。
- 修复后，在使用 **Join & Sync** 或远程 Preview 操作前再次运行 **Probe Active Nodes**。

---

## 安全规则

- 不要删除本地机器人目录来表示删除。使用 PBGui，让它写入删除操作。
- 不要在其他安装上复用复制的 `data/cluster/node_id` 文件。
- 不要手动编辑 `desired_state.json`；它从操作日志生成。
- 即使集群复制使用受限密钥，也保持管理 SSH 访问可用于恢复。
