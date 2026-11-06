$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama isn't installed. Get it from https://ollama.com/download/windows, then run this again." -ForegroundColor Red
    exit 1
}

Write-Host "Applying PC-friendly Ollama settings..." -ForegroundColor Cyan
$settings = @{
    "OLLAMA_KEEP_ALIVE"        = "2m"
    "OLLAMA_MAX_LOADED_MODELS" = "1"
    "OLLAMA_NUM_PARALLEL"      = "1"
    "OLLAMA_CONTEXT_LENGTH"    = "16384"
}
foreach ($k in $settings.Keys) {
    [Environment]::SetEnvironmentVariable($k, $settings[$k], "User")
    Set-Item -Path "Env:$k" -Value $settings[$k]
    Write-Host "  $k = $($settings[$k])"
}

Write-Host "Restarting Ollama so the settings take effect..." -ForegroundColor Cyan
Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$app = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
if (Test-Path $app) { Start-Process $app } else { Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden }
Start-Sleep -Seconds 5

Write-Host "Downloading models (this takes a while the first time)..." -ForegroundColor Cyan
ollama pull qwen3.5:9b
ollama pull gemma4:12b

Write-Host ""
Write-Host "Done. Check the GPU is used: run 'ollama run qwen3.5:9b', say hi, then 'ollama ps'." -ForegroundColor Green
Write-Host "The PROCESSOR column should say 100% GPU."
