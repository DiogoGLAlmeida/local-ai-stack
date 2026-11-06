# Local AI on Windows (RX 7900 XTX)

What you get:

| App | Address | What it's for |
|---|---|---|
| Open WebUI | http://localhost:3000 | Main chat: web search, your files, images, voice |
| Vane | http://localhost:3001 | Perplexity-style search answers with sources |
| SearXNG | http://localhost:8888 | Private search engine (used by both above) |

Models:
- **qwen3.5:9b**: everyday use and web search (default)
- **gemma4:12b**: images (screenshots, photos, documents) and writing

- **qwen3.8:27b**: tools, Google, research, notes and coding (Open WebUI custom models)
- **gemma4:31b**: writing and translation (gemma4:12b while gaming)
- **qwen3.6-agent**: Qwen3.6 35B-A3B with 64K context, used only by Hermes (22 GB, don't run while gaming)

Plus **Hermes Agent** (in WSL), an assistant that carries out tasks, and your
existing **ComfyUI**, connected for images in chat.

Only Ollama and ComfyUI use the graphics card. Everything else runs on the CPU,
and models unload after 2 idle minutes, so gaming isn't affected.

## Files in this folder

| File | What it does |
|---|---|
| `setup-ollama.ps1` | Applies the lag-prevention settings and pulls the models |
| `docker-compose.yml` | Starts Open WebUI, SearXNG, Kokoro and Vane |
| `searxng/settings.yml` | Search engine config |
| `game-mode.ps1` | Frees graphics memory before gaming |
| `setup-hermes-windows.ps1` | Hermes part 1 (Windows): networking + agent model |
| `setup-hermes-wsl.sh` | Hermes part 2 (WSL): installs Hermes |
| `hermes/Modelfile.agent` | Defines the 64K-context agent model |
| `setup-firecrawl-wsl.sh` | Self-hosted Firecrawl so Hermes can read web pages |
| `n8n/daily-briefing.json` | n8n workflow: daily briefing note in Obsidian |
| `update.ps1` | Monthly update: Docker apps, Ollama models (rebuilds custom models), Hermes, gateway |
| `start-mcp-gateways.ps1` | Starts the MCP Toolkit gateways (sign-in servers), with auto-start at login |

---

## 1. Install (once)

1. **Ollama:** you already have it. Update it to the latest version (installing over the top keeps your models).
2. **Docker Desktop:** https://www.docker.com/products/docker-desktop (keep the WSL 2 option on)
3. Put this folder somewhere permanent, e.g. `C:\local-ai`

## 2. Set up Ollama and the models

This doesn't reinstall Ollama. It only changes its settings and downloads the models.
Open PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-ollama.ps1
```

Then check that the GPU is being used:

```powershell
ollama run qwen3.5:9b "hi"
ollama ps
```

`PROCESSOR` should show **100% GPU**. If it shows CPU, see Troubleshooting.

## 3. Start the apps

1. Put a random SearXNG key in `.env` (one-time):
   ```powershell
   Add-Content .env ("SEARXNG_SECRET=" + -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }))
   ```
2. Run:

```powershell
docker compose up -d
```

The first start downloads several GB. Then open http://localhost:3000 and create
your account. The first account becomes the admin.

## 4. Set up Vane (once)

Open http://localhost:3001 → Settings → add an **Ollama** provider with the URL
`http://host.docker.internal:11434`, then choose `qwen3.5:9b` as the chat model.

## 5. Using it

- **Web search:** in a chat, click **+** (or the globe icon) and turn on Web Search.
- **Images:** switch the model to `gemma4:12b`, then drag in a screenshot or photo.
- **Voice:** click the headphone icon for a voice call, or the speaker under an answer to hear it read aloud.
- **Your documents:** Workspace → Knowledge → create a collection and upload files, then type `#` in a chat to use it.
- **From your phone (same Wi-Fi):** open `http://<your-PC-IP>:3000`. Find the IP with `ipconfig`. Allow port 3000 in Windows Firewall if asked.

## 6. Connect your ComfyUI (optional)

