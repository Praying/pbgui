# 欢迎与登录

**Welcome** 页面是 PBGui 的独立入口。你可以在这里完成首次登录和基本设置，并在进入应用程序的其他部分之前执行最低限度的运行时检查。

## 页面用途

使用 Welcome 页面可以：

- 使用当前 PBGui 密码登录
- 更改密码
- 配置本地 PBv7 和 PBv8 路径及解释器
- 选择此计算机作为 **Master** 还是 **Slave**
- 确认 API 服务器可以读取当前运行时设置

## Overview 部分

默认的 **Overview** 部分汇总当前的本地状态：

- **Session**：你是已通过身份验证还是仍为访客
- **PB7**：配置的 PBv7 运行时是否可用
- **PB8**：源代码、V8 配置架构、Python、CLI 和已编译的 Rust 扩展是否已就绪
- **Identity**：当前主机角色和已配置的机器人名称
- **Runtime Status**：按 Security、PB7、可选的 PB8 和 Node 分组的详细就绪检查
- **Login security**：当前登录封禁和保留的暴力破解锁定历史记录

当 PB7 未就绪时，使用 PB7 摘要卡片中的 **Configure PB7** 直接打开 Setup 部分。当 PB8 在 Slave 上属于可选项且未配置时，它在视觉上保持中性状态。

此部分用于在首次启动、更改密码或更新路径后快速执行健全性检查。

当 PBGui 监听所有接口但仍使用已知的旧版默认密码时，问题列表还会显示一条持续存在的安全警告。PBGui 无法检查外部 NAT 或防火墙规则，因此请确认 API 端口仅限 VPN 或受信任网络访问，或设置一个专用密码。新安装程序会自动生成专用密码，而远程安装默认仅向配置的 OpenVPN 网络开放 PBGui 端口。

当多次登录失败触发临时封禁时，问题列表会显示警告，其中包含最近一次直接客户端地址和事件时间。**Acknowledge** 会在全局隐藏该警告，同时保持 Login security 状态和保留的历史记录可见。发生新的锁定时，警告会自动再次出现。

当有意禁用身份验证时，每个独立页面都会持续显示红色的 **NO LOGIN** 指示器。PBGui 无法检查外部防火墙规则：任何能够访问已配置 API 地址的人都拥有完整的管理权限。

## Setup 部分

**Setup** 部分用于编辑 PBGui 从 `pbgui.ini` 读取的值。

重要字段：

- **Passivbot V7 path**：本地 PBv7 检出目录的根目录
- **Passivbot V7 python interpreter**：PBv7 虚拟环境中 Python 二进制文件的完整路径
- **Passivbot V8 path**：本地 PBv8 检出目录的根目录
- **Passivbot V8 python interpreter**：`venv_pb8` 中 Python 二进制文件的完整路径
- **Bot name**：PBGui 使用的本地机器人标识
- **Role**：当此主机管理远程 VPS 系统时选择 **Master**，否则选择 **Slave**

使用 **Browse** 按钮从服务器文件系统中选择目录和 Python 解释器。

保存后，新的操作周期会采用所选角色。更改
PB7 路径、PB7 解释器或机器人名称后需要重启 PBRun 服务；
保存确认信息会报告所需的应用时机。
PB8 路径更改会在下一次 PB8 操作时生效，无需重启 API 或
PBRun。Master 上应配置 PB8，而在未配置的
Slave 上 PB8 仍为可选。Welcome 会执行静态构件检查；安装程序还会在
安装期间执行 PB8 CLI 并验证 Rust 导入。

## Password 部分

左侧边栏中的 **Password** 操作会打开一个专门的单列密码表单。单独的危险操作区域将 **Disable Authentication** 与常规密码更改操作分开。

使用它可以：

- 替换当前登录密码
- 通过 **Disable Authentication** 及其安全确认，有意进入 No-Login 模式
- 输入新密码以重新启用密码身份验证

仅输入空密码会被拒绝。每次更改密码或身份验证模式都会撤销现有会话，并为当前浏览器签发新会话。更改此设置前必须先通过身份验证。

## 典型的首次使用流程

1. 打开 Welcome 页面。
2. 使用当前 PBGui 密码登录。
3. 设置 **Passivbot V7 path**。
4. 设置 **Passivbot V7 python interpreter**。
5. 选择正确的 **Role**。
6. 在 Master 上设置 PBv8 路径和解释器，或使用 Master Installer 安装 PB8。
7. 保存设置。
8. 重新检查 **Runtime Status**，直到所需运行时均已就绪。

## 故障排除

- **PB7 blocked**：配置的 PBv7 路径或解释器缺失或无效
- **PB8 blocked/partial**：PBv8 源代码、架构、解释器、CLI 或 Rust 扩展缺失或无效
- **Save Setup stays disabled**：请先登录
- **Browse does not work**：检查身份验证和服务器路径权限
- **You only want to change the password**：使用侧边栏中的 **Password** 操作，而不是编辑设置字段
