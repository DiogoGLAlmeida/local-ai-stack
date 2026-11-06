#!/usr/bin/env bash
set -euo pipefail

OLLAMA_URL="http://localhost:11434"
MODEL="qwen3.6-agent"

echo "==> Checking connection to Ollama on Windows..."
if ! curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "Can't reach Ollama at $OLLAMA_URL."
  echo " - Make sure Ollama is running on Windows (tray icon)."
  echo " - Make sure you ran setup-hermes-windows.ps1 (it turns on mirrored networking)."
  echo " - Then close this window, run 'wsl --shutdown' in PowerShell, reopen Ubuntu and try again."
  exit 1
fi
echo "    Ollama reachable."

if ! curl -fsS "$OLLAMA_URL/api/tags" | grep -q "\"$MODEL"; then
  echo "Model '$MODEL' not found. Run setup-hermes-windows.ps1 on Windows first."
  exit 1
fi
echo "    Found model $MODEL."

echo "==> Installing basic tools (may ask for your Ubuntu password)..."
sudo apt-get update -qq
sudo apt-get install -y -qq curl git ca-certificates >/dev/null

if command -v hermes >/dev/null 2>&1; then
  echo "==> Hermes already installed: $(hermes --version 2>/dev/null || echo ok)"
else
  echo "==> Installing Hermes Agent..."
  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" || true
fi

mkdir -p "$HOME/hermes-work"

cat <<EOF

==================================================================
 Hermes is installed. Now run the setup wizard:

     cd ~/hermes-work
     hermes setup

 When it asks, choose:
   Provider ........ Ollama, or "Custom / OpenAI-compatible"
                     (under "More providers..." if not listed)
   Base URL ........ $OLLAMA_URL/v1
   API key ......... leave empty (or type: ollama)
   Model ........... $MODEL

 Then start it with:   cd ~/hermes-work && hermes

 Tips
   - Always start Hermes from ~/hermes-work (a safe folder).
   - Your Windows drives are at /mnt/c, /mnt/d ... only point Hermes
     at specific folders you want it to work on.
   - Read its plan before approving commands that delete or move files.
==================================================================
EOF
