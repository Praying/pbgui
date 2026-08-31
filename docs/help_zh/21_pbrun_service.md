# PBRun 服务详情

PBRun 是 PBGui 的本地服务编排器。它使机器人进程与已配置实例保持同步，并更新 Passivbot 使用的运行时文件。

## PBRun 的作用

PBRun 运行一个 5 秒周期的守护进程循环，用于：

- 为已配置实例（PB7、PB6 Multi、PB6 Single）启动/停止本地 Passivbot 进程
- 监控每个运行中机器人的资源使用情况（CPU、内存），并从日志文件中收集 PnL、错误和 traceback 计数
- 监视动态币种过滤器（通过 PBCoinData 映射），并写入 `ignored_coins.json` / `approved_coins.json`
- 启用集群模式时，在启动或继续运行 V7 机器人之前强制执行 Cluster Sync 预期状态
- 运行内存监视器：如果可用系统内存降至 250 MB 以下，则重启内存使用量最高的机器人
- 将服务日志写入 `data/logs/PBRun.log`

## PBRun 详情面板

单击 Services 概览中的 PBRun 卡片（或使用侧边栏）以打开详情面板：

- 顶部控制栏显示当前状态（运行中/已停止）以及 Start/Stop/Restart 按钮
- Log 选项卡显示实时过滤的 PBRun 日志查看器

## 典型启动行为

重启或首次运行后，PBRun 可能会记录大量 `Change ignored_coins` / `Change approved_coins` 更新。在根据当前映射数据初始化动态币种列表期间，这是正常现象。

## 故障排除快速检查

- 在 Services 中确认 PBRun 正在运行
- 检查 `data/logs/PBRun.log` 中最近的 `ERROR` 行
- 验证 `data/run_v7/<instance>/ignored_coins.json` 和 `approved_coins.json` 存在且是有效的 JSON 列表
- 如果动态列表看起来已过时，请在 PBCoinData 映射更新完成后重启一次 PBRun
