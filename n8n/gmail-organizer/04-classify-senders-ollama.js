const S = $input.first().json;
const allowed = Object.keys(S.labels);
const labelGuide = Object.entries(S.labels).map(([n, [d]]) => `- ${n}: ${d}`).join('\n');
const assignments = {}; const problems = [];
for (let i = 0; i < S.candidates.length; i += 30) {
  const batch = S.candidates.slice(i, i + 30);
  const list = batch.map(c => `${c.key} | ${c.name} | ${c.count} emails | e.g. "${c.subjects.join('" ; "')}"`).join('\n');
  const prompt = `Sort each email sender into exactly one label, or "none" if no label fits or you are unsure.
Labels:
${labelGuide}
Rules: use only the label names above or "none". Judge by the sender and the example subjects.
Answer ONLY with JSON: {"assignments":[{"sender":"<sender key exactly as given>","label":"<label or none>"}]}

Senders (key | name | count | example subjects):
${list}`;
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: `${S.ollamaUrl}/api/chat`, json: true, timeout: 600000,
      body: { model: S.model, stream: false, think: false, format: 'json', keep_alive: '2m',
        options: { num_ctx: 16384, temperature: 0 }, messages: [{ role: 'user', content: prompt }] } });
    const out = JSON.parse(r.message?.content || '{}');
    const keys = new Set(batch.map(c => c.key));
    for (const a of out.assignments || []) {
      if (keys.has(a.sender) && (allowed.includes(a.label) || a.label === 'none')) assignments[a.sender] = a.label;
    }
  } catch (e) { problems.push(`classification batch ${i / 30 + 1}: ${e.message}`); }
}
return [{ json: { ...S, assignments, problems } }];
