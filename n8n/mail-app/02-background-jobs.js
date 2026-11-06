const S = {
  googleMcpUrl: 'http://mcp-google:8000/mcp',
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.5:9b',
  cacheFile: '/home/node/.n8n/mailapp-cache.json',
  readLaterFolder: '/vault/Read later',
  inboxNote: '/vault/Inbox.md',
  firecrawlUrl: 'http://host.docker.internal:3002',
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: '',
  pushLabels: ['Security'],
  triageQuery: 'in:inbox newer_than:3d',
  jobsQuery: 'from:jobalerts-noreply@linkedin.com newer_than:14d',
  jobProfile: 'Applied AI / ML engineering, AI for security, SOC analyst, incident response and digital forensics (DFIR), detection engineering; graduate or junior level; Guimarães, Braga, Porto, or remote/hybrid in Portugal/EU.',
};
const fs = require('fs');
const loadCache = () => { try { return JSON.parse(fs.readFileSync(S.cacheFile, 'utf8')); } catch (e) { return {}; } };
const saveCache = (c) => fs.writeFileSync(S.cacheFile, JSON.stringify(c), 'utf8');
const parseList = (text) => text.split(/\n\s*\d+\.\s+Message ID:/).slice(1).map(b => {
  const get = (k) => { const m = b.match(new RegExp(`^\\s*${k}:\\s*(.*)$`, 'mi')); return m ? m[1].trim() : ''; };
  const labels = get('Labels').split(',').map(s => s.trim()).filter(Boolean);
  const from = get('From');
  return { id: b.trim().split(/\s/)[0], threadId: get('Thread ID'), subject: get('Subject') || '(no subject)', from,
    fromName: from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from, date: get('Date'),
    labels, unread: labels.includes('UNREAD'), link: get('Web Link') };
});
const llm = async (helpers, prompt, json = false, ctx = 8192) => {
  const r = await helpers.httpRequest({ method: 'POST', url: `${S.ollamaUrl}/api/chat`, json: true, timeout: 300000,
    body: { model: S.model, stream: false, think: false, keep_alive: '2m', ...(json ? { format: 'json' } : {}),
      options: { num_ctx: ctx, temperature: 0.1 }, messages: [{ role: 'user', content: prompt }] } });
  const t = (r.message?.content || '').trim();
  return json ? JSON.parse(t || '{}') : t;
};
const bodyOf = (t) => t.replace(/^[\s\S]*?\n\s*\n/, '');

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

