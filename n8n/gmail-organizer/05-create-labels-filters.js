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

const isAddr = (k) => k.includes('@');
const planned = S.candidates
  .filter(c => S.assignments[c.key] && S.assignments[c.key] !== 'none')
  .slice(0, S.maxNewFiltersPerRun)
  .map(c => ({ sender: c.key, label: S.assignments[c.key], count: c.count, name: c.name }));
const result = { createdLabels: [], createdFilters: [], errors: [...(S.problems || [])] };

if (!S.dryRun && planned.length) {
  await mcpInit();
  const labelIds = Object.fromEntries((S.existingLabels || []).map(l => [l.name, l.id]));
  for (const name of [...new Set(planned.map(p => p.label))]) {
    if (labelIds[name]) continue;
    const color = S.labels[name]?.[1];
    const text = color === '#ffffff' || color === '#cccccc' || color === '#fad165' ? '#000000' : '#ffffff';
    try {
      try { await tool('manage_gmail_label', { action: 'create', name, background_color: color, text_color: text }); }
      catch (e) { await tool('manage_gmail_label', { action: 'create', name }); }
      result.createdLabels.push(name);
    } catch (e) { result.errors.push(`label ${name}: ${e.message}`); }
  }
  try {
    const fresh = JSON.parse(await tool('list_gmail_labels', { compact: true, include_system: false })).labels || [];
    for (const l of fresh) labelIds[l.name] = l.id;
  } catch (e) { result.errors.push('could not re-read labels: ' + e.message); }
  for (const p of planned) {
    const id = labelIds[p.label];
    if (!id) { result.errors.push(`no label id for ${p.label}`); continue; }
    try {
      await tool('manage_gmail_filter', { action: 'create', criteria: { from: p.sender }, filter_action: { addLabelIds: [id] } });
      result.createdFilters.push(p);
    } catch (e) { result.errors.push(`filter ${p.sender}: ${e.message}`); }
  }
}
return [{ json: { ...S, planned, result } }];
