param(
    [string]$InstallRoot = "$env:LOCALAPPDATA\MiMoLight"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $root
$project = Join-Path $repoRoot "src\MiMoTrafficLight\MiMoTrafficLight.csproj"
$appDir = Join-Path $InstallRoot "app"
$scriptsDir = Join-Path $InstallRoot "scripts"
$pluginsDir = Join-Path $InstallRoot "plugins"

New-Item -ItemType Directory -Force -Path $appDir, $scriptsDir, $pluginsDir | Out-Null

$builtApp = $false

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Warning "dotnet was not found. Scripts will be installed, but MiMoTrafficLight.exe cannot be built. Install .NET 8 SDK and rerun this script."
}
else {
    $sdks = & dotnet --list-sdks 2>$null
    if ([string]::IsNullOrWhiteSpace(($sdks | Out-String).Trim())) {
        Write-Warning "No .NET SDKs were found. Scripts will be installed, but MiMoTrafficLight.exe cannot be built. Install .NET 8 SDK and rerun this script."
    }
    else {
        & dotnet publish $project -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=false -o $appDir
        if ($LASTEXITCODE -ne 0) {
            throw "dotnet publish failed with exit code $LASTEXITCODE."
        }
        $builtApp = Test-Path (Join-Path $appDir "MiMoTrafficLight.exe")
    }
}

Copy-Item (Join-Path $repoRoot "scripts\manual-test.ps1") (Join-Path $scriptsDir "manual-test.ps1") -Force
Copy-Item (Join-Path $repoRoot "scripts\signal.ps1") (Join-Path $scriptsDir "signal.ps1") -Force
Copy-Item (Join-Path $repoRoot "scripts\start-mimo.cmd") (Join-Path $scriptsDir "start-mimo.cmd") -Force

$pluginSrc = Join-Path $repoRoot "plugins\mimo-traffic-light.js"
$pluginDstLocal = Join-Path $pluginsDir "mimo-traffic-light.js"
Copy-Item $pluginSrc $pluginDstLocal -Force
Write-Host "Plugin copied to: $pluginDstLocal"

$pluginInstalled = $false

$mimocodePluginDir = Join-Path $env:USERPROFILE ".config\mimocode\plugins"
New-Item -ItemType Directory -Force -Path $mimocodePluginDir | Out-Null
$mimocodePluginDst = Join-Path $mimocodePluginDir "mimo-traffic-light.js"
Copy-Item $pluginSrc $mimocodePluginDst -Force
Write-Host "Plugin installed to MiMo Code plugin dir: $mimocodePluginDst"
$pluginInstalled = $true

$opencodePluginDir = Join-Path $env:USERPROFILE ".config\opencode\plugins"
New-Item -ItemType Directory -Force -Path $opencodePluginDir | Out-Null
$opencodePluginDst = Join-Path $opencodePluginDir "mimo-traffic-light.js"
Copy-Item $pluginSrc $opencodePluginDst -Force
Write-Host "Plugin installed to OpenCode plugin dir: $opencodePluginDst"
$pluginInstalled = $true

if (-not $pluginInstalled) {
    Write-Host ""
    Write-Host "[MiMoTrafficLight] No MiMo/OpenCode plugin directory found."
    Write-Host "[MiMoTrafficLight] To enable the plugin, add it to your MiMo Code config:"
    Write-Host '  {'
    Write-Host '    "plugin": ['
    Write-Host '      "~/.config/mimocode/plugins/mimo-traffic-light.js"'
    Write-Host '    ]'
    Write-Host '  }'
    Write-Host ""
    Write-Host "Or copy the plugin manually:"
    Write-Host "  $pluginSrc"
    Write-Host "  -> $env:USERPROFILE\.config\mimocode\plugins\mimo-traffic-light.js"
}

Write-Host ""
Write-Host "Install complete: $InstallRoot"
Write-Host "Suggested launch: $scriptsDir\start-mimo.cmd"

if (-not $builtApp) {
    Write-Warning "MiMoTrafficLight.exe was not built because .NET 8 SDK is missing or unavailable. The desktop light window will not appear until the app is built."
}