const c = loadCache(); c.meta = c.meta || {}; c.jobs = c.jobs || []; c.jobsDone = c.jobsDone || {}; c.pushed = c.pushed || {};
if (c.lock && Date.now() - c.lock < 20 * 60 * 1000) return [{ json: { ok: true, log: ['previous run still busy, skipped'] } }];
c.lock = Date.now(); saveCache(c);
if (c.triageVersion !== 2) { c.meta = {}; c.triageVersion = 2; }
const SKIP_LABELS = ['Newsletters', 'Jobs', 'Social', 'Shopping', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'];
const now = $now.setZone('Europe/Lisbon'); const log = [];
let manual = false; try { manual = $('Test run').isExecuted; } catch (e) {}
await mcpInit();
const push = async (title, msg, link, prio = 3) => {
  if (!S.ntfyTopic) return;
  try { await this.helpers.httpRequest({ method: 'POST', url: `${S.ntfyServer}/${S.ntfyTopic}`, body: msg.slice(0, 300),
    headers: { Title: title.replace(/[^\x20-\x7E]/g, '').slice(0, 120) || 'Mail', Priority: String(prio), Click: link || '', Tags: 'email' } }); }
  catch (e) { log.push('push failed: ' + e.message); }
};

const recent = parseList(await tool('search_gmail_messages', { query: S.triageQuery, page_size: 50, include_headers: true }));
const isTrue = (v) => v === true || v === 'true' || v === 1 || v === 'yes';
for (const m of recent) if (!c.meta[m.id] && m.labels.some(l => SKIP_LABELS.includes(l)))
  c.meta[m.id] = { ...m, needs: false, reason: '', t: Date.now() };
const fresh = recent.filter(m => !c.meta[m.id]).slice(0, 30);
for (let i = 0; i < fresh.length; i += 6) {
  const batch = fresh.slice(i, i + 6); const parts = [];
  for (const m of batch) {
    let body = ''; try { body = bodyOf(await tool('get_gmail_message_content', { message_id: m.id })).slice(0, 1200); } catch (e) {}
    parts.push(`id: ${m.id}\nFrom: ${m.from}\nSubject: ${m.subject}\nLabels: ${m.labels.join(', ')}\n${body}`);
  }
  try {
    const r = await llm(this.helpers, `For each email decide if it NEEDS ME. Be strict: most emails do NOT need me. When unsure, answer false.
needs_me = true ONLY if the email asks ME to do something specific: reply to a person, confirm or decide, pay a bill, meet a deadline,
or act on a security problem (e.g. "was this you? secure your account", password reset I didn't ask for).
needs_me = false for: newsletters, marketing, job alerts, automatic notifications, receipts, order/shipping updates, GitHub/CI notifications,
"new sign-in" or "token created/regenerated" notices about things I did myself, account confirmations, welcome emails.
Gmail category labels are included as hints (CATEGORY_UPDATES/PROMOTIONS are usually false).
Answer only JSON {"items":[{"id":"...","needs_me":true|false,"reason":"max 12 words"}]}.

${parts.join('\n\n=====\n\n')}`, true, 16384);
    for (const it of r.items || []) {
      const m = batch.find(b => b.id === it.id); if (!m) continue;
      c.meta[m.id] = { ...m, needs: isTrue(it.needs_me), reason: String(it.reason || '').slice(0, 120), t: Date.now() };
    }
  } catch (e) { log.push('triage: ' + e.message); }
  for (const m of batch) if (!c.meta[m.id]) c.meta[m.id] = { ...m, needs: false, reason: '', t: Date.now() };
}
for (const m of fresh) {
  const x = c.meta[m.id]; if (!x || c.pushed[m.id]) continue;
  const hit = S.pushLabels.find(l => x.labels.includes(l));
  if (x.needs || hit) { await push(`${x.needs ? 'Needs you' : hit}: ${x.fromName}`, `${x.subject}${x.reason ? '\n' + x.reason : ''}`, x.link, x.needs ? 4 : 3); c.pushed[m.id] = Date.now(); }
}
log.push(`triaged ${fresh.length}`);

const alerts = parseList(await tool('search_gmail_messages', { query: S.jobsQuery, page_size: 30 })).filter(m => !c.jobsDone[m.id]).slice(0, 4);
for (const m of alerts) {
  try {
    const t = bodyOf(await tool('get_gmail_message_content', { message_id: m.id })).slice(0, 9000);
    const r = await llm(this.helpers, `Extract every job in this LinkedIn job-alert email and score how well it fits me (0-100).
Me: ${S.jobProfile}
Answer only JSON {"jobs":[{"role":"","company":"","location":"","mode":"remote|hybrid|on-site|unknown","url":"job link from the email or empty","score":0,"why":"max 10 words"}]}

${t}`, true, 16384);
    for (const j of r.jobs || []) {
      if (!j.role) continue;
      const key = `${j.role}|${j.company}`.toLowerCase();
      if (c.jobs.some(x => x.key === key)) continue;
      c.jobs.push({ key, role: j.role, company: j.company || '', location: j.location || '', mode: j.mode || 'unknown',
        url: /^https?:\/\//.test(j.url || '') ? j.url : m.link, score: Math.max(0, Math.min(100, +j.score || 0)), why: j.why || '', date: m.date, mailId: m.id });
    }
    c.jobsDone[m.id] = Date.now();
  } catch (e) { log.push('jobs: ' + e.message); }
}
c.jobs = c.jobs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 300);
c.jobsUpdated = now.toISO();
for (const j of c.jobs) if (j.score >= 80 && !c.pushed['job:' + j.key]) { await push(`Job match ${j.score}: ${j.company}`, `${j.role} · ${j.location}`, j.url, 3); c.pushed['job:' + j.key] = Date.now(); }

const day = now.toFormat('yyyy-MM-dd');
if ((c.digest?.date !== day && now.hour >= 6) || manual) {
  const labels = (JSON.parse(await tool('list_gmail_labels', { compact: true, include_system: false })).labels || []).map(l => l.name);
  const per = {};
  for (const l of labels) {
    const ms = parseList(await tool('search_gmail_messages', { query: `label:"${l}" newer_than:1d`, page_size: 30, include_headers: true }));
    if (!ms.length) { per[l] = 'Nothing new today.'; continue; }
    try { per[l] = await llm(this.helpers, `In 1-2 English sentences, summarise what arrived today in my "${l}" email label. Mention counts and anything that stands out.${l === 'Jobs' ? ' Point out roles that fit: ' + S.jobProfile : ''} Use only this list.\n\n${ms.map(m => `- ${m.fromName}: ${m.subject}`).join('\n')}`); }
    catch (e) { per[l] = 'unavailable: ' + e.message; }
  }
  c.digest = { date: day, made: now.toFormat('HH:mm'), labels: per };
  log.push('digest done');
}

const cutoff = Date.now() - 30 * 864e5;
for (const [k, v] of Object.entries(c.meta)) if (v.t < cutoff) delete c.meta[k];
for (const [k, v] of Object.entries(c.pushed)) if (v < cutoff) delete c.pushed[k];
for (const [k, v] of Object.entries(c.jobsDone)) if (v < cutoff) delete c.jobsDone[k];
c.lock = 0; saveCache(c);
return [{ json: { ok: true, log, needsMe: Object.values(c.meta).filter(m => m.needs).length, jobs: c.jobs.length } }];
