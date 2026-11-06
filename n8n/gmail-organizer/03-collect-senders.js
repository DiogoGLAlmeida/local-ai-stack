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

await mcpInit();

const messages = []; let pageToken = null;
for (let page = 0; page < 5 && messages.length < S.maxMessages; page++) {
  const args = { query: S.lookbackQuery, page_size: 100, include_headers: true };
  if (pageToken) args.page_token = pageToken;
  const text = await tool('search_gmail_messages', args);
  const blocks = text.split(/\n\s*\d+\.\s+Message ID:/).slice(1);
  for (const b of blocks) {
    const get = (k) => { const m = b.match(new RegExp(`^\\s*${k}:\\s*(.*)$`, 'mi')); return m ? m[1].trim() : ''; };
    messages.push({ from: get('From'), subject: get('Subject'), labels: get('Labels') });
  }
  const t = text.match(/next[_ ]?page[_ ]?token[^A-Za-z0-9_-]*([A-Za-z0-9_-]{8,})/i);
  if (!t || !blocks.length) break;
  pageToken = t[1];
}

const baseDomain = (d) => {
  const p = d.toLowerCase().split('.');
  if (p.length > 2 && ['co','com','org','gov','edu','ac','net'].includes(p[p.length - 2]) && p[p.length - 1].length === 2)
    return p.slice(-3).join('.');
  return p.slice(-2).join('.');
};
const senders = {};
for (const m of messages) {
  const addr = ((m.from.match(/<([^>]+)>/) || [])[1] || m.from).trim().toLowerCase();
  if (!addr.includes('@')) continue;
  const domain = addr.split('@')[1];
  const key = S.freeMailDomains.includes(domain) ? addr : baseDomain(domain);
  const name = m.from.replace(/<[^>]+>/, '').replace(/"/g, '').trim();
  senders[key] = senders[key] || { key, names: new Set(), count: 0, subjects: [] };
  senders[key].count++; senders[key].names.add(name);
  if (senders[key].subjects.length < 2) senders[key].subjects.push(m.subject.slice(0, 90));
}

let filtersText = '';
try { filtersText = await tool('list_gmail_filters', {}); } catch (e) { throw new Error('Cannot read filters: ' + e.message); }
const covered = new Set();
for (const m of filtersText.matchAll(/from["']?\s*[:=]\s*["']?([^\s"',}\)]+)/gi)) covered.add(m[1].toLowerCase());
let labels = [];
try { labels = JSON.parse(await tool('list_gmail_labels', { compact: true, include_system: false })).labels || []; } catch (e) {}

const candidates = Object.values(senders)
  .filter(s => s.count >= S.minEmailsPerSender && !covered.has(s.key))
  .sort((a, b) => b.count - a.count)
  .map(s => ({ key: s.key, name: [...s.names].slice(0, 2).join(' / '), count: s.count, subjects: s.subjects }));

return [{ json: { ...S, stats: { messages: messages.length, senders: Object.keys(senders).length,
  alreadyFiltered: [...covered].length }, candidates, existingLabels: labels } }];
