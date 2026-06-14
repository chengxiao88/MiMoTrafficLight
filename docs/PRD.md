# MiMoTrafficLight 产品需求文档（PRD）

> **来源项目**：ClaudeTrafficLight（已改造）  
> **当前项目位置**：`C:\Users\ChengXiao\MiMoTrafficLight`  
> **最后更新**：2026-06-14

---

## 1. 产品概述

### 1.1 产品名称

MiMoTrafficLight

### 1.2 一句话描述

MiMoTrafficLight 是一个 Windows 本地桌面红绿灯工具，用于显示 MiMo Code 当前是否空闲、思考中、执行工具中、等待用户授权或发生错误。MiMo 状态条采用灰色背景和灰色边框，用于和 ClaudeTrafficLight 的深色状态条区分。

### 1.3 目标用户

- 使用 MiMo Code 的开发者
- 长时间让 MiMo Code 执行任务的用户
- 不希望一直盯着终端等待授权确认的用户

### 1.4 来源

本项目从 [ClaudeTrafficLight](https://github.com/chengxiao88/ClaudeTrafficLight) 改造而来，**不再使用 Claude Code Hooks**，状态来源改为 MiMo Code / OpenCode 插件事件。

---

## 2. 架构

### 2.1 系统架构

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

### 2.2 技术栈

| 技术栈 | 涉及模块 |
|--------|----------|
| 桌面程序 | .NET 8 + WinForms |
| 状态来源 | MiMo Code / OpenCode JS 插件 |
| 构建 | dotnet publish + install.ps1 |

### 2.3 与 ClaudeTrafficLight 的区别

| 方面 | ClaudeTrafficLight | MiMoTrafficLight |
|------|-------------------|-----------------|
| 状态来源 | Claude Code Hooks | MiMo Code / OpenCode 插件事件 |
| 配置文件 | `%USERPROFILE%\.claude\settings.json` | MiMo / OpenCode 插件配置 |
| 状态目录 | `%LOCALAPPDATA%\ClaudeLight` | `%LOCALAPPDATA%\MiMoLight` |
| 启动脚本 | `start-claude.cmd` | `start-mimo.cmd` |
| 桌面程序 | `ClaudeTrafficLight.exe` | `MiMoTrafficLight.exe` |
| 状态条外观 | 深色背景 | 灰色背景、灰色边框 |

---

## 3. 状态模型

### 3.1 标准状态枚举

| 状态 | 枚举值 | 灯效 | 含义 |
|------|--------|------|------|
| 未启动/待命 | `Off` | 三灯全灭 | MiMo 未运行或状态超过 30 分钟无更新；红绿灯进程继续运行 |
| 空闲 | `Idle` | 绿灯常亮 | MiMo 已启动，等待用户输入 |
| 思考中 | `Thinking` | 黄灯慢闪（250ms 切换） | MiMo 正在思考、规划、生成回复 |
| 执行任务 | `Working` | 黄灯常亮 | MiMo 正在调用工具、读写文件、执行命令 |
| 等待授权 | `Permission` | 红灯闪烁 10 次 → 常红 | MiMo 等待用户授权确认 |
| 任务完成 | `Done` | 绿灯闪烁 10 次 → 常绿 | 一轮任务完成，回到可输入状态 |
| 错误 | `Error` | 红黄交替快闪 | 工具失败、会话错误或插件异常 |

### 3.2 状态文件格式

路径：`%LOCALAPPDATA%\MiMoLight\status.json`

```json
{
  "state": "Thinking",
  "source": "mimocode",
  "event": "message.updated",
  "sessionId": "可选会话 ID",
  "projectDir": "可选项目目录",
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

### 3.3 事件映射规则

基于真实 MiMo Code 事件调整：

| 事件 | 状态 |
|------|------|
| `plugin.initialized` | Idle |
| `session.created` | Idle |
| `session.status` → `busy` | Working |
| `session.status` → `idle` | Done |
| `message.updated` / `message.part.updated` / `message.part.delta` | Thinking |
| `tool.execute.before` | Working；当工具为 `question` 时为 Permission |
| `tool.execute.after` | Thinking |
| `permission.asked` / `question.asked` | Permission |
| `permission.replied` / `question.replied` / `question.rejected` | Thinking |
| `session.idle` / `server.instance.disposed` | Done |
| `session.error` / `error` | Error |
| `metrics.*` / `session.updated` / `session.diff` 等被动事件 | 保持当前状态 |
| 未知事件 | 保持当前状态，并记录到 events.log |

状态机补充规则：
- Permission 状态受保护：授权选择界面出现后，普通 `message.*`、`session.updated`、`session.diff` 等事件不得把红灯提前切走。
- 授权完成后，`question.replied` 或 `tool.execute.after` 允许状态回到 Thinking。
- Done 状态受保护：任务完成后的尾部 `message.*` 噪声在短时间内不得把绿灯重新切回黄灯。
- 工具执行结束后如没有明确 Done 事件，插件会在安静窗口后自动写入 Done。

---

## 4. 功能规格

### 4.1 桌面指示灯窗口

- 位置：屏幕右下角（WorkingArea 右下偏移 16px 水平、8px 垂直）
- 尺寸：固定 64x22px（逻辑像素；高 DPI 下由系统缩放）
- 外观：灰色背景（#707070）、浅灰边框（#BEBEBE）、三颗 10px 圆点（间距 8px）
- 熄灭灯点颜色：深灰（#373737）
- 置顶显示（TopMost = true）
- 无标题栏，可拖拽移动
- 通过 `WS_EX_TOOLWINDOW` 隐藏于 Alt+Tab 切换列表
- 双缓冲渲染，动画流畅

### 4.2 系统托盘图标

- 运行时始终显示在系统托盘
- 图标实时反映当前灯色（64x64 三色圆点）
- 鼠标悬停显示状态文字提示
- 双击托盘图标 → 定位 MiMo 终端窗口
- 右键菜单：「定位 MiMo 终端」、分隔线、「退出」

### 4.3 终端定位功能

点击窗口或托盘图标时，遍历系统进程，匹配：
- 窗口标题包含 `MiMo` 或 `mimocode`
- 进程名为 WindowsTerminal/cmd/powershell/pwsh

匹配后调用 `ShowWindow(SW_RESTORE)` + `SetForegroundWindow` 将终端带到前台。

### 4.4 动画系统

所有动画由 250ms 定时器驱动：

| 动画 | 机制 | 持续时间 |
|------|------|----------|
| 完成闪烁（Done） | 20 次 toggle 后切为 Idle 常亮 | ~5 秒 |
| 授权闪烁（Permission） | 20 次 toggle 后保持 Permission 常亮 | ~5 秒 |
| 思考慢闪（Thinking） | 4 tick 亮 / 4 tick 灭循环 | 无限 |
| 错误快闪（Error） | 2 tick 亮 / 2 tick 灭循环，红黄交替 | 无限 |

### 4.5 过期检测

- 每 30 秒检查一次最后更新时间戳
- 超过 30 分钟无状态更新 → 自动切换为 Off
- Off 只表示灯熄灭/状态待命，不退出、不关闭、不杀掉 `MiMoTrafficLight.exe` 进程

### 4.6 单实例保护

- 使用当前 Windows 用户 SID 生成命名互斥锁：`Local\MiMoTrafficLight_{sid}`
- 同一用户第二个实例启动时自动退出

---

## 5. 插件设计

### 5.1 插件文件

```
plugins/mimo-traffic-light.js
```

安装后复制到：
- `%LOCALAPPDATA%\MiMoLight\plugins\mimo-traffic-light.js`
- `%USERPROFILE%\.config\mimocode\plugins\mimo-traffic-light.js`
- `%USERPROFILE%\.config\opencode\plugins\mimo-traffic-light.js`

### 5.2 插件功能

1. MiMo Code 启动时自动加载
2. 记录关键状态决策到 `%LOCALAPPDATA%\MiMoLight\events.log`
3. 根据状态机写入 `status.json`
4. 不确定或被动事件保持当前状态，不乱猜、不把灯误切回黄灯
5. 支持调试模式：设置 `MIMO_TRAFFIC_LIGHT_DEBUG=1` 后记录更多事件结构信息

### 5.3 events.log 格式

每条日志包含时间戳、事件类型、目标状态和判断原因。默认不记录 `message.part.delta` 的正文内容，避免日志过大或泄露对话正文。

```
[2026-06-14T13:56:59.453Z] type=question.asked state=Permission action=written reason=permission-requested
[2026-06-14T13:57:05.033Z] type=question.replied state=Thinking action=written reason=permission-released
[2026-06-14T13:57:08.331Z] type=session.idle state=Done action=written reason=done
```

---

## 6. 脚本设计

### 6.1 脚本清单

```
scripts/install.ps1       安装脚本（编译 + 部署）
scripts/start-mimo.cmd    启动器（启动 MiMo + 红绿灯）
scripts/manual-test.ps1   手动测试脚本
scripts/signal.ps1        旧版信号桥（保留兼容）
```

### 6.2 install.ps1

功能：
1. 检查 .NET 8 SDK
2. 编译 WinForms 程序到 `%LOCALAPPDATA%\MiMoLight\app\`
3. 复制脚本到 `%LOCALAPPDATA%\MiMoLight\scripts\`
4. 复制插件到 `%LOCALAPPDATA%\MiMoLight\plugins\`
5. 尝试安装插件到 MiMo Code 插件目录
6. 尝试安装插件到 OpenCode 插件目录
7. 不写死绝对路径，不修改 `.claude\settings.json`

### 6.3 start-mimo.cmd

功能：
1. 启动 `MiMoTrafficLight.exe`
2. 支持传入项目目录参数
3. 如目录存在则 `cd /d` 到该目录
4. 显示当前项目目录
5. 自动检测 `mimo`、`mimocode`、`mimo-code` 命令并启动

### 6.4 manual-test.ps1

功能：手动写入状态到 `%LOCALAPPDATA%\MiMoLight\status.json`

```powershell
.\scripts\manual-test.ps1 permission   # 红灯
.\scripts\manual-test.ps1 working      # 黄灯
.\scripts\manual-test.ps1 done         # 绿灯
.\scripts\manual-test.ps1 thinking     # 黄灯慢闪
.\scripts\manual-test.ps1 idle         # 绿灯常亮
.\scripts\manual-test.ps1 error        # 红灯常亮
.\scripts\manual-test.ps1 off          # 全灭
```

---

## 7. 安装与配置

### 7.1 前置依赖

- Windows 10/11
- .NET 8 SDK（编译用）
- MiMo Code（运行用）

### 7.2 安装

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

### 7.3 启动

```powershell
& "$env:LOCALAPPDATA\MiMoLight\scripts\start-mimo.cmd"
```

指定项目目录：

```powershell
& "$env:LOCALAPPDATA\MiMoLight\scripts\start-mimo.cmd" "D:\Projects\MyProject"
```

### 7.4 手动测试

```powershell
# 先启动红绿灯
Start-Process "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"

# 测试不同状态
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 permission
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 working
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 done
```

### 7.5 查看状态

```powershell
Get-Content "$env:LOCALAPPDATA\MiMoLight\status.json" -Raw
Get-Content "$env:LOCALAPPDATA\MiMoLight\events.log" -Tail 100
```

---

## 8. 约束与限制

- **Windows Only**：依赖 WinForms、Win32 API
- **不联网**：纯本地运行，不上传任何数据
- **只读不写**：不修改 MiMo Code 的任何配置或对话内容
- **不自动授权**：仅显示等待授权状态
- **单用户**：每个 Windows 用户独立实例
- **不使用 Claude Code Hooks**：MiMoTrafficLight 通过插件事件驱动
- **空闲不退出**：长时间无 MiMo 状态更新时只熄灯，不结束红绿灯进程

---

## 9. 项目结构

```
MiMoTrafficLight/
├── src/MiMoTrafficLight/       源代码（.NET 8 WinForms）
│   ├── Program.cs
│   ├── TrafficLightForm.cs
│   ├── TrafficLightState.cs
│   ├── StatusPayload.cs
│   └── MiMoTrafficLight.csproj
├── scripts/
│   ├── install.ps1
│   ├── start-mimo.cmd
│   ├── manual-test.ps1
│   └── signal.ps1
├── plugins/
│   └── mimo-traffic-light.js
├── docs/
│   └── PRD.md
├── README.md
└── README_en.md
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

---

## 10. 常见问题

### PowerShell 执行策略拦截

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

### 缺少 .NET 8 SDK

编译需要 SDK（不是 Runtime）。下载 [.NET 8 SDK x64](https://dotnet.microsoft.com/download/dotnet/8.0) 安装后重新运行安装脚本。

### 红绿灯窗口不显示

1. 检查 exe 存在：`Test-Path "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"`
2. 手动启动：`& "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"`
3. 安装 [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) 如提示缺运行时

### 插件未加载

1. 检查插件安装：`Test-Path "$env:LOCALAPPDATA\MiMoLight\plugins\mimo-traffic-light.js"`
2. 检查 MiMo Code 配置包含插件路径
3. 查看 events.log：`Get-Content "$env:LOCALAPPDATA\MiMoLight\events.log" -Tail 50`

### MiMo 命令找不到

确认 MiMo Code 已安装且在 PATH 中。检查：`where mimo` / `where mimocode` / `where mimo-code`

### 红绿灯 30 分钟后自动熄灭

正常行为。状态超过 30 分钟无更新自动进入 Off 状态，但只熄灭灯，不退出或杀掉 `MiMoTrafficLight.exe`。后续收到新状态后会继续亮灯。
