const req = $input.first().json; const q = req.query || {}; const h = req.headers || {};
const ok = h.host === 'mail-app-proxy' && h['x-mail-app'] === '1'
  && (!h['sec-fetch-site'] || h['sec-fetch-site'] === 'same-origin');
if (!ok) return [{ json: { body: JSON.stringify({ error: 'blocked' }) } }];

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

const safeName = (s) => s.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'untitled';
const today = $now.setZone('Europe/Lisbon');
const writeNote = (title, source, text) => {
  fs.mkdirSync(S.readLaterFolder, { recursive: true });
  const name = `${today.toFormat('yyyy-MM-dd')} ${safeName(title)}`;
  fs.writeFileSync(`${S.readLaterFolder}/${name}.md`, ['---', `source: "${source.replace(/"/g, '')}"`, `saved: ${today.toISO()}`,
    'tags: [read-later]', '---', '', `# ${title}`, '', text].join('\n'), 'utf8');
  fs.appendFileSync(S.inboxNote, `\n- [ ] [[Read later/${name}|${title.replace(/[\[\]|]/g, '')}]] (${today.toFormat('d LLL')})`, 'utf8');
  return `Vault\\Read later\\${name}.md`;
};
let out;
try {
  const a = q.action || 'list';
  const cache = loadCache();
  if (a === 'needs') out = { messages: Object.values(cache.meta || {}).filter(m => m.needs).sort((x, y) => new Date(y.date) - new Date(x.date)) };
  else if (a === 'jobs') out = { jobs: cache.jobs || [], profile: S.jobProfile, updated: cache.jobsUpdated || null };
  else if (a === 'digest') out = cache.digest || {};
  else if (a === 'vulns') { try { out = JSON.parse(fs.readFileSync('/home/node/.n8n/mailapp-vulns.json', 'utf8')); delete out.pushed; } catch (e) { out = { note: 'No data yet: the Threat intel step runs once an hour.' }; } }
  else if (a === 'cvenote') {
    const v = JSON.parse(fs.readFileSync('/home/node/.n8n/mailapp-vulns.json', 'utf8'));
    const id = String(q.id || '').toUpperCase(); if (!/^CVE-\d{4}-\d{4,7}$/.test(id)) throw new Error('bad CVE id');
    const x = v.cves?.[id] || {}; const k = (v.kev || []).find(z => z.id === id); const e = v.epss?.[id]; const att = v.attack?.[id] || [];
    const dir = '/vault/Security/CVEs'; fs.mkdirSync(dir, { recursive: true });
    const L = ['---', `cve: ${id}`, `cvss: ${x.cvss ?? ''}`, `severity: ${x.severity || ''}`, `epss: ${e ? (e.epss * 100).toFixed(2) + '%' : ''}`, `kev: ${!!k}`,
      `attack: [${att.map(t => t.id).join(', ')}]`, `saved: ${$now.toISO()}`, 'tags: [cve, security]', '---', '', `# ${id}${k ? ' – ' + k.name : ''}`, '',
      x.desc || k?.desc || '', '',
      `- **CVSS:** ${x.cvss ?? '?'} ${x.severity || ''} ${x.vector ? '`' + x.vector + '`' : ''}`,
      `- **EPSS:** ${e ? (e.epss * 100).toFixed(2) + '% (percentile ' + (e.pct * 100).toFixed(0) + ')' : 'n/a'}`,
      `- **CISA KEV:** ${k ? `yes, added ${k.added}, due ${k.due}${k.ransomware ? ', known ransomware use' : ''}\n  - Required action: ${k.action}` : 'no'}`,
      `- **CWE:** ${(x.cwe || k?.cwes || []).join(', ') || 'n/a'}`,
      `- **ATT&CK (AI-suggested, verify):** ${att.map(t => `[${t.id} ${t.name}](https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/)`).join(', ') || 'n/a'}`,
      '', '## Links', `- [NVD](https://nvd.nist.gov/vuln/detail/${id})`, ...(x.refs || []).map(r => `- ${r}`), '', '## Notes', ''];
    const file = `${dir}/${id}.md`; if (!fs.existsSync(file)) fs.writeFileSync(file, L.join('\n'), 'utf8');
    out = { saved: `Vault\\Security\\CVEs\\${id}.md` };
  }
  else if (a === 'youtube') { try { out = JSON.parse(fs.readFileSync('/home/node/.n8n/mailapp-youtube.json', 'utf8')); } catch (e) { out = { videos: [], note: 'No videos yet: the YouTube step runs once an hour.' }; } }
  else if (a === 'github') { try { out = JSON.parse(fs.readFileSync('/home/node/.n8n/mailapp-github.json', 'utf8')); } catch (e) { out = { repos: [], note: 'No data yet: the GitHub step runs every 30 minutes.' }; } }
  else if (a === 'rl_list' || a === 'rl_get' || a === 'rl_summary' || a === 'rl_done') {
    const dir = S.readLaterFolder; fs.mkdirSync(dir, { recursive: true });
    const inbox = fs.existsSync(S.inboxNote) ? fs.readFileSync(S.inboxNote, 'utf8') : '';
    const isDone = (name) => new RegExp(`- \\[x\\] \\[\\[Read later/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[|\\]]`, 'i').test(inbox);
    const rlCache = '/home/node/.n8n/mailapp-readlater.json'; let rc = {}; try { rc = JSON.parse(fs.readFileSync(rlCache, 'utf8')); } catch (e) {}
    const safe = (n) => { const b = String(n || '').replace(/\.md$/, ''); if (!b || /[\/\\]|\.\./.test(b) || !fs.existsSync(`${dir}/${b}.md`)) throw new Error('note not found'); return b; };
    if (a === 'rl_list') {
      out = { items: fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
        const name = f.slice(0, -3); const t = fs.readFileSync(`${dir}/${f}`, 'utf8'); const fm = (t.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
        const get = (k) => ((fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, 'm')) || [])[1] || '');
        return { name, title: (t.match(/^# (.+)$/m) || [])[1] || name, source: get('source'), saved: get('saved'), words: t.split(/\s+/).length, done: isDone(name), summary: rc[name] || null };
      }).sort((x, y) => (y.saved || '').localeCompare(x.saved || '')) };
    } else if (a === 'rl_get') {
      const n = safe(q.name); out = { text: fs.readFileSync(`${dir}/${n}.md`, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, ''), summary: rc[n] || null };
    } else if (a === 'rl_summary') {
      const n = safe(q.name); const t = fs.readFileSync(`${dir}/${n}.md`, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').slice(0, 30000);
      rc[n] = await llm(this.helpers, `Summarise this saved article in English: a one-line TL;DR, then 3-6 bullets with the key points, then "Why it matters:" in one line. Use only the text.\n\n${t}`, false, 16384);
      fs.writeFileSync(rlCache, JSON.stringify(rc), 'utf8'); out = { summary: rc[n] };
    } else {
      const n = safe(q.name); const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let t = inbox; const re = new RegExp(`- \\[ \\] (\\[\\[Read later/${esc}[|\\]])`, 'i');
      if (re.test(t)) t = t.replace(re, '- [x] $1'); else t += `\n- [x] [[Read later/${n}]]`;
      fs.writeFileSync(S.inboxNote, t, 'utf8'); out = { done: true };
    }
  }
  else if (a === 'news') { try { out = JSON.parse(fs.readFileSync('/home/node/.n8n/mailapp-news.json', 'utf8')); } catch (e) { out = { items: [], note: 'No news yet: the News jobs step runs every 15 minutes.' }; } }
  else {
    await mcpInit();
    if (a === 'labels') {
      const names = (JSON.parse(await tool('list_gmail_labels', { compact: true, include_system: false })).labels || []).map(l => l.name).sort();
      const count = async (query) => { const t = await tool('search_gmail_messages', { query, page_size: 100 }); return t.split(/\n\s*\d+\.\s+Message ID:/).length - 1; };
      const labels = [];
      for (const n of names) labels.push({ name: n, unread: await count(`label:"${n}" is:unread`) });
      out = { labels, newCount: await count('in:inbox is:unread') };
    } else if (a === 'read') out = { text: await tool('get_gmail_message_content', { message_id: q.id }) };
    else if (a === 'thread') out = { text: await tool('get_gmail_thread_content', { thread_id: q.id }) };
    else if (a === 'summary') {
      const t = (await tool('get_gmail_message_content', { message_id: q.id })).slice(0, 12000);
      out = { summary: await llm(this.helpers, `Summarise this email in English in at most 3 short bullets, then one line "Action:" saying what I need to do (or "nothing"). Use only what the email says.\n\n${t}`) };
    } else if (a === 'today') {
      const start = today.startOf('day');
      const safe = async (n, args) => { try { return await tool(n, args); } catch (e) { return 'unavailable: ' + e.message; } };
      out = { events: await safe('get_events', { calendar_id: 'primary', time_min: start.toISO(), time_max: start.plus({ days: 1 }).toISO(), max_results: 20 }),
              tasks: await safe('list_tasks', { task_list_id: '@default', show_completed: false, max_results: 30 }) };
    } else if (a === 'addtask') {
      out = { text: await tool('create_task', { task_list_id: '@default', title: (q.title || 'Email').slice(0, 200),
        notes: `From: ${q.from || ''}\n${q.link || ''}`.slice(0, 1000) }) };
    } else if (a === 'drive') {
      out = { text: await tool('search_drive_files', { query: `modifiedTime > '${today.minus({ days: 30 }).toUTC().toISO({ suppressMilliseconds: true })}'`, page_size: 25 }) };
    } else if (a === 'links') {
      const t = await tool('get_gmail_message_content', { message_id: q.id });
      const urls = [...new Set((t.match(/https?:\/\/[^\s<>"')\]]+/g) || []).map(u => u.replace(/[.,;]+$/, '')))]
        .filter(u => !/unsubscribe|optout|opt-out|preferences|\.(png|jpe?g|gif|svg)(\?|$)|mail\.google\.com|list-manage\.com\/track/i.test(u)).slice(0, 30);
      out = { links: urls };
    } else if (a === 'readlater') {
      const t = await tool('get_gmail_message_content', { message_id: q.id });
      out = { saved: writeNote(q.title || 'Email', q.link || 'gmail', bodyOf(t).slice(0, 60000)) };
    } else if (a === 'savelink') {
      if (!/^https?:\/\//i.test(q.url || '')) throw new Error('not a web link');
      const r = await this.helpers.httpRequest({ method: 'POST', url: `${S.firecrawlUrl}/v2/scrape`, json: true, timeout: 120000,
        headers: { Authorization: 'Bearer local' }, body: { url: q.url, formats: ['markdown'], onlyMainContent: true } });
      const d = r.data || {};
      out = { saved: writeNote(d.metadata?.title || q.url, q.url, d.markdown || '(Firecrawl returned no text)') };
    } else if (a === 'ask') {
      const plan = await llm(this.helpers, `Turn this question about my email into ONE Gmail search query (Gmail operators like from:, subject:, newer_than:, has:attachment are fine; keep it broad). Answer only JSON {"query":"..."}.\nQuestion: ${q.q}`, true);
      const found = parseList(await tool('search_gmail_messages', { query: plan.query || q.q, page_size: 8 })).slice(0, 5);
      const docs = [];
      for (const [i, m] of found.entries()) docs.push(`[${i + 1}] From: ${m.from} | Date: ${m.date} | Subject: ${m.subject}\n${bodyOf(await tool('get_gmail_message_content', { message_id: m.id })).slice(0, 2500)}`);
      const answer = docs.length ? await llm(this.helpers, `Answer my question in English using ONLY these emails. Cite them like [1]. If they don't contain the answer, say so.\nQuestion: ${q.q}\n\n${docs.join('\n\n---\n\n')}`, false, 16384)
        : 'No emails matched that search.';
      out = { answer, query: plan.query || q.q, sources: found };
    } else {
      const args = { query: q.q || 'in:inbox', page_size: 50, include_headers: true };
      if (q.page) args.page_token = q.page;
      const text = await tool('search_gmail_messages', args);
      const t = text.match(/next[_ ]?page[_ ]?token[^A-Za-z0-9_-]*([A-Za-z0-9_-]{8,})/i);
      out = { messages: parseList(text), next: t ? t[1] : null };
    }
  }
} catch (e) { out = { error: e.message }; }
return [{ json: { body: JSON.stringify(out) } }];
