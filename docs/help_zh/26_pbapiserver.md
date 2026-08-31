# PBAPIServer

**PBAPIServer** 运行 FastAPI 后端（REST + WebSocket），为 PBGui 的实时功能提供支撑——包括 VPS Monitor、Market Data 状态以及 Gap/Coverage Heatmap。

## 状态按钮

侧边栏中的 **🟢 PBAPIServer ●** / **🔴 PBAPIServer ○** 按钮显示当前状态。单击它可重启服务器。会有一个 toast 通知确认结果。

## 设置

从侧边栏打开 **Settings** 进行配置：

- **Endpoints** — 当前 API、Docs、WebSocket 和 Frontend URL（只读，保存并重启后更新）
- **Bind address / Port** — 网络接口和端口（默认：`0.0.0.0:8000`）。需要重启才能生效。
  - `0.0.0.0` — 可从任何网络接口访问（远程访问）
  - `127.0.0.1` — 仅限本机
- **VPS Monitoring — Auto-restart** — 受监控服务宕机时自动重启
- **VPS Monitoring — Monitored VPS Hosts** — 选择要监控的 VPS 服务器

使用侧边栏中的 **💾** 按钮保存所有设置。

## 日志

所有 PBAPIServer 活动都记录到 `PBApiServer.log`，可在主标签页的日志查看器中查看。

## 故障排除

- **🔴 状态**：单击按钮重启；检查 `PBApiServer.log` 中的错误
- **VPS Monitor 无数据**：确保 PBAPIServer 正在运行且 WebSocket 端点可达
- **端口冲突**：在 Settings 中更改端口，保存，然后重启
