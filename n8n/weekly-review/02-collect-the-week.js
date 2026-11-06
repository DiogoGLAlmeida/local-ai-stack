const fs = require('fs');
const S = $input.first().json;

const helpers = this.helpers;
let sid = null; let nextId = 0;
const parseBody = (body) => {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body !== 'string') return body || {};
  const t = body.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const datas = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
  for (const d of datas.reverse()) { try { const j = JSON.parse(d); if (j.result || j.error) return j; } catch (e) {} }
  return {};
};
async function rpc(method, params, notify = false) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
  if (sid) headers['mcp-session-id'] = sid;
  const msg = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++nextId, method, params };
  const res = await helpers.httpRequest({ method: 'POST', url: S.googleMcpUrl, headers, body: JSON.stringify(msg),
    json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 120000 });
  const h = res.headers || {};
  sid = sid || h['mcp-session-id'] || h['Mcp-Session-Id'];
  if (notify) return null;
  const j = parseBody(res.body);
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}
async function mcpInit() {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'n8n-gmail-organizer', version: '1' } });
  await rpc('notifications/initialized', {}, true);
}
async function tool(name, args) {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = (r?.content || []).map(c => c.text || '').join('\n').trim();
  if (/ACTION REQUIRED|Authentication Needed/i.test(text)) throw new Error('Google sign-in needed (see README: Google sign-in link)');
  if (r?.isError) throw new Error(text.slice(0, 400));
  return text;
}

const t0 = Date.parse(S.start), t1 = Date.parse(S.end);
const inWeek = (t) => { const x = typeof t === 'number' ? t : Date.parse(t); return x >= t0 && x <= t1; };
const read = (f) => { try { return JSON.parse(fs.readFileSync(`${S.appCache}/${f}`, 'utf8')); } catch (e) { return null; } };
const W = { errors: [] };

W.days = [];
try {
  for (const f of fs.readdirSync(S.dailyFolder).filter(f => /^\d{4}-\d{2}-\d{2} Briefing\.md$/.test(f)).sort()) {
    const d = f.slice(0, 10); if (!inWeek(Date.parse(d + 'T12:00:00'))) continue;
    const t = fs.readFileSync(`${S.dailyFolder}/${f}`, 'utf8');
    const h = (t.split('### Highlights')[1] || '').split('\n### ')[0].trim();
    W.days.push({ date: d, highlights: h.slice(0, 1500) });
  }
} catch (e) { W.errors.push('daily notes: ' + e.message); }

try {
  await mcpInit();
  W.tasks = (await tool('list_tasks', { task_list_id: '@default', show_completed: true, show_hidden: true, max_results: 100 })).slice(0, 6000);
  W.nextWeek = (await tool('get_events', { calendar_id: 'primary', time_min: S.nextStart, time_max: S.nextEnd, max_results: 30 })).slice(0, 4000);
} catch (e) { W.errors.push('google: ' + e.message); }

const gh = read('mailapp-github.json');
W.github = (gh?.repos || []).map(r => ({ repo: r.repo, commits: (r.commits || []).filter(c => inWeek(c.at)), closed: (r.closedThisWeek || []).filter(c => inWeek(c.at)),
  openIssues: (r.issues || []).length, openPrs: (r.prs || []).length, ci: (r.runs || []).filter(w => inWeek(w.at)).reduce((m, w) => (m[w.conclusion || w.status] = (m[w.conclusion || w.status] || 0) + 1, m), {}) }));
const mail = read('mailapp-cache.json');
W.jobs = (mail?.jobs || []).filter(j => inWeek(j.date)).sort((a, b) => b.score - a.score).slice(0, 10);
W.jobsTotal = (mail?.jobs || []).filter(j => inWeek(j.date)).length;
W.needsMe = Object.values(mail?.meta || {}).filter(m => m.needs && inWeek(m.date)).map(m => `${m.fromName}: ${m.subject}`).slice(0, 15);
const vul = read('mailapp-vulns.json');
const ws = S.start.slice(0, 10), we = S.end.slice(0, 10);
W.kev = (vul?.kev || []).filter(k => k.added >= ws && k.added <= we).map(k => ({ id: k.id, what: `${k.vendor} ${k.product} – ${k.name}`, ransomware: k.ransomware }));
W.watch = Object.values(vul?.cves || {}).filter(x => x.watch?.length && inWeek(x.published)).map(x => ({ id: x.id, cvss: x.cvss, watch: x.watch, kev: x.kev }));
const yt = read('mailapp-youtube.json');
W.youtube = (yt?.videos || []).filter(v => inWeek(v.t) && v.verdict === 'watch').map(v => ({ title: v.title, channel: v.channel, link: v.link, why: v.why }));

try {
  const inbox = fs.existsSync(S.inboxNote) ? fs.readFileSync(S.inboxNote, 'utf8') : '';
  W.readSaved = fs.readdirSync(S.readLaterFolder).filter(f => f.endsWith('.md')).filter(f => { const t = fs.readFileSync(`${S.readLaterFolder}/${f}`, 'utf8'); const m = t.match(/^saved:\s*(.+)$/m); return m && inWeek(m[1].trim()); }).map(f => f.slice(0, -3));
  W.readUnread = (inbox.match(/^- \[ \] \[\[Read later\/[^\]|]+/gm) || []).map(l => l.replace(/^- \[ \] \[\[Read later\//, ''));
} catch (e) { W.readSaved = []; W.readUnread = []; }

try { W.gmail = fs.readFileSync(`${S.gmailLogFolder}/${S.week} Organizer.md`, 'utf8').split('## Undo')[0].slice(0, 1500); } catch (e) { W.gmail = ''; }
return [{ json: { ...S, W } }];
