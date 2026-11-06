#!/usr/bin/env bash
set -euo pipefail

FC_DIR="$HOME/firecrawl"
FC_TAG="v2.11.162"
FC_URL="http://localhost:3002"
HERMES_DIR="$HOME/.hermes"

echo "==> Checking Docker is available in WSL..."
if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't reachable from Ubuntu."
  echo "Open Docker Desktop > Settings > Resources > WSL integration,"
  echo "turn on 'Ubuntu', click Apply & restart, then reopen Ubuntu and run this again."
  exit 1
fi
echo "    Docker OK."

sudo apt-get install -y -qq git curl python3 >/dev/null 2>&1 || true

echo "==> Getting Firecrawl $FC_TAG..."
if [ -d "$FC_DIR/.git" ]; then
  git -C "$FC_DIR" fetch --tags -q
else
  git clone -q https://github.com/firecrawl/firecrawl.git "$FC_DIR"
fi
git -C "$FC_DIR" checkout -q "$FC_TAG"

if [ ! -f "$FC_DIR/.env" ]; then
  echo "==> Creating Firecrawl .env (no login, private to this PC)..."
  PW="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)"
  cat > "$FC_DIR/.env" <<EOF
USE_DB_AUTHENTICATION=false
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$PW
POSTGRES_DB=postgres
EOF
  chmod 600 "$FC_DIR/.env"
else
  echo "    Keeping existing $FC_DIR/.env"
fi

echo "==> Building and starting Firecrawl (first time takes 10-20 minutes)..."
cd "$FC_DIR"
docker compose up --build -d

echo "==> Waiting for Firecrawl to be ready..."
ok=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "$FC_URL/v0/health/readiness" 2>/dev/null | grep -q '"ok"'; then ok=1; break; fi
  sleep 5
done
if [ "$ok" != 1 ]; then
  echo "Firecrawl didn't become ready. Check logs with:"
  echo "  cd ~/firecrawl && docker compose logs --tail=200 api playwright-service"
  exit 1
fi
echo "    Ready."

echo "==> Test: reading https://example.com ..."
if curl -fsS --max-time 75 -X POST "$FC_URL/v2/scrape" \
     -H 'Content-Type: application/json' \
     -d '{"url":"https://example.com","formats":["markdown"],"timeout":60000}' \
   | grep -q '"success":true'; then
  echo "    Page reading works."
else
  echo "    Test scrape failed. Check: cd ~/firecrawl && docker compose logs --tail=200 api playwright-service"
  exit 1
fi

echo "==> Pointing Hermes at Firecrawl for page reading..."
mkdir -p "$HERMES_DIR"
touch "$HERMES_DIR/.env"
if grep -q '^FIRECRAWL_API_URL=' "$HERMES_DIR/.env"; then
  sed -i "s|^FIRECRAWL_API_URL=.*|FIRECRAWL_API_URL=$FC_URL|" "$HERMES_DIR/.env"
else
  echo "FIRECRAWL_API_URL=$FC_URL" >> "$HERMES_DIR/.env"
fi
grep -q '^SEARXNG_URL=' "$HERMES_DIR/.env" || echo "SEARXNG_URL=http://localhost:8888" >> "$HERMES_DIR/.env"

CFG="$HERMES_DIR/config.yaml"
[ -f "$CFG" ] && cp "$CFG" "$CFG.bak"
PY=""
for c in "$HOME/.hermes/venv/bin/python" "$HOME/.local/share/hermes/venv/bin/python" python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import yaml" 2>/dev/null; then PY="$c"; break; fi
done
if [ -n "$PY" ]; then
  "$PY" - "$CFG" <<'PYEOF'
import sys, yaml, os
p = sys.argv[1]
data = {}
if os.path.exists(p):
    with open(p) as f:
        data = yaml.safe_load(f) or {}
web = data.get("web") or {}
web["search_backend"] = "searxng"
web["extract_backend"] = "firecrawl"
data["web"] = web
with open(p, "w") as f:
    yaml.safe_dump(data, f, sort_keys=False)
print("    config.yaml updated: search=searxng, extract=firecrawl")
PYEOF
else
  echo ""
  echo "  Couldn't edit config.yaml automatically. Run:  hermes tools"
  echo "  > Web Search & Extract: set search to SearXNG and extract to Firecrawl Self-Hosted"
  echo "  (URL: $FC_URL), or add this to $CFG under 'web:':"
  echo "      search_backend: \"searxng\""
  echo "      extract_backend: \"firecrawl\""
fi

cat <<EOF

==================================================================
 Done. Restart Hermes (exit it, then: cd ~/hermes-work && hermes)
 and try:
   Search the web for the latest Ollama release, read the release
   page, and tell me what's new. Include the full URL of each source.

 Firecrawl commands (in Ubuntu):
   start:  cd ~/firecrawl && docker compose up -d
   stop:   cd ~/firecrawl && docker compose stop
   logs:   cd ~/firecrawl && docker compose logs --tail=100 api
==================================================================
EOF
