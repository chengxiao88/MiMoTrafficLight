# MiMoTrafficLight — MiMo Code 状态指示灯

> 一个 Windows 桌面小工具：当你使用 MiMo Code（小米 AI 编程助手）时，在屏幕右下角显示**红黄绿状态灯**，不用一直盯着终端也能知道 MiMo 当前在干什么。

本项目从 [ClaudeTrafficLight](https://github.com/chengxiao88/ClaudeTrafficLight) 改造而来，不再使用 Claude Code Hooks，状态来源改为 MiMo Code / OpenCode 插件事件。

## 它是什么

| 灯色 | 含义 |
|------|------|
| 🟢 **绿灯常亮** | MiMo 空闲，等待你输入 |
| 🟢 **绿灯闪烁** | 任务完成，闪烁 10 次后转常亮 |
| 🟡 **黄灯慢闪** | MiMo 正在思考 |
| 🟡 **黄灯常亮** | MiMo 正在执行工具 |
| 🔴 **红灯闪烁** | MiMo 等待你授权确认 |
| 🔴 **红灯常亮** | 发生错误 |
| ⚫ **三灯全灭** | MiMo 未运行或状态超过 30 分钟无更新 |

灯同时在**桌面小窗口**和**系统托盘**（任务栏右侧小图标）显示。

## 前置条件

- 已安装 **MiMo Code**
- 已安装 **.NET 8 SDK**（x64）— [下载地址](https://dotnet.microsoft.com/download/dotnet/8.0)

## 快速开始

### 1. 安装

打开 PowerShell，进入项目目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

安装脚本会自动：
- 编译 `MiMoTrafficLight.exe` 并部署到 `%LOCALAPPDATA%\MiMoLight\app\`
- 复制脚本到 `%LOCALAPPDATA%\MiMoLight\scripts\`
- 复制插件到 `%LOCALAPPDATA%\MiMoLight\plugins\`
- 尝试安装插件到 MiMo Code 插件目录（`~/.config/mimocode/plugins/`）

### 2. 启动

```powershell
& "$env:LOCALAPPDATA\MiMoLight\scripts\start-mimo.cmd"
```

指定项目目录启动：

```powershell
& "$env:LOCALAPPDATA\MiMoLight\scripts\start-mimo.cmd" "D:\Projects\MyProject"
```

启动脚本会：
1. 启动 `MiMoTrafficLight.exe`（桌面红绿灯）
2. 切换到指定项目目录（如果传入了目录）
3. 启动 MiMo Code（自动检测 `mimo`、`mimocode`、`mimo-code` 命令）

### 3. 手动测试

不用 MiMo Code 也能测试红绿灯：

```powershell
# 红灯（授权等待）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 permission

# 黄灯（工作中）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 working

# 绿灯（完成）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 done

# 黄灯慢闪（思考中）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 thinking

# 全灭
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 off
```

## 架构说明

```
MiMo Code / OpenCode 插件事件
        ↓
plugins/mimo-traffic-light.js
        ↓
写入 %LOCALAPPDATA%\MiMoLight\status.json
        ↓
MiMoTrafficLight.exe 监听 status.json
        ↓
Windows 桌面红黄绿灯 + 托盘图标
```

### 状态文件

路径：`%LOCALAPPDATA%\MiMoLight\status.json`

```json
{
  "state": "Thinking",
  "source": "mimocode",
  "event": "message.updated",
  "sessionId": "可选",
  "projectDir": "可选",
  "updatedAt": "2026-06-13T21:30:00.000Z"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `state` | 是 | 标准状态枚举 |
| `source` | 是 | 固定为 `mimocode` |
| `event` | 否 | 原始事件名 |
| `sessionId` | 否 | 会话 ID |
| `projectDir` | 否 | 当前项目目录 |
| `updatedAt` | 是 | ISO 时间 |

### 事件探针插件

`plugins/mimo-traffic-light.js` 是一个事件探针插件，功能：
1. 记录所有 MiMo Code 事件到 `%LOCALAPPDATA%\MiMoLight\events.log`
2. 根据保守规则将事件映射为状态
3. 写入 `status.json` 供桌面程序读取

**事件映射规则（已通过真实 MiMo Code 事件验证）：**

| 事件 | 状态 |
|------|------|
| `plugin.initialized` | Idle |
| `session.created` | Idle |
| `session.status` → `busy` | Working |
| `session.status` → `idle` | Done |
| `message.updated` / `message.part.updated` | Thinking |
| `message.part.delta` | Thinking |
| `tool.execute.before` | Working |
| `tool.execute.after` | Thinking |
| `permission.asked` | Permission |
| `permission.replied` | Thinking |
| `session.idle` | Done |
| `session.error` / `error` | Error |
| 未知事件 | Thinking（记录到 events.log） |

### 查看事件日志

```powershell
Get-Content "$env:LOCALAPPDATA\MiMoLight\events.log" -Tail 100
```

### 查看状态文件

```powershell
Get-Content "$env:LOCALAPPDATA\MiMoLight\status.json" -Raw
```

## 项目结构

```
MiMoTrafficLight/
├── src/MiMoTrafficLight/       源代码（.NET 8 WinForms）
│   ├── Program.cs
│   ├── TrafficLightForm.cs
│   ├── TrafficLightState.cs
│   ├── StatusPayload.cs
│   └── MiMoTrafficLight.csproj
├── scripts/
│   ├── install.ps1             安装脚本（编译 + 部署）
│   ├── start-mimo.cmd          启动器（启动 MiMo + 红绿灯）
│   ├── manual-test.ps1         手动测试脚本
│   └── signal.ps1              旧版信号桥
├── plugins/
│   └── mimo-traffic-light.js   MiMo Code 事件探针插件
├── docs/
│   └── PRD.md                  产品需求文档
├── README.md                   中文文档
├── README_en.md                English documentation
└── .gitignore
```

安装后目录：

```
%LOCALAPPDATA%\MiMoLight\
├── app\
│   └── MiMoTrafficLight.exe
├── scripts\
│   ├── start-mimo.cmd
│   ├── manual-test.ps1
│   └── signal.ps1
├── plugins\
│   └── mimo-traffic-light.js
├── status.json
└── events.log
```

## 常见问题

### PowerShell 提示"不允许运行脚本"

使用绕过参数：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

或修改当前用户执行策略：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 提示"No .NET SDKs were found"或无法编译

需要 **.NET 8 SDK**（不是 Runtime）：

1. 下载 [.NET 8 SDK x64](https://dotnet.microsoft.com/download/dotnet/8.0)
2. 安装后重新打开 PowerShell
3. 验证：`dotnet --list-sdks` 应显示 `8.0.xxx`
4. 重新运行安装脚本

### 红绿灯窗口不显示

1. 检查 exe 是否存在：`Test-Path "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"`
2. 手动启动：`& "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"`
3. 如提示缺少运行时，安装 [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)

### 插件未加载 / events.log 没有生成

1. 检查插件是否已安装：`Test-Path "$env:LOCALAPPDATA\MiMoLight\plugins\mimo-traffic-light.js"`
2. 检查 MiMo Code 配置是否包含插件路径
3. 查看事件日志：`Get-Content "$env:LOCALAPPDATA\MiMoLight\events.log" -Tail 50`

### MiMo 命令找不到

启动脚本会自动检测 `mimo`、`mimocode`、`mimo-code`。如果都找不到：

- 确认 MiMo Code 已安装且在 PATH 中
- 检查：`where mimo` / `where mimocode` / `where mimo-code`

### 红绿灯窗口不显示

- 窗口是工具窗口（不在任务栏显示）—— 看屏幕右下角
- 右键托盘图标可定位或退出
- 点击窗口或托盘图标可将 MiMo 终端带到前台

### 红灯 30 分钟后自动熄灭

正常行为。如果状态超过 30 分钟无更新，灯会自动熄灭（Off 状态）。

## 与 ClaudeTrafficLight 的区别

| 方面 | ClaudeTrafficLight | MiMoTrafficLight |
|------|-------------------|-----------------|
| 状态来源 | Claude Code Hooks | MiMo Code / OpenCode 插件事件 |
| 配置文件 | `%USERPROFILE%\.claude\settings.json` | MiMo / OpenCode 插件配置 |
| 状态目录 | `%LOCALAPPDATA%\ClaudeLight` | `%LOCALAPPDATA%\MiMoLight` |
| 启动脚本 | `start-claude.cmd` | `start-mimo.cmd` |
| 桌面程序 | `ClaudeTrafficLight.exe` | `MiMoTrafficLight.exe` |

## 说明

本项目从 ClaudeTrafficLight 改造而来，**不再依赖 Claude Code Hooks**。所有状态通过 MiMo Code / OpenCode 插件事件驱动。

## 许可证

本项目改编自 chengxiao88 的 ClaudeTrafficLight。
