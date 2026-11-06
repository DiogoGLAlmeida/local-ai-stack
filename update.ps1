param([switch]$SkipDocker, [switch]$SkipModels, [switch]$SkipHermes, [switch]$SkipGateway)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
New-Item -ItemType Directory -Force -Path (Join-Path $here "logs") | Out-Null
$log = Join-Path $here ("logs\update-" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".log")
Start-Transcript -Path $log | Out-Null

$CustomModels = @(
    @{ Name = "qwen3.6-agent"; Base = "qwen3.6:35b-a3b"; Ctx = 65536 },
    @{ Name = "qwen3.8-cline"; Base = "qwen3.8:27b";     Ctx = 32768 }
)

function Section($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
$problems = @()

if (-not $SkipDocker) {
    Section "Docker apps"
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker Desktop isn't running - skipping Docker updates." -ForegroundColor Yellow
        $problems += "Docker not running"
    } else {
        docker compose pull
        if ($LASTEXITCODE -ne 0) { $problems += "docker compose pull failed" }
        docker compose up -d --remove-orphans
        if ($LASTEXITCODE -ne 0) { $problems += "docker compose up failed" }
        Write-Host "Removing unused old images..."
        docker image prune -f | Out-Null
    }
}

if (-not $SkipModels) {
    Section "Ollama models"
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Host "Ollama not found - skipping models." -ForegroundColor Yellow
        $problems += "Ollama not found"
    } else {
        Write-Host ("Ollama version: " + (ollama --version 2>&1)) -ForegroundColor DarkGray
        $customNames = $CustomModels | ForEach-Object { $_.Name; "$($_.Name):latest" }
        $installed = ollama list | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] } | Where-Object { $_ }

        foreach ($c in $CustomModels) {
            if ($installed -contains "$($c.Name):latest" -or $installed -contains $c.Name) {
                $params = ollama show $c.Name --parameters 2>$null
                $m = $params | Select-String -Pattern 'num_ctx\s+(\d+)'
                if ($m) { $c.Ctx = [int]$m.Matches[0].Groups[1].Value }
                $c.Present = $true
            }
        }

        foreach ($m in $installed) {
            if ($customNames -contains $m) { continue }
            Write-Host "Updating $m ..."
            ollama pull $m
            if ($LASTEXITCODE -ne 0) { $problems += "ollama pull $m failed" }
        }

        foreach ($c in $CustomModels) {
            if (-not $c.Present) { continue }
            if (-not ($installed -contains $c.Base)) {
                Write-Host "Base $($c.Base) for $($c.Name) not installed - pulling it." -ForegroundColor Yellow
                ollama pull $c.Base
            }
            $mf = Join-Path $env:TEMP "Modelfile.$($c.Name)"
            "FROM $($c.Base)`nPARAMETER num_ctx $($c.Ctx)" | Out-File -Encoding ascii $mf
            Write-Host "Rebuilding $($c.Name) from $($c.Base) (context $($c.Ctx))..."
            ollama create $c.Name -f $mf
            if ($LASTEXITCODE -ne 0) { $problems += "ollama create $($c.Name) failed" }
            Remove-Item $mf -ErrorAction SilentlyContinue
        }
    }
}

if (-not $SkipHermes) {
    Section "Hermes Agent (WSL)"
    wsl.exe -d Ubuntu -- bash -lic "command -v hermes >/dev/null && hermes update || echo 'Hermes not found in Ubuntu - skipped.'"
    if ($LASTEXITCODE -ne 0) { $problems += "hermes update failed" }
}

if (-not $SkipGateway) {
    Section "MCP Toolkit gateway"
    $gw = Join-Path $here "start-mcp-gateways.ps1"
    if (Test-Path $gw) {
        & $gw -Stop
        Start-Sleep -Seconds 2
        & $gw -Quiet
    }
}

Section "Done"
if ($problems.Count -eq 0) {
    Write-Host "Everything updated." -ForegroundColor Green
} else {
    Write-Host "Finished with problems:" -ForegroundColor Yellow
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
Write-Host "Reminders:"
Write-Host "  - Ollama and Docker Desktop update through their own apps (check their tray icons)."
Write-Host "  - Cline updates itself in VS Code. Page Assist updates through the browser."
Write-Host "  - Log saved to $log"
Stop-Transcript | Out-Null
