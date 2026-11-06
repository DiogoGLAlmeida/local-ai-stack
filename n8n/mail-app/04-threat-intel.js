const fs = require('fs');

const V = {
  cacheFile: '/home/node/.n8n/mailapp-vulns.json',
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.5:9b',
  everyMin: 60,
  nvdHoursBack: 48,
  minCvss: 7.0,
  kevDaysBack: 30,
  watchlist: ['ollama', 'docker', 'n8n', 'brave', 'chrome', 'chromium', 'windows', 'microsoft', 'fortinet', 'fortios',
              'forticlient', 'open webui', 'nginx', 'python', 'node.js', 'wsl', 'amd', 'radeon', 'steam', 'obsidian', 'github'],
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: '',
  feeds: [
    { name: 'CISA advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
    { name: 'CNCS / CERT.PT', url: 'https://www.cncs.gov.pt/docs/alertas-seguranca/feed-rss/index.xml' },
    { name: 'Exploit-DB', url: 'https://www.exploit-db.com/rss.xml' },
  ],
  ransomwareCountry: 'PT',

};

const load = () => { try { return JSON.parse(fs.readFileSync(V.cacheFile, 'utf8')); } catch (e) { return {}; } };
const c = load(); const now = Date.now(); const log = [];
if (c.ranAt && now - c.ranAt < V.everyMin * 60000) return [{ json: { ok: true, skipped: 'ran recently' } }];
c.cves = c.cves || {}; c.attack = c.attack || {}; c.pushed = c.pushed || {}; c.errors = {};
const H = this.helpers; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (url, json = true, timeout = 60000) => H.httpRequest({ url, json, timeout, headers: { 'User-Agent': 'Mozilla/5.0 (local threat intel)' } });
const watchHit = (text) => V.watchlist.filter(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text || ''));
const parseNvd = (v) => {
  const x = v.cve; const m = x.metrics || {};
  const met = (m.cvssMetricV40 || m.cvssMetricV31 || m.cvssMetricV30 || m.cvssMetricV2 || [])[0];
  const d = met?.cvssData || {};
  return { id: x.id, published: x.published, desc: (x.descriptions || []).find(z => z.lang === 'en')?.value || '',
    cvss: d.baseScore ?? null, severity: d.baseSeverity || met?.baseSeverity || '', vector: d.vectorString || '',
    cvssVersion: d.version || '', cwe: [...new Set((x.weaknesses || []).flatMap(w => w.description.map(z => z.value)).filter(z => /^CWE-\d+$/.test(z)))],
    refs: (x.references || []).slice(0, 8).map(r => r.url), status: x.vulnStatus || '' };
};

let kevAll = [];
try {
  const k = await get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', true, 90000);
  kevAll = k.vulnerabilities || [];
  c.kevCount = kevAll.length; c.kevVersion = k.catalogVersion;
} catch (e) { c.errors.KEV = e.message; }
const kevIds = new Set(kevAll.map(k => k.cveID));
const kevCut = new Date(now - V.kevDaysBack * 864e5).toISOString().slice(0, 10);
c.kev = kevAll.filter(k => k.dateAdded >= kevCut).sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).map(k => ({
  id: k.cveID, vendor: k.vendorProject, product: k.product, name: k.vulnerabilityName, added: k.dateAdded, due: k.dueDate,
  ransomware: k.knownRansomwareCampaignUse === 'Known', action: k.requiredAction, desc: k.shortDescription, cwes: k.cwes || [] }));

try {
  const iso = (t) => new Date(t).toISOString().replace('Z', '');
  const r = await get(`https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${iso(now - V.nvdHoursBack * 3600e3)}&pubEndDate=${iso(now)}&resultsPerPage=2000`, true, 120000);
  let kept = 0;
  for (const v of r.vulnerabilities || []) {
    const p = parseNvd(v);
    const hits = watchHit(p.desc);
    if ((p.cvss ?? 0) >= V.minCvss || kevIds.has(p.id) || hits.length) { c.cves[p.id] = { ...(c.cves[p.id] || {}), ...p, watch: hits, seen: now }; kept++; }
  }
  log.push(`NVD: ${r.totalResults ?? 0} new, kept ${kept}`);
} catch (e) { c.errors.NVD = e.message; }
await sleep(6500);

