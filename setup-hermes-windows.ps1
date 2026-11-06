$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$wslOk = $false
try { wsl --status *> $null; if ($LASTEXITCODE -eq 0) { $wslOk = $true } } catch {}
if (-not $wslOk) {
    Write-Host "WSL2 isn't installed yet." -ForegroundColor Red
    Write-Host "Open PowerShell as Administrator, run:  wsl --install"
    Write-Host "Restart the PC, finish the Ubuntu setup (pick a username/password), then run this script again."
    exit 1
}
Write-Host "WSL found." -ForegroundColor Green

$cfg = Join-Path $env:USERPROFILE ".wslconfig"
$text = if (Test-Path $cfg) { Get-Content $cfg -Raw } else { "" }
if ($text -match "(?im)^\s*networkingMode\s*=\s*mirrored") {
    Write-Host "Mirrored networking already on."
} else {
    if (Test-Path $cfg) { Copy-Item $cfg "$cfg.bak" -Force; Write-Host "Backed up existing .wslconfig to .wslconfig.bak" }
    if ($text -match "(?im)^\s*networkingMode\s*=") {
        $text = $text -replace "(?im)^\s*networkingMode\s*=.*$", "networkingMode=mirrored"
    } elseif ($text -match "(?im)^\s*\[wsl2\]") {
        $text = $text -replace "(?im)^(\s*\[wsl2\]\s*)$", "`$1`r`nnetworkingMode=mirrored"
    } else {
        $text = $text.TrimEnd() + "`r`n[wsl2]`r`nnetworkingMode=mirrored`r`n"
    }
    Set-Content -Path $cfg -Value $text.TrimStart() -Encoding ascii
    Write-Host "Mirrored networking turned on in $cfg" -ForegroundColor Green
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama not found on PATH. Install/start Ollama, then run this again." -ForegroundColor Red
    exit 1
}
$base = ollama list | Select-String -SimpleMatch "qwen3.6:35b-a3b"
if (-not $base) { Write-Host "Pulling qwen3.6:35b-a3b first..."; ollama pull qwen3.6:35b-a3b }
ollama create qwen3.6-agent -f (Join-Path $here "hermes\Modelfile.agent")
Write-Host "Created model qwen3.6-agent (64K context, for Hermes only)." -ForegroundColor Green

wsl --shutdown
Write-Host ""
Write-Host "Windows part done." -ForegroundColor Green
Write-Host "Next: open Ubuntu (WSL) and run:"
$wslPath = "/mnt/" + $here.Substring(0,1).ToLower() + ($here.Substring(2) -replace "\\", "/")
Write-Host "  bash '$wslPath/setup-hermes-wsl.sh'" -ForegroundColor Cyan
