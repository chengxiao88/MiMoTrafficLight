param(
    [string]$Title = "MiMo Traffic Light - 选择状态"
)

$ErrorActionPreference = "Stop"

$options = @(
    @{ Name = "idle";     Description = "空闲状态" },
    @{ Name = "done";     Description = "完成状态" },
    @{ Name = "thinking"; Description = "思考中" },
    @{ Name = "working";  Description = "工作中" },
    @{ Name = "permission"; Description = "等待权限" },
    @{ Name = "error";    Description = "错误状态" },
    @{ Name = "off";      Description = "关闭" }
)

$selectedIndex = 0

function Show-Menu {
    Clear-Host
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "=" * 40
    Write-Host ""
    
    for ($i = 0; $i -lt $options.Count; $i++) {
        if ($i -eq $selectedIndex) {
            Write-Host "  > $($options[$i].Name) - $($options[$i].Description)" -ForegroundColor Green
        } else {
            Write-Host "    $($options[$i].Name) - $($options[$i].Description)"
        }
    }
    
    Write-Host ""
    Write-Host "使用上下键选择，回车确认，ESC退出" -ForegroundColor Yellow
}

do {
    Show-Menu
    
    $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    switch ($key.VirtualKeyCode) {
        38 { # Up arrow
            $selectedIndex--
            if ($selectedIndex -lt 0) { $selectedIndex = $options.Count - 1 }
        }
        40 { # Down arrow
            $selectedIndex++
            if ($selectedIndex -ge $options.Count) { $selectedIndex = 0 }
        }
        13 { # Enter
            $selected = $options[$selectedIndex]
            Write-Host "`n选择: $($selected.Name)" -ForegroundColor Cyan
            
            $scriptDir = Split-Path -Parent $MyInvocation.ScriptName
            $signalScript = Join-Path $scriptDir "signal.ps1"
            
            if (Test-Path $signalScript) {
                & $signalScript -State $selected.Name
                Write-Host "状态已设置为: $($selected.Name)" -ForegroundColor Green
            } else {
                Write-Host "未找到 signal.ps1 脚本" -ForegroundColor Red
            }
            
            Start-Sleep -Seconds 1
            break
        }
        27 { # ESC
            Write-Host "`n退出" -ForegroundColor Yellow
            break
        }
    }
} while ($key.VirtualKeyCode -ne 27 -and $key.VirtualKeyCode -ne 13)