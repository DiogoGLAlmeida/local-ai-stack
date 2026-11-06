const s = $input.first().json;
const url = s.googleMcpUrl;
const email = $env.USER_GOOGLE_EMAIL;
const helpers = this.helpers;
let sid = null; let nextId = 0;

const parse = (body) => {
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
  const res = await helpers.httpRequest({ method: 'POST', url, headers, body: JSON.stringify(msg),
    json: false, returnFullResponse: true, ignoreHttpStatusErrors: true });
  const h = res.headers || {};
  sid = sid || h['mcp-session-id'] || h['Mcp-Session-Id'];
  if (notify) return null;
  const j = parse(res.body);
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}
const textOf = (result) => (result?.content || []).map(c => c.text || '').join('\n').trim();

const out = {};
try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'n8n-briefing', version: '1' } });
  await rpc('notifications/initialized', {}, true);
  const tools = ((await rpc('tools/list', {}))?.tools || []).map(t => t.name);
  const start = $now.setZone(s.tz).startOf('day');
  const calls = {
    calendar: ['get_events', { user_google_email: email, calendar_id: 'primary',
      time_min: start.toISO(), time_max: start.plus({ days: 1 }).toISO(), max_results: 20 }],
    tasks: ['list_tasks', { user_google_email: email, task_list_id: '@default', show_completed: false, max_results: 20 }],
    email: ['search_gmail_messages', { user_google_email: email,
      query: 'is:unread newer_than:2d -category:promotions -category:social -category:updates', page_size: 10 }],
  };
  for (const [key, [name, args]] of Object.entries(calls)) {
    if (!tools.includes(name)) { out[key] = { error: `tool ${name} not found (available: ${tools.join(', ')})` }; continue; }
    try {
      const r = await rpc('tools/call', { name, arguments: args });
      const text = textOf(r).slice(0, 4000);
      if (/ACTION REQUIRED|Authentication Needed/i.test(text)) out[key] = { error: 'Google sign-in needed (see README: Google sign-in link)' };
      else if (r?.isError) out[key] = { error: text.slice(0, 300) };
      else out[key] = { text };
    } catch (e) { out[key] = { error: e.message }; }
  }
} catch (e) {
  out.error = `Google server not reachable: ${e.message}`;
}
s.sections.google = out;
return [{ json: s }];
