# 集群模式迁移

本指南列出了将现有 PBGui 部署从 PBRemote/API Sync/V7 SSH Sync 迁移到 Cluster Sync 所需的步骤。

PBRemote 不再需要，升级期间会被移除。Cluster Sync 接管 V7 配置和 API 密钥同步。

Cluster Sync 取代旧的同步路径。PBRun 只在运行机器人的主机上需要。仅 Master 节点需要 PBApiServer 和 PBCluster，但 PBRun 可以保持停止。纯 VPS runner 不需要 `pbgui-api.service` 或 `PBApiServer.py`；它们同步需要 PBCluster，运行机器人时才需要 PBRun。

凭据协议 v2 是此迁移的一部分。CMC 密钥从旧版 INI/VPS 字段移入密封的集群池，而 TradFi 配置文件移入仅 Master 的保险库。VPS 节点可以中继密封的 TradFi 信封，但无法解密它们。

凭据更改是零阶的滚动升级。正常更新可以按任何顺序到达 UI Master、另一个 Master、任何 VPS、PBCluster、API、PBCoinData 和 Market Data/TradFi 任务，需要时中间可暂停数天。更新的进程使用仅所有者可访问的本地影子保险库，而旧进程继续使用其未更改的本地旧版源。没有第一个或最后一个凭据迁移重启。

---

## 步骤

### 1. 按任意顺序更新节点

1. 方便时更新任何 Master 或 VPS；其他节点运行 v2 时，节点可以停留在上一版本。
2. 让每个节点的正常更新工作流重启该节点上安装的服务。不同节点上的服务不需要协调顺序。
3. 如果 Master 不运行机器人，PBRun 可以保持停止。纯 VPS runner 仍然不需要 API 服务。

### 2. 引导 Cluster Sync

1. 打开 **System -> Cluster Sync**。
2. 运行 **Bootstrap Preview**。
3. 如果预览显示预期的本地 V7 配置和 VPS 主机，运行 **Bootstrap Apply**。

凭据清理开始前，每个活动状态副本节点必须报告协议 v2 加密能力，每个当前运行的本地 PBGui 凭据消费者必须有新鲜的匹配进程能力。混合的活动 v1/v2 节点或服务集按节点/服务名称报告 **waiting for upgrade**，而旧/新消费者保持可用。它不会冻结、清点或删除凭据。禁用/移除的节点和停止的服务不阻塞。PID 复用、崩溃、过期心跳和不匹配的代码代不能满足该屏障。最后一个旧进程通过正常更新生命周期退出或重启后，工作器或 API 周期自动继续冻结、清点、发布、确认、截止、清理、扫描和解冻。

### 3. 加入其他 Master

1. 在每个其他 Master 上，如果主 Master 尚不为人所知，将其添加到 VPS Manager，或直接在 Join 表单中输入其 SSH 详情。
2. 在其他 Master 上打开 **System -> Cluster Sync**。
3. 使用主 Master 的 VPS Monitor 主机名和 SSH 详情执行 **Join Existing Cluster**。如果 Cluster SSH 密钥尚未安装，PBGui 先尝试现有密钥/池登录，只在需要时提示 SSH 密码。密码只用于该请求，不会被保存。
4. 当此其他 Master 还没有本地 Cluster oplog 条目时，PBGui 自动采用主 Master 的 `cluster_id`。
5. 新 Master 默认注册为 **Outbound Only**。只在其他允许对等节点应发起 SSH 回连时，才将其切换到 **Reachable via SSH**。
6. 如果 Master 被意外先引导，启用恢复选项。PBGui 将之前的本地 Cluster 状态归档到 `data/cluster/archives/` 下，然后加入主 Master 的集群。

### 4. 准备 VPS runner

1. **VPS Manager -> Update PBGui** 对每个 runner 仍然可用，并同步配置的服务文件；它可以在更新任一 Master 之前或之后使用。
2. 如果 VPS Manager 显示需要 systemd 迁移，运行 **Systemd Migration Preview**，然后 **Apply**。
3. 之后运行 **Cleanup VPS** 移除旧的 PBRemote/rclone 残留。
4. 纯 VPS runner 不需要 `pbgui-api.service`，也不应运行 `PBApiServer.py`。
5. 如果你用 `git pull` 手动更新 runner，之后用 `systemctl --user restart pbgui-pbcluster.service` 重启 PBCluster。

### 5. 加入 VPS 节点

1. 在 **System -> VPS Manager** 中打开成功设置的 VPS，单击 **Add to Cluster**。
2. PBGui 自动使用存储的 VPS SSH 元数据将节点配置为可达，修复受限 Cluster 密钥，验证远程没有冲突身份，加入它，同步 Cluster 数据，实体化配置/API 密钥，并在一切最新时再次启动 PBRun。运行中的 passivbot 进程保持不动。
3. **System -> Cluster Sync -> Nodes** 只用于状态检查、自定义对等拓扑或恢复。普通 VPS 加入不需要单独的 **Edit**、**Repair SSH**、**Probe Active Nodes** 和 **Join & Sync** 操作。

加入节点还要求为新接收者集重新封装现有机密代次。节点只有在精确代次实体化和确认后才变为凭据活动。CMC 在 Master 和 VPS runner 上实体化；TradFi 只在 Master 上实体化，并在 VPS 中继上保持不透明。

### 6. 检查结果

1. 打开 **PBv7 -> Run** 和 **VPS Manager**。
2. 如果机器人显示为阻止，在 PBGui 中修复分配或配置。
3. 如果 Join 报告自动同步/实体化需要注意，为该节点打开 **Preview** 并在那里运行建议的操作。
4. 打开 **Services -> PBCoinData -> Pool**，在使用 Dynamic Ignore 前确认每个预期节点报告活动实体化代次。

每个更新的本地消费者首先影子其自己的旧版 CMC/TradFi 值而不更改源。集群范围清点只在自动节点与进程 v2 屏障后开始，复用那些凭据 ID 和代次，等待实体化确认，然后才备份并移除未更改的旧版字段。不需要手动切换、服务排序或指定的最终重启。不要把密钥复制到 `pbgui.ini`，不要创建按 VPS 的 CMC 密钥，不要显示已存储的 TradFi 值，也不要手动编辑 PB7 TradFi 条目。导入/共享的 CMC 密钥仍然是有效的池成员，提供商轮换是可选的。

---

## 完成

- PBRemote 不再使用。
- API 密钥和 V7 配置通过 Cluster Sync 实体化。
- CMC 和 TradFi 机密使用协议 v2 密封代次；TradFi 接收者仅限 Master。
- 旧版 CMC/TradFi 字段在签名迁移屏障和精确实体化确认完成后被移除。
- `data/cmd/status_v7.json` 不再创建、读取或响应。
- PBCluster 在同步节点上运行；`pbgui-api.service` 只在提供 PBGui UI/API 的 Master 上运行。
