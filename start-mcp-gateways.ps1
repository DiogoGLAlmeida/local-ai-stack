param([switch]$Install, [switch]$Uninstall, [switch]$Stop, [switch]$Quiet)

$Gateways = @(
    @{ Profile = "dev";      Port = 8812 }
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logs = Join-Path $here "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$taskName = "Local AI - MCP gateways"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Automatic start removed." -ForegroundColor Yellow
    exit 0
}

if ($Stop) {
    foreach ($g in $Gateways) {
        $c = Get-NetTCPConnection -LocalPort $g.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "Stopped $($g.Profile) (port $($g.Port))" }
    }
    exit 0
}

if ($Install) {
    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
               -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $trigger.Delay = "PT1M"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Host "Gateways will start automatically at login (task: '$taskName')." -ForegroundColor Green
}

for ($i = 0; $i -lt 36; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 5
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { "Docker not running; gateways not started." | Out-File (Join-Path $logs "gateway-start.log") -Append; exit 1 }

docker mcp feature enable profiles *> $null

$tokenFile = Join-Path $here ".mcp-gateway-token"
if (-not (Test-Path $tokenFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    (($bytes | ForEach-Object { $_.ToString("x2") }) -join "") | Set-Content -Path $tokenFile -NoNewline -Encoding ascii
}
$env:MCP_GATEWAY_AUTH_TOKEN = (Get-Content $tokenFile -Raw).Trim()

foreach ($g in $Gateways) {
    $inUse = Get-NetTCPConnection -LocalPort $g.Port -State Listen -ErrorAction SilentlyContinue
    if ($inUse) { Write-Host "$($g.Profile): already running on port $($g.Port)"; continue }
    $out = Join-Path $logs "gateway-$($g.Profile).log"
    $err = Join-Path $logs "gateway-$($g.Profile).err.log"
    Start-Process -FilePath "docker" -WindowStyle Hidden `
        -ArgumentList @("mcp","gateway","run","--profile",$g.Profile,"--transport","streaming","--port","$($g.Port)") `
        -RedirectStandardOutput $out -RedirectStandardError $err
    Write-Host "$($g.Profile): starting on http://localhost:$($g.Port)/mcp  (log: logs\gateway-$($g.Profile).err.log)" -ForegroundColor Green
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "Bearer token for Hermes / Cline / Open WebUI (same for all gateways):" -ForegroundColor Cyan
    Write-Host "  $env:MCP_GATEWAY_AUTH_TOKEN"
    Write-Host "Saved in .mcp-gateway-token. Check the logs show this same token once started (~1 min)."
}
