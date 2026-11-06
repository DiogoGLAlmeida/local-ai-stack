const fs = require('fs');
const G = { cacheFile: '/home/node/.n8n/mailapp-github.json', everyMin: 30, repos: ['your-user/your-repo'] };
const load = () => { try { return JSON.parse(fs.readFileSync(G.cacheFile, 'utf8')); } catch (e) { return {}; } };
const c = load(); const now = Date.now();
if (c.ranAt && now - c.ranAt < G.everyMin * 60000) return [{ json: { ok: true, skipped: 'ran recently' } }];
let token = ''; try { token = $env.GITHUB_TOKEN || ''; } catch (e) {}
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'local-github-watch', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const get = (path) => this.helpers.httpRequest({ url: `https://api.github.com${path}`, headers, json: true, timeout: 30000 });
c.repos = [];
for (const repo of G.repos) {
  const r = { repo, errors: {} };
  try {
    const runs = await get(`/repos/${repo}/actions/runs?per_page=20`);
    r.runs = (runs.workflow_runs || []).map(w => ({ id: w.id, name: w.name, branch: w.head_branch, event: w.event, status: w.status, conclusion: w.conclusion,
      title: w.display_title, sha: (w.head_sha || '').slice(0, 7), url: w.html_url, at: w.updated_at || w.created_at }));

    const latest = {}; for (const w of r.runs) { const k = `${w.name}@${w.branch}`; if (!latest[k]) latest[k] = w; }
    r.health = Object.values(latest);
  } catch (e) { r.errors.ci = /403|Resource not accessible/i.test(e.message) ? 'token lacks "Actions: Read-only" permission' : e.message.slice(0, 120); }
  try {
    const items = await get(`/repos/${repo}/issues?state=open&per_page=50`);
    r.issues = items.filter(i => !i.pull_request).map(i => ({ n: i.number, title: i.title, url: i.html_url, labels: (i.labels || []).map(l => l.name), at: i.updated_at }));
    r.prs = items.filter(i => i.pull_request).map(i => ({ n: i.number, title: i.title, url: i.html_url, at: i.updated_at }));
  } catch (e) { r.errors.issues = e.message.slice(0, 120); }
  try {
    const since = new Date(now - 7 * 864e5).toISOString();
    r.commits = (await get(`/repos/${repo}/commits?since=${since}&per_page=30`)).map(x => ({ sha: x.sha.slice(0, 7), msg: x.commit.message.split('\n')[0], url: x.html_url, at: x.commit.author?.date }));
    const closed = await get(`/repos/${repo}/issues?state=closed&since=${since}&per_page=50`);
    r.closedThisWeek = closed.filter(i => i.closed_at && Date.parse(i.closed_at) >= now - 7 * 864e5).map(i => ({ n: i.number, title: i.title, url: i.html_url, pr: !!i.pull_request, at: i.closed_at }));
  } catch (e) { r.errors.commits = e.message.slice(0, 120); }
  c.repos.push(r);
}
c.ranAt = now; fs.writeFileSync(G.cacheFile, JSON.stringify(c), 'utf8');
return [{ json: { ok: true, repos: c.repos.map(r => ({ repo: r.repo, runs: (r.runs || []).length, errors: r.errors })) } }];