for (const k of c.kev.filter(k => !c.cves[k.id]).slice(0, 4)) {
  try { const r = await get(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${k.id}`);
    const v = (r.vulnerabilities || [])[0]; if (v) { const p = parseNvd(v); c.cves[p.id] = { ...p, watch: watchHit(p.desc + ' ' + k.vendor + ' ' + k.product), seen: now }; } }
  catch (e) { c.errors['NVD ' + k.id] = e.message; }
  await sleep(6500);
}
for (const [id, x] of Object.entries(c.cves)) { x.kev = kevIds.has(id); if (now - (x.seen || 0) > 30 * 864e5 && !x.kev) delete c.cves[id]; }

const ids = [...new Set([...Object.keys(c.cves), ...c.kev.map(k => k.id)])];
c.epss = c.epss || {};
for (let i = 0; i < ids.length; i += 100) {
  try { const r = await get(`https://api.first.org/data/v1/epss?cve=${ids.slice(i, i + 100).join(',')}`);
    for (const e of r.data || []) c.epss[e.cve] = { epss: +e.epss, pct: +e.percentile, date: e.date }; }
  catch (e) { c.errors.EPSS = e.message; }
}
for (const k of Object.keys(c.epss)) if (!ids.includes(k)) delete c.epss[k];

const needMap = ids.filter(id => !c.attack[id] && (kevIds.has(id) || (c.cves[id]?.cvss ?? 0) >= 9)).slice(0, 24);
for (let i = 0; i < needMap.length; i += 8) {
  const batch = needMap.slice(i, i + 8);
  const text = batch.map(id => { const k = c.kev.find(z => z.id === id); const x = c.cves[id] || {};
    return `${id}: ${k ? k.vendor + ' ' + k.product + ' – ' + k.name + '. ' : ''}${(x.desc || k?.desc || '').slice(0, 500)} ${x.cwe?.length ? '(' + x.cwe.join(', ') + ')' : ''}`; }).join('\n');
  try {
    const r = await H.httpRequest({ method: 'POST', url: `${V.ollamaUrl}/api/chat`, json: true, timeout: 300000,
      body: { model: V.model, stream: false, think: false, format: 'json', keep_alive: '2m', options: { num_ctx: 16384, temperature: 0 },
        messages: [{ role: 'user', content: `For each CVE, list the MITRE ATT&CK Enterprise techniques an attacker would most likely use when exploiting it (usually 1-3), e.g. T1190 Exploit Public-Facing Application, T1203 Exploitation for Client Execution, T1068 Exploitation for Privilege Escalation, T1210 Exploitation of Remote Services, T1212 Exploitation for Credential Access, T1059 Command and Scripting Interpreter, T1505.003 Web Shell.
Use real ATT&CK IDs only. Answer only JSON {"items":[{"cve":"CVE-...","techniques":[{"id":"T1190","name":"Exploit Public-Facing Application","tactic":"Initial Access"}]}]}

${text}` }] } });
    const out = JSON.parse(r.message?.content || '{}');
    for (const it of out.items || []) if (batch.includes(it.cve))
      c.attack[it.cve] = (it.techniques || []).filter(t => /^T\d{4}(\.\d{3})?$/.test(t.id || '')).slice(0, 4)
        .map(t => ({ id: t.id, name: String(t.name || '').slice(0, 80), tactic: String(t.tactic || '').slice(0, 40) }));
  } catch (e) { log.push('attack: ' + e.message); }
}
for (const k of Object.keys(c.attack)) if (!ids.includes(k)) delete c.attack[k];

const decode = (t) => (t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (b, n) => { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1] : ''; };
c.advisories = [];
for (const f of V.feeds) {
  try { let xml = await get(f.url, false, 30000); if (typeof xml !== 'string') xml = String(xml);
    for (const b of (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 25)) {
      const link = decode(tag(b, 'link')); if (!/^https?:\/\//.test(link)) continue;
      c.advisories.push({ source: f.name, title: decode(tag(b, 'title')), link, t: Date.parse(decode(tag(b, 'pubDate'))) || now,
        cves: [...new Set((b.match(/CVE-\d{4}-\d{4,7}/g) || []))].slice(0, 6) });
    } }
  catch (e) { c.errors[f.name] = e.message; }
}
c.advisories.sort((a, b) => b.t - a.t);

const sig = c.kev.slice(0, 15).map(k => k.id).join(',') + '|' + Object.keys(c.cves).length;
if (c.summary?.sig !== sig) {
  const top = Object.values(c.cves).sort((a, b) => (c.epss[b.id]?.epss || 0) - (c.epss[a.id]?.epss || 0)).slice(0, 12);
  const lines = [...c.kev.slice(0, 12).map(k => `KEV added ${k.added}: ${k.id} ${k.vendor} ${k.product} – ${k.name}${k.ransomware ? ' (ransomware use)' : ''}`),
    ...top.map(x => `CVE ${x.id} CVSS ${x.cvss ?? '?'} EPSS ${((c.epss[x.id]?.epss || 0) * 100).toFixed(1)}%${x.watch?.length ? ' WATCHLIST ' + x.watch.join('/') : ''}: ${x.desc.slice(0, 160)}`),
    ...c.advisories.slice(0, 8).map(a => `${a.source}: ${a.title}`)].join('\n');
  try {
    const r = await H.httpRequest({ method: 'POST', url: `${V.ollamaUrl}/api/chat`, json: true, timeout: 300000,
      body: { model: V.model, stream: false, think: false, keep_alive: '2m', options: { num_ctx: 16384, temperature: 0.1 },
        messages: [{ role: 'user', content: `Write today's vulnerability picture in English: 4-6 one-sentence bullets. Lead with newly KEV-listed (actively exploited) bugs and ransomware use, then high-EPSS or critical CVEs, then anything marked WATCHLIST (software I use). Mention CVE IDs. Use only this data.\n\n${lines}` }] } });
    c.summary = { text: (r.message?.content || '').trim(), at: now, sig };
  } catch (e) { log.push('summary: ' + e.message); }
}

if (V.ntfyTopic) for (const x of Object.values(c.cves)) {
  if (c.pushed[x.id] || !x.watch?.length || !(x.kev || (x.cvss ?? 0) >= 9)) continue;
  try { await H.httpRequest({ method: 'POST', url: `${V.ntfyServer}/${V.ntfyTopic}`, body: `${x.watch.join(', ')} · CVSS ${x.cvss ?? '?'}${x.kev ? ' · actively exploited (KEV)' : ''}\n${x.desc.slice(0, 200)}`,
    headers: { Title: `${x.id} affects your stack`, Priority: x.kev ? '5' : '4', Tags: 'warning', Click: `https://nvd.nist.gov/vuln/detail/${x.id}` } }); c.pushed[x.id] = now; }
  catch (e) { log.push('push: ' + e.message); }
}

const env = (k) => { try { return $env[k] || ''; } catch (e) { return ''; } };

try {
  const gh = env('GITHUB_TOKEN');
  const r = await H.httpRequest({ url: 'https://api.github.com/advisories?type=reviewed&sort=published&direction=desc&per_page=60', json: true, timeout: 30000,
    headers: { 'User-Agent': 'local-threat-intel', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(gh ? { Authorization: `Bearer ${gh}` } : {}) } });
  c.ghsa = (r || []).map(a => {
    const pk = (a.vulnerabilities || []).map(v => `${v.package?.ecosystem || ''}:${v.package?.name || ''}`).filter(s => s !== ':');
    return { id: a.ghsa_id, cve: a.cve_id || '', summary: a.summary || '', severity: a.severity || '', cvss: a.cvss?.score ?? a.cvss_severities?.cvss_v3?.score ?? null,
      epss: a.epss?.percentage ?? null, packages: [...new Set(pk)].slice(0, 6), published: a.published_at, url: a.html_url, watch: watchHit(a.summary + ' ' + pk.join(' ')) };
  });
} catch (e) { c.errors.GitHub = e.message; }

for (const [key, path] of [['euvdExploited', 'exploitedvulnerabilities'], ['euvdCritical', 'criticalvulnerabilities']]) {
  try {
    const r = await get(`https://euvdservices.enisa.europa.eu/api/${path}`, true, 30000);
    c[key] = (Array.isArray(r) ? r : r.items || []).map(v => ({ id: v.id, cves: String(v.aliases || '').split(/\s+/).filter(z => /^CVE-/.test(z)),
      desc: String(v.description || '').slice(0, 400), score: v.baseScore ?? null, epss: v.epss ?? null, published: v.datePublished, exploitedSince: v.exploitedSince || '',
      vendor: (v.enisaIdVendor || []).map(z => z.vendor?.name).filter(Boolean).join(', '), product: (v.enisaIdProduct || []).map(z => z.product?.name).filter(Boolean).join(', ') }));
  } catch (e) { c.errors['ENISA EUVD'] = e.message; }
}
const euExploited = new Set((c.euvdExploited || []).flatMap(v => v.cves));
for (const k of c.kev) k.eu = euExploited.has(k.id);

try {
  const r = await get('https://api.ransomware.live/v2/recentvictims', true, 30000);
  c.ransomware = (Array.isArray(r) ? r : r.data || []).slice(0, 100).map(v => ({ victim: v.victim || v.post_title || '?', group: v.group || v.group_name || '?',
    country: v.country || '', sector: v.activity || v.sector || '', date: v.discovered || v.attackdate || v.published || '', domain: v.domain || v.website || '',
    desc: String(v.description || '').slice(0, 300) }));
  if (V.ntfyTopic) for (const v of c.ransomware.filter(v => v.country === V.ransomwareCountry)) {
    const key = 'rw:' + v.group + ':' + v.victim; if (c.pushed[key]) continue;
    try { await H.httpRequest({ method: 'POST', url: `${V.ntfyServer}/${V.ntfyTopic}`, body: `${v.group} claims ${v.victim}${v.sector ? ' (' + v.sector + ')' : ''}`,
      headers: { Title: `Ransomware victim in ${V.ransomwareCountry}`, Priority: '3', Tags: 'skull' } }); c.pushed[key] = now; } catch (e) {}
  }
} catch (e) { c.errors['ransomware.live'] = e.message; }
c.keys = { github: !!env('GITHUB_TOKEN') };
c.ranAt = now;
fs.writeFileSync(V.cacheFile, JSON.stringify(c), 'utf8');
return [{ json: { ok: true, log, kevRecent: c.kev.length, cves: Object.keys(c.cves).length, errors: c.errors } }];
