const fs = require('fs');
const s = $input.first().json;
const L = [];
L.push('---', `date: ${s.date}`, 'tags: [briefing]', '---', '', `# Briefing · ${s.dayName}`, '');
L.push(`**Weather:** ${s.sections.weather?.text || '_unavailable_'}`, '');
L.push(s.summary || '', '');

L.push('### GitHub');
for (const r of s.sections.github || []) {
  L.push(`**[${r.repo}](https://github.com/${r.repo})**`);
  if (r.error) { L.push(`- _unavailable: ${r.error}_`); continue; }
  L.push(`- Open issues (${r.issues.length}): ` + (r.issues.slice(0, 8).map(i => `[#${i.number} ${i.title}](${i.url})`).join(', ') || 'none'));
  L.push(`- Open PRs (${r.prs.length}): ` + (r.prs.map(p => `[#${p.number} ${p.title}](${p.url})`).join(', ') || 'none'));
  L.push(`- New commits (${r.commits.length}): ` + (r.commits.map(c => `[${c.sha}](${c.url}) ${c.message}`).join('; ') || 'none'));
}
L.push('');

const A = s.sections.app || {};
if ((A.ci || []).length) {
  L.push('### CI');
  for (const w of A.ci) L.push(`- ${w.result === 'success' ? '✅' : w.result === 'failure' ? '❌' : '⏳'} ${w.repo} · ${w.name} @ ${w.branch}: [${w.result}](${w.url})`);
  L.push('');
}
if ((A.kev || []).length || (A.watch || []).length) {
  L.push('### Threat intel');
  for (const k of A.kev || []) L.push(`- **KEV** [${k.id}](https://nvd.nist.gov/vuln/detail/${k.id}) ${k.what}${k.ransomware ? ' · ransomware' : ''}`);
  for (const x of A.watch || []) L.push(`- **Your stack** [${x.id}](https://nvd.nist.gov/vuln/detail/${x.id}) CVSS ${x.cvss ?? '?'} · ${x.watch.join(', ')}${x.kev ? ' · KEV' : ''}`);
  L.push('');
}
if ((A.markets || []).length || A.marketNews) {
  L.push('### Markets');
  if ((A.markets || []).length) L.push(A.markets.join(' · '), '');
  if (A.marketNews) L.push(A.marketNews, '');
  L.push('<small>Delayed quotes · not investment advice</small>', '');
}
if ((A.politics || []).length) {
  L.push('### Politics');
  for (const p of A.politics) L.push(`**${p.region}**`, p.text, '');
}
if ((A.youtube || []).length) {
  L.push('### YouTube');
  for (const v of A.youtube) L.push(`- [${v.title}](${v.link}) · ${v.channel} · _${v.verdict}${v.why ? ': ' + v.why : ''}_`);
  L.push('');
}
L.push('### News');
for (const [cat, items] of Object.entries(s.sections.news?.items || {})) {
  L.push(`**${cat}**`);
  if (!items.length) L.push('- nothing new');
  for (const i of items) L.push(`- [${i.title}](${i.link}) · ${i.source}`);
  L.push('');
}
if (s.sections.news?.errors?.length) L.push(`<small>Feeds that failed: ${s.sections.news.errors.join(' | ')}</small>`, '');

L.push('---', `_Generated ${$now.setZone(s.tz).toFormat('HH:mm')} by n8n + ${s.model}. Links come straight from the sources._`);

fs.mkdirSync(s.vaultFolder, { recursive: true });
fs.writeFileSync(s.file, L.join('\n'), 'utf8');
return [{ json: { written: s.file.replace('/vault', 'Vault'), date: s.date } }];