1. Start ComfyUI with `--listen` (add it to your launch shortcut or .bat). It usually runs on port 8188.
2. In ComfyUI, open your image workflow → menu → **Export (API)** and save the .json.
3. In Open WebUI: **Admin Panel → Settings → Images**
   - Image Generation: **on**
   - Engine: **ComfyUI**
   - Base URL: `http://host.docker.internal:8188`
   - Upload the workflow .json and set which node is the prompt, model, size, steps and seed
4. In a chat, click the image button under an answer, or ask for an image.

ComfyUI and Ollama share the graphics card. If you generate images right after
chatting, run `.\game-mode.ps1` first so the language model isn't still in memory.

## 7. Hermes Agent (optional)

Hermes edits files, runs commands and browses the web for you, and remembers
what it learns. It runs in WSL (Linux inside Windows) and uses Ollama on Windows.

**Part 1, on Windows**

1. If you don't have WSL yet: open PowerShell **as Administrator**, run `wsl --install`,
   restart, and finish the Ubuntu setup (choose a username and password).
2. In this folder, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-hermes-windows.ps1
```

This turns on WSL "mirrored networking" (so WSL can reach Ollama), creates the
`qwen3.6-agent` model and restarts WSL. It backs up any existing `.wslconfig` first.

**Part 2, in Ubuntu (WSL)**

Open Ubuntu from the Start menu and run the command printed by part 1. For `C:\local-ai` it's:

```bash
bash /mnt/c/local-ai/setup-hermes-wsl.sh
```

Then follow what it prints:

```bash
cd ~/hermes-work
hermes setup     # Provider: Ollama or Custom/OpenAI-compatible
                 # Base URL: http://localhost:11434/v1
                 # Model:    qwen3.5-agent
hermes           # start it
```

**Letting Hermes read web pages (Firecrawl, self-hosted)**

SearXNG only returns search results. To let Hermes open and read pages, run
your own Firecrawl. It runs on the CPU and stays on your PC.

1. Docker Desktop → Settings → Resources → **WSL integration** → turn on **Ubuntu** → Apply & restart.
2. In Ubuntu:

```bash
bash /mnt/c/Users/<you>/Documents/AI/local-ai/setup-firecrawl-wsl.sh
```

The first build takes 10–20 minutes. The script tests a page read, then sets Hermes to
use SearXNG for search and Firecrawl for reading pages (it backs up `~/.hermes/config.yaml` first).
Restart Hermes afterwards.

Firecrawl runs several containers and uses a few GB of RAM. `game-mode.ps1 -Full`
stops it along with everything else, and `-Off` starts it again.

**Using it safely**
- Start Hermes from `~/hermes-work`. Only point it at specific folders you want it to work on.
- Read its plan before approving anything that deletes or moves files.
- While Hermes runs, it uses more graphics memory because of the long context. Check with `ollama ps`.
  If it isn't 100% GPU, change `65536` to `32768` in `hermes/Modelfile.agent` and run part 1 again.

## 8. MCP tools

**Self-hosted (in `docker-compose.yml`, start with `docker compose up -d`):**

| Tool | Page Assist / Hermes | Open WebUI |
|---|---|---|
| YouTube transcripts | `http://localhost:8101/mcp` | `http://mcp-youtube:8000/mcp` |
| Your files (read-only) | `http://localhost:8102/mcp` | `http://mcp-files:8000/mcp` |
| Date and time | `http://localhost:8103/mcp` | `http://mcp-time:8000/mcp` |
| Wikipedia | `http://localhost:8104/mcp` | `http://mcp-wikipedia:8000/mcp` |
| Weather (Open-Meteo, no key) | `http://localhost:8105/mcp` | `http://mcp-weather:8000/mcp` |
| Calculator | `http://localhost:8106/mcp` | `http://mcp-calculator:8000/mcp` |
| Sequential Thinking | `http://localhost:8107/mcp` | `http://mcp-thinking:8000/mcp` |
| RSS feeds | `http://localhost:8108/mcp` | `http://mcp-rss:8000/mcp` |
| Memory | `http://localhost:8109/mcp` | `http://mcp-memory:8000/mcp` |
| Obsidian (Obsidian must be open; key in `.env`) | `http://localhost:8110/mcp` | `http://mcp-obsidian:8000/mcp` |
| Google (Gmail, Calendar, Tasks, Drive, Docs) | `http://localhost:8000/mcp` | `http://mcp-google:8000/mcp` |

