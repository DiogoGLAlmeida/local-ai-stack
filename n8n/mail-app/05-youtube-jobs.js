const fs = require('fs');

const Y = {
  cacheFile: '/home/node/.n8n/mailapp-youtube.json',
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.5:9b',
  everyMin: 60,
  daysBack: 7,
  maxNewPerRun: 4,
  skipShorts: true,
  channels: [
    '@NetworkChuck', '@LiveOverflow', '@_JohnHammond', '@TwoMinutePapers', '@Fireship',
  ],
};
const S = { googleMcpUrl: 'http://mcp-youtube:8000/mcp' };

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

const load = () => { try { return JSON.parse(fs.readFileSync(Y.cacheFile, 'utf8')); } catch (e) { return {}; } };
const c = load(); const now = Date.now(); const log = [];
if (c.ranAt && now - c.ranAt < Y.everyMin * 60000) return [{ json: { ok: true, skipped: 'ran recently' } }];
c.ids = c.ids || {}; c.videos = c.videos || []; c.errors = {};
const H = this.helpers; const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' };
const decode = (t) => (t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (b, n) => { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1] : ''; };

for (const ch of Y.channels) {
  if (/^UC[\w-]{22}$/.test(ch)) { c.ids[ch] = ch; continue; }
  if (c.ids[ch]) continue;
  try {
    let html = await H.httpRequest({ url: `https://www.youtube.com/${ch.startsWith('@') ? ch : '@' + ch}`, json: false, timeout: 20000, headers: UA });
    html = String(html);
    const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/);
    if (m) c.ids[ch] = m[1]; else c.errors[ch] = 'channel ID not found';
  } catch (e) { c.errors[ch] = e.message.slice(0, 120); }
}

const since = now - Y.daysBack * 864e5; const found = [];
for (const ch of Y.channels) {
  const id = c.ids[ch]; if (!id) continue;
  try {
    const xml = String(await H.httpRequest({ url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, json: false, timeout: 20000, headers: UA }));
    const chName = decode(tag(xml.split('<entry')[0], 'title')) || ch;
    for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) || []) {
      const vid = decode(tag(e, 'yt:videoId')); const t = Date.parse(decode(tag(e, 'published')));
      const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || `https://www.youtube.com/watch?v=${vid}`;
      if (!vid || t < since) continue;
      if (Y.skipShorts && /\/shorts\//.test(link)) continue;
      found.push({ id: vid, channel: chName, title: decode(tag(e, 'title')), link, t, thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
        desc: decode(tag(e, 'media:description')).slice(0, 400) });
    }
  } catch (e) { c.errors[ch] = e.message.slice(0, 120); }
}
for (const v of found) if (!c.videos.some(x => x.id === v.id)) c.videos.push(v);
c.videos = c.videos.filter(v => v.t >= now - 30 * 864e5).sort((a, b) => b.t - a.t).slice(0, 150);

const todo = c.videos.filter(v => !v.summary && !v.failed).slice(0, Y.maxNewPerRun);
if (todo.length) {
  try { await mcpInit(); } catch (e) { c.errors.transcripts = 'mcp-youtube not reachable: ' + e.message; }
  for (const v of todo) {
    let tr = '';
    try { tr = await tool('get_transcript', { url: `https://www.youtube.com/watch?v=${v.id}` }); } catch (e) { v.noTranscript = e.message.slice(0, 120); }
    const text = (tr || v.desc || '').slice(0, 24000);
    if (!text) { v.failed = true; continue; }
    try {
      const r = await H.httpRequest({ method: 'POST', url: `${Y.ollamaUrl}/api/chat`, json: true, timeout: 300000,
        body: { model: Y.model, stream: false, think: false, format: 'json', keep_alive: '2m', options: { num_ctx: 16384, temperature: 0.2 },
          messages: [{ role: 'user', content: `Summarise this YouTube video for me in English. ${tr ? 'Transcript' : 'Only the description is available'} below.
Answer only JSON {"summary":["3-5 short bullets with the actual points, not hype"],"verdict":"watch|skim|skip","why":"max 12 words","topics":["2-4 short tags"]}
Title: ${v.title} (channel: ${v.channel})

${text}` }] } });
      const o = JSON.parse(r.message?.content || '{}');
      v.summary = (Array.isArray(o.summary) ? o.summary : [String(o.summary || '')]).map(s => String(s).slice(0, 300)).slice(0, 5);
      v.verdict = ['watch', 'skim', 'skip'].includes(o.verdict) ? o.verdict : 'skim'; v.why = String(o.why || '').slice(0, 100);
      v.topics = (o.topics || []).map(String).slice(0, 4); v.fromTranscript = !!tr;
    } catch (e) { log.push(`summary ${v.id}: ${e.message}`); }
  }
}
c.ranAt = now; fs.writeFileSync(Y.cacheFile, JSON.stringify(c), 'utf8');
return [{ json: { ok: true, log, videos: c.videos.length, summarised: todo.length, errors: c.errors } }];
