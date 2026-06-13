param(
    [Parameter(Mandatory = $false)]
    [string]$State = "idle"
)

# MiMo Traffic Light signal bridge (legacy, kept for manual testing compatibility).
$ErrorActionPreference = "SilentlyContinue"

function Normalize-State([string]$s) {
    if ($null -eq $s) { $s = "" }
    switch ($s.ToLowerInvariant()) {
        "idle" { return "idle" }
        "done" { return "done" }
        "thinking" { return "thinking" }
        "working" { return "working" }
        "permission" { return "permission" }
        "error" { return "error" }
        "off" { return "off" }
        default { return "idle" }
    }
}

try {
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

    $normalizedState = Normalize-State $State
    $sessionId = "manual"

    $payload = [ordered]@{
        state     = $normalizedState
        source    = "manual"
        event     = "manual.signal"
        sessionId = $sessionId
        projectDir = ""
        updatedAt = (Get-Date).ToString("o")
    }

    $json = $payload | ConvertTo-Json -Compress
    $tmp = "$statusFile.tmp"
    Set-Content -Path $tmp -Value $json -Encoding UTF8
    Move-Item -Path $tmp -Destination $statusFile -Force
}
catch {
    # Stay silent; signal failures should not interrupt workflow.
}

exit 0