**Hosted (no container):** Context7 programming docs → `https://mcp.context7.com/mcp` (no key needed; free key gives higher limits).

**Docker MCP Toolkit, started by `start-mcp-gateways.ps1`.** The gateway blocks browser extensions (403),
so use it from **Hermes, Cline or Open WebUI**, not Page Assist:

| Profile | Servers | Page Assist / Hermes | Open WebUI |
|---|---|---|---|
| `dev` | GitHub, Playwright, Git, SQLite | `http://localhost:8812/mcp` | `http://host.docker.internal:8812/mcp` |

**Google setup (once):**
1. https://console.cloud.google.com → create a project (e.g. "Local AI").
2. APIs & Services → Library → enable **Gmail API**, **Google Calendar API**, **Google Tasks API**, **Google Drive API** and **Google Docs API**.
3. OAuth consent screen → External → app name "Local AI", your email → add yourself under **Test users**.
4. Credentials → Create credentials → **OAuth client ID** → type **Desktop app** → copy the client ID and secret.
5. Copy `.env.example` to `.env`, paste the two values, then `docker compose up -d mcp-google`.
6. The first time the AI uses Gmail or Calendar, it gives you a sign-in link. Open it, choose your account,
   accept the "Google hasn't verified this app" warning (it's your own app), and allow access.
7. Sign-ins for apps in "Testing" expire after about 7 days. If re-signing every week gets annoying,
   set the consent screen's publishing status to **In production** (it stays private to you).

- **Obsidian:** install the *Local REST API* plugin in Obsidian, copy its API key, and in MCP Toolkit set
  API key = that key, Host = `host.docker.internal`, Port = `27124`. Obsidian must be open.
  If it can't connect, enable the plugin's non-encrypted server and use port `27123`.
- **Turn off risky tools** (profile → Tools tab): Memory `delete_*`; Obsidian delete tools; GitHub everything
  except search/read; Git `git_commit`, `git_add`, `git_reset`, `git_checkout`, `git_create_branch`;
  SQLite `write_query`, `create_table`.
- Gateway profile names in `start-mcp-gateways.ps1` must be the profile **reference** (e.g. `local_ai`).
- The gateways need a **Bearer token**. The script creates one fixed token in `.mcp-gateway-token` and prints it;
  use it in Page Assist (Authentication: Bearer Token) for Everyday and Dev. Keep that file private.
- Don't add YouTube, Time, Filesystem, Wikipedia, weather, calculator, sequential thinking, RSS, Context7 or Google servers to a Toolkit profile too (duplicate tools confuse the model).
- Gateways: `.\start-mcp-gateways.ps1` (now), `-Install` (every login), `-Stop`. Logs in `logs\`.
- Keep approval on in Page Assist for anything that can send, post or delete.

## 9. Gaming

```powershell
.\game-mode.ps1          # unload models from VRAM
.\game-mode.ps1 -Full    # also stop the containers
.\game-mode.ps1 -Off     # turn everything back on
```

Usually you don't need this, because models unload by themselves after 2 minutes.

## Changing the voice

The voice is set to `AUDIO_TTS_VOICE` in `docker-compose.yml`, or in Open WebUI under
Admin Panel → Settings → Audio.
- English: `af_heart`, `af_bella`, `am_adam`
- Portuguese (Brazil): `pf_dora`, `pm_alex`

## Updating

```powershell
docker compose pull
docker compose up -d
ollama pull qwen3.5:9b
ollama pull gemma4:12b
```

## Troubleshooting

**Settings in docker-compose.yml don't apply.** Open WebUI saves its settings
after the first start, and the admin panel overrides the file from then on. Change
them in Admin Panel → Settings (Web Search, Audio, Connections).

**Open WebUI shows no models.** In PowerShell run `curl http://localhost:11434`;
it should say "Ollama is running". If it does but Open WebUI still can't see
models, set `OLLAMA_HOST` to `0.0.0.0` (same way as in setup-ollama.ps1), restart
Ollama, and allow it through Windows Firewall.

**Ollama uses the CPU, not the GPU.** Update the AMD Adrenalin driver and restart.
If it's still on CPU, try Vulkan: set the user environment variable
`OLLAMA_VULKAN` to `1` and restart Ollama.

**Web search returns nothing.** Open http://localhost:8888/search?q=test&format=json.
If it errors, check `searxng\settings.yml` still lists `json` under `formats`, then
run `docker compose restart searxng`.

**Hermes can't reach Ollama.** In PowerShell run `wsl --shutdown`, then reopen
Ubuntu. Check that `%USERPROFILE%\.wslconfig` contains `networkingMode=mirrored`
under `[wsl2]`. Mirrored networking needs Windows 11 22H2 or newer. On older
Windows, set `OLLAMA_HOST` to `0.0.0.0`, restart Ollama, and in WSL use the
Windows IP (`ip route | grep default`) instead of `localhost`.

**Hermes prints tool calls as plain text, or loses track of the task.** The context is
too small or the model is too weak. Make sure you picked `qwen3.6-agent`, not `qwen3.5:9b`.

**Answers are slow or the PC lags.** Run `ollama ps`. If the model isn't 100% GPU,
lower `OLLAMA_CONTEXT_LENGTH` to `8192` and restart Ollama.


## 10. Open WebUI custom models (Workspace → Models)

| Model | Base | Tools | Built-in tools |
|---|---|---|---|
| Everyday (default) | `qwen3.5:9b` | Weather, Wikipedia, Calculator | Time & Calculation, Web Search |
| Google Assistant | `qwen3.8:27b` | Google | Time & Calculation |
| Researcher | `qwen3.8:27b` | Wikipedia, RSS, YouTube, Thinking, Calculator | Time & Calculation, Web Search |
| Notes & Memory | `qwen3.8:27b` | Memory, Obsidian, My Files | Time & Calculation |
| Coder | `qwen3.8:27b` | Context7, Dev, My Files | Code Interpreter |
| Writer | `gemma4:31b` | none | none |

For all tool models: Advanced Params → Function Calling **Native**, num_ctx **32768** (16384 for 9B/Gemma),
Temperature **0.3**. Turn off the built-in **Calendar**, **Task Management**, **Ask User** and **Memory**
tools (they get confused with Google and the MCP servers).

## 11. Things learned the hard way

- New tool servers in Open WebUI must be type **MCP (Streamable HTTP)**, not OpenAPI/auto.
  If a server is missing in chat, check `docker compose logs open-webui` for `openapi.json` errors.
- Open WebUI runs MCP tools **without asking first**. Use the Google Assistant model, check the tool steps
  ("Explored …"), and never trust a summary that a tool step marked ✗.
- The Docker MCP Toolkit gateway and the Google server **block browser extensions** (403), so Page Assist
  can't use them. Use Open WebUI or Hermes for Google and Dev. Page Assist keeps only YouTube and Wikipedia.
- Google Tasks default list ID is `@default`.
- Google sign-in link (if a Google tool fails with an auth error):
  ```powershell
  $u = docker compose logs --since 30m --no-log-prefix mcp-google | Select-String -Pattern 'https://accounts\.google\.com/\S+' | Select-Object -Last 1 | ForEach-Object { $_.Matches[0].Value }
  Set-Clipboard $u; "Link copied"
  ```
- The Google OAuth app is published (Em produção), so sign-ins don't expire weekly.
  Home page / privacy policy: your GitHub Pages site (homepage + privacy policy)
- `.env` must be named exactly `.env` (not `.env.example` / `.env.txt`).
- Downloaded scripts: `Get-ChildItem -Recurse | Unblock-File`, or run with `-ExecutionPolicy Bypass`.
- Dynamic tools in the Toolkit gateway are disabled: `docker mcp feature disable dynamic-tools`.


## 12. Monthly update

```powershell
powershell -ExecutionPolicy Bypass -File .\update.ps1
```
Updates the Docker apps, pulls updates for all Ollama models, rebuilds `qwen3.6-agent` and
`qwen3.8-cline` on the new base (keeping their context size), runs `hermes update` and restarts the
MCP gateway. Skip parts with `-SkipDocker`, `-SkipModels`, `-SkipHermes`, `-SkipGateway`.
Not included: Ollama and Docker Desktop themselves (they update via their apps), and Firecrawl
(pinned to a tested release). Don't run it while gaming: model downloads are large.


## 13. Daily briefing (n8n → Obsidian)

Every 30 minutes n8n checks whether today's note `Vault\Daily\YYYY-MM-DD Briefing.md` exists.
If not (and it's after 06:00), it builds one: weather (Guimarães), calendar, tasks, important unread email,
GitHub (open issues/PRs, new commits) and news by category, with a short summary by `qwen3.5:9b`.
So it runs once a day, shortly after you turn the PC on.

Setup (once):
1. Add `GITHUB_TOKEN=...` to `.env` (fine-grained, read-only: Contents, Issues, Pull requests).
2. `docker compose up -d n8n`, open http://localhost:5678 and create the owner account.
3. Workflows → **Import from File** → `n8n\daily-briefing.json`.
4. Click **Test run** → **Execute workflow** to create today's note now, then switch the workflow to **Active**.

Edit feeds, repos, city or model in the **Settings** node. Each step can be inspected in **Executions**.
If a part fails, the note still gets written and says which part was unavailable.

## 14. Gmail organizer (n8n, weekly, automatic)

Once a week it reads the last 30 days of mail. The local model (qwen3.8:27b) sorts each sender who sent you 2 or more emails into a label: Finance, Shopping, Gaming, Dev, Security, Jobs, Education, Newsletters, Social, Travel or Personal. It then creates a **Gmail filter** for each one, so new mail is labelled by Gmail itself, even when the PC is off. Each run leaves a log in `Vault\Gmail\<week> Organizer.md`.

- Needs the Google permission **"Ver, editar, criar ou alterar as definições e os filtros de email no Gmail"** (gmail.settings.basic). That permission can't send mail.
- It never reads email bodies, never deletes or moves anything, and never sends.
- `dryRun: true` is the default, so the first run only writes the plan.

**Setup:** n8n → Workflows → Import from file → `n8n/gmail-organizer.json` → **Test workflow** → read the log note → open **Settings** and set `dryRun: false` → test again → **Activate**.
**Older mail:** filters only label new mail. To label old mail too, open the filter in Gmail, click Continue, and tick *Also apply filter to matching conversations*.
**Undo:** Gmail → Settings → Filters and Blocked Addresses, or Labels.

## 15. Mail app (http://localhost:5680)

A local Gmail reader built from your labels. It's read-only: to reply, archive or delete, use "Reply / archive in Gmail". Emails show as plain text, so tracking pixels never load. The page is served by a small nginx container (`mail-app`, `mail-app/index.html` + `nginx.conf`) on 127.0.0.1:5680, which forwards `/api` to the n8n webhook. n8n's webhook sandbox stays on. The API only answers requests that come through that server with the app's header, so other websites can't read your mail through it.

- **Tabs:** Needs me (AI triage, with a reason), New, Inbox, Unlabelled, Attachments, Everything, and one tab per label with an unread count and today's AI digest.
- **Threads** toggle, **search** (Gmail syntax), **✨ Summarise**, **➕ Add as task** (Google Tasks), **📥 Read later** (saves the email to `Vault\Read later` and adds it to `Inbox.md`), **🔗 Links → save article** (Firecrawl saves the page as a note).
- **📰 News:** Cybersecurity, Politics (Portugal, Europe, World, US, with sources from different sides and a lean tag on each), Markets (index tiles: S&P 500, Nasdaq, Euro Stoxx 50, PSI, DAX, Bitcoin, EUR/USD, gold, plus market news) and AI (industry, open models, arXiv research). Each section has an AI summary; for politics it notes how sources frame the same story. 📥 saves an article via Firecrawl. Feeds are fetched every 30 min, summaries are refreshed at most every 2 h, and both are set in the "News jobs" step.
- **🛡 Threat intel**, refreshed hourly by the "Threat intel" step:
  - **Sources:** CISA KEV (actively exploited, last 30 days, with due dates and ransomware use), NVD CVEs from the last 48 h with CVSS ≥ 7, FIRST EPSS (chance of exploitation in the next 30 days, plus percentile), MITRE ATT&CK techniques (suggested by the local model, so verify them), CISA advisories and Exploit-DB.
  - **Tabs:** Overview (tiles plus an AI threat picture), KEV, CVEs (sort by EPSS, CVSS or date), Advisories. "My stack only" filters on the watchlist.
  - **Click a row** for details. 📝 writes `Vault\Security\CVEs\<id>.md` and ➕ adds a Google task.
  - **More tabs:**
    - **GitHub:** reviewed security advisories for open-source packages, using `GITHUB_TOKEN`.
    - **EU (EUVD):** ENISA's exploited and critical lists; KEV rows get an "EU" badge.
    - **Ransomware:** ransomware.live victims, with Portugal highlighted.
    - **Advisories:** CISA, CNCS / CERT.PT and Exploit-DB.
  - **Phone push:** watchlist CVEs that are in KEV or have CVSS ≥ 9 trigger a push (set `ntfyTopic` in the Threat intel step).
  - **Settings:** `watchlist` (the software you use), `minCvss`, `nvdHoursBack`. NVD is used without an API key, so it's rate-limited; the step waits between requests.
- **Tools:** Today (calendar, tasks, digest, ask box), Job board (LinkedIn alerts scored against `jobProfile`, sortable), Ask my inbox, Drive (last 30 days).
- **Keys:** j/k move · / search · s summarise · t task · l read later · e done · o open in Gmail · ? help.
- **Background jobs** run every 15 minutes: triage of new mail, the job board, the digest (once a day after 06:00) and phone push. The model only loads when there's new mail. Results are kept in `/home/node/.n8n/mailapp-cache.json` (n8n volume).
- **Phone push (ntfy):** install the ntfy app → subscribe to a long random topic (e.g. from `[guid]::NewGuid()` in PowerShell) → put it in `ntfyTopic` in BOTH settings blocks ("Gmail + AI" and "Background jobs"). Pushes go for "Needs me", Security mail and job matches of 80 or more. Note: ntfy.sh is a public server, so the sender and subject pass through it. Anyone who knows the topic could read them, so keep it random.
- **Settings** (top of the "Gmail + AI" and "Background jobs" steps): model, jobProfile, triageQuery, pushLabels, ntfyTopic.

Setup: delete the old "Mail app" workflow → import `n8n/mail-app.json` → Save → open "Background jobs" and click **Execute step** once (the first run takes a few minutes) → **Publish** → `docker compose up -d mail-app` → open http://localhost:5680. The page lives in `mail-app/index.html`; after editing it, just reload the browser. Brave: ⋮ → Save and share → **Install page as app**.

## 16. More app pages, an upgraded briefing, and the weekly review

**New steps in the Mail app workflow** (all on the 15-minute trigger; each one does real work only at its own interval):
- **YouTube jobs** (hourly): reads new videos from `channels` (@handles) via YouTube RSS, gets the transcript from your `mcp-youtube` server and has the local model summarise it into bullets plus watch, skim or skip. It does at most 4 videos per run and skips Shorts. The app page is **▶ YouTube**.
- **GitHub jobs** (every 30 min): CI runs, PRs, issues, and commits and closed items this week. The app page is **🐙 GitHub**. For CI, your token needs **Actions: Read-only**: github.com → Settings → Developer settings → Fine-grained tokens → your token → Repository permissions → Actions → Read-only → Update. The token value stays the same.
- **📚 Read later** page: everything saved with 📥, a ✨ summary per article, and **✓ Mark read**, which ticks the line in `Inbox.md`.

**Daily briefing** now adds CI, Threat intel (new KEV entries and CVEs in your stack), Markets, Politics and YouTube sections, taken from the app's caches. Highlights no longer list empty sections.

**Weekly review** (`n8n/weekly-review.json`) writes `Vault\Weekly\<YYYY-Www> Review.md` on Sunday from 18:00, or catches up the next time n8n runs. It covers:
- An AI summary: the week in short, done, still open, and next week.
- GitHub progress, the best job matches, security this week, videos worth watching, the read-later backlog, and links to the daily notes.

It uses qwen3.8:27b. **Test run** writes the current, unfinished week.
