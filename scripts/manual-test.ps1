param(
    [ValidateSet("idle","done","thinking","working","permission","error","off")]
    [string]$State = "done"
)

$ErrorActionPreference = "Stop"

$baseDir = Join-Path $env:LOCALAPPDATA "MiMoLight"
$statusFile = Join-Path $baseDir "status.json"
New-Item -ItemType Directory -Force -Path $baseDir | Out-Null

$appExe = Join-Path $baseDir "app\MiMoTrafficLight.exe"
if (Test-Path $appExe) {
    $running = Get-Process -Name "MiMoTrafficLight" -ErrorAction SilentlyContinue
    if (-not $running) {
        Start-Process -FilePath $appExe | Out-Null
    }
}

$payload = [ordered]@{
    state     = $State
    source    = "manual-test"
    event     = "manual.test"
    sessionId = "manual"
    projectDir = ""
    updatedAt = (Get-Date).ToString("o")
}

$json = $payload | ConvertTo-Json -Compress
$tmp = "$statusFile.tmp"
Set-Content -Path $tmp -Value $json -Encoding UTF8
Move-Item -Path $tmp -Destination $statusFile -Force

Write-Host "MiMoTrafficLight manual test: state=$State written to $statusFile"
