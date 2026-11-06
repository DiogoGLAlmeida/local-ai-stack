param([switch]$Full, [switch]$Off)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Firecrawl($action) {
    wsl -d Ubuntu -- bash -c "[ -d ~/firecrawl ] && cd ~/firecrawl && docker compose $action >/dev/null 2>&1 && echo 'Firecrawl: $action'" 2>$null
}

if ($Off) {
    docker compose -f (Join-Path $here "docker-compose.yml") start
    Invoke-Firecrawl "start"
    Write-Host "AI services are back on. Open http://localhost:3000" -ForegroundColor Green
    exit 0
}

$loaded = ollama ps | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] } | Where-Object { $_ }
if ($loaded) {
    foreach ($m in $loaded) { ollama stop $m; Write-Host "Unloaded $m" }
} else {
    Write-Host "No models loaded. VRAM is already free."
}

if ($Full) {
    docker compose -f (Join-Path $here "docker-compose.yml") stop
    Invoke-Firecrawl "stop"
    Write-Host "Docker containers stopped." -ForegroundColor Yellow
}

Write-Host "Game mode on. Have fun." -ForegroundColor Green
