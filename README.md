# MiMoTrafficLight — MiMo Code Status Indicator

> A Windows desktop tool that displays a **red/yellow/green traffic light** at the bottom-right corner of your screen while MiMo Code (AI coding assistant) is running, so you don't have to watch the terminal.

This project was adapted from [ClaudeTrafficLight](https://github.com/chengxiao88/ClaudeTrafficLight). It no longer uses Claude Code Hooks — status is sourced from MiMo Code / OpenCode plugin events.

## What It Does

| Light | Meaning |
|-------|---------|
| 🟢 **Green (steady)** | MiMo is idle, waiting for input |
| 🟢 **Green (flashing)** | Task completed, flash 10 times then steady |
| 🟡 **Yellow (slow blink)** | MiMo is thinking |
| 🟡 **Yellow (steady)** | MiMo is executing a tool |
| 🔴 **Red (flashing)** | MiMo needs your authorization |
| 🔴 **Red (steady)** | An error occurred |
| ⚫ **All off** | MiMo not running or status expired (30 min) |

The light appears both as a **desktop mini-window** and a **system tray icon**.

## Prerequisites

- **MiMo Code** installed and working
- **.NET 8 SDK** (x64) for building the desktop app — [download](https://dotnet.microsoft.com/download/dotnet/8.0)

## Quick Start

### 1. Install

Open PowerShell in the project directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

The install script will:
- Compile `MiMoTrafficLight.exe` and deploy to `%LOCALAPPDATA%\MiMoLight\app\`
- Copy scripts to `%LOCALAPPDATA%\MiMoLight\scripts\`
- Copy plugin to `%LOCALAPPDATA%\MiMoLight\plugins\`
- Try to install plugin to MiMo Code plugin directory (`~/.config/mimocode/plugins/`)

### 2. Start

```powershell
& "$env:LOCALAPPDATA\MiMoLight\scripts\start-mimo.cmd"
```

Or with a specific project directory:

```powershell
& "$env:LOCALAPPDATA\MiMoLight\scripts\start-mimo.cmd" "D:\Projects\MyProject"
```

The script will:
1. Launch `MiMoTrafficLight.exe` (the desktop traffic light)
2. `cd` to the specified project directory (if provided)
3. Launch MiMo Code (`mimo`, `mimocode`, or `mimo-code` — auto-detected)

### 3. Manual Test

Test the traffic light without MiMo Code:

```powershell
# Red light (permission)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 permission

# Yellow light (working)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 working

# Green light (done)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 done

# Yellow slow blink (thinking)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 thinking

# All off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manual-test.ps1 off
```

## Architecture

```
MiMo Code / OpenCode plugin events
        ↓
plugins/mimo-traffic-light.js
        ↓
Writes %LOCALAPPDATA%\MiMoLight\status.json
        ↓
MiMoTrafficLight.exe monitors status.json
        ↓
Windows desktop red/yellow/green light + tray icon
```

### Status File

Path: `%LOCALAPPDATA%\MiMoLight\status.json`

```json
{
  "state": "Thinking",
  "source": "mimocode",
  "event": "message.updated",
  "sessionId": "optional",
  "projectDir": "optional",
  "updatedAt": "2026-06-13T21:30:00.000Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `state` | Yes | Standard state enum |
| `source` | Yes | Always `mimocode` |
| `event` | No | Original event name |
| `sessionId` | No | Session ID |
| `projectDir` | No | Current project directory |
| `updatedAt` | Yes | ISO timestamp |

### Event Probe Plugin

`plugins/mimo-traffic-light.js` is an event probe that:
1. Logs all MiMo Code events to `%LOCALAPPDATA%\MiMoLight\events.log`
2. Maps events to states using conservative rules
3. Writes `status.json` for the desktop app to read

**Event mapping (verified with real MiMo Code events):**

| Event | State |
|-------|-------|
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
| Unknown events | Thinking (logged to events.log) |

### View Events Log

```powershell
Get-Content "$env:LOCALAPPDATA\MiMoLight\events.log" -Tail 100
```

### View Status File

```powershell
Get-Content "$env:LOCALAPPDATA\MiMoLight\status.json" -Raw
```

## Project Structure

```
MiMoTrafficLight/
├── src/MiMoTrafficLight/       Source code (.NET 8 WinForms)
│   ├── Program.cs
│   ├── TrafficLightForm.cs
│   ├── TrafficLightState.cs
│   ├── StatusPayload.cs
│   └── MiMoTrafficLight.csproj
├── scripts/
│   ├── install.ps1             Install script (compile + deploy)
│   ├── start-mimo.cmd          Launcher (start MiMo + traffic light)
│   ├── manual-test.ps1         Manual test script
│   └── signal.ps1              Legacy signal bridge
├── plugins/
│   └── mimo-traffic-light.js   MiMo Code event probe plugin
├── docs/
│   └── PRD.md                  Product requirements document
├── README.md                   English documentation
├── README_zh.md                Chinese documentation
└── .gitignore
```

After installation:

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

## FAQ

### PowerShell says "execution of scripts is disabled on this system"

Use the bypass parameter:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Or change policy for current user:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "No .NET SDKs were found" or cannot build exe

You need **.NET 8 SDK** (not Runtime):

1. Download [.NET 8 SDK x64](https://dotnet.microsoft.com/download/dotnet/8.0)
2. Install and reopen PowerShell
3. Verify: `dotnet --list-sdks` should show `8.0.xxx`
4. Rerun install script

### Traffic light doesn't appear

1. Check exe exists: `Test-Path "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"`
2. Manually start: `& "$env:LOCALAPPDATA\MiMoLight\app\MiMoTrafficLight.exe"`
3. Install [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) if prompted

### Plugin not loading / events.log not generated

1. Check plugin is installed: `Test-Path "$env:LOCALAPPDATA\MiMoLight\plugins\mimo-traffic-light.js"`
2. Check MiMo Code config includes the plugin path
3. View events log: `Get-Content "$env:LOCALAPPDATA\MiMoLight\events.log" -Tail 50`

### MiMo command not found

The launcher auto-detects `mimo`, `mimocode`, `mimo-code`. If none found:
- Ensure MiMo Code is installed and in your PATH
- Check: `where mimo` / `where mimocode` / `where mimo-code`

### Traffic light window not showing

- The window is a tool window (no taskbar entry) — look at bottom-right corner
- Right-click tray icon to locate or exit
- Click the window or tray icon to bring MiMo terminal to front

### Red light turns off after 30 minutes

Normal behavior. If no status update for 30 minutes, the light turns off (Off state).

## Differences from ClaudeTrafficLight

| Aspect | ClaudeTrafficLight | MiMoTrafficLight |
|--------|-------------------|-----------------|
| Status source | Claude Code Hooks | MiMo Code / OpenCode plugin events |
| Config file | `%USERPROFILE%\.claude\settings.json` | MiMo / OpenCode plugin config |
| Status dir | `%LOCALAPPDATA%\ClaudeLight` | `%LOCALAPPDATA%\MiMoLight` |
| Launcher | `start-claude.cmd` | `start-mimo.cmd` |
| Desktop app | `ClaudeTrafficLight.exe` | `MiMoTrafficLight.exe` |

## License

This project is adapted from ClaudeTrafficLight by chengxiao88.
