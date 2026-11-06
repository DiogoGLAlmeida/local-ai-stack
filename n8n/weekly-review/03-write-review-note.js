const fs = require('fs');
const S = $input.first().json; const W = S.W;
const data = `[Daily highlights]\n${W.days.map(d => `${d.date}:\n${d.highlights}`).join('\n\n') || 'none'}
[Google Tasks, raw, includes completed]\n${W.tasks || 'unavailable'}
[Next week's calendar, raw]\n${W.nextWeek || 'unavailable'}
[GitHub]\n${W.github.map(r => `${r.repo}: ${r.commits.length} commits (${r.commits.map(c => c.msg).join('; ').slice(0, 800)}), closed: ${r.closed.map(c => '#' + c.n + ' ' + c.title).join('; ') || 'none'}, ${r.openIssues} open issues, CI: ${JSON.stringify(r.ci)}`).join('\n') || 'no data'}
[Emails that needed me] ${W.needsMe.join('; ') || 'none'}
[Job matches this week] ${W.jobsTotal} total; best: ${W.jobs.slice(0, 5).map(j => `${j.role} @ ${j.company} (${j.score})`).join('; ') || 'none'}
[Security] new KEV: ${W.kev.map(k => k.id + ' ' + k.what).join('; ').slice(0, 1500) || 'none'}; my stack: ${W.watch.map(x => x.id + ' ' + x.watch.join('/')).join('; ') || 'none'}
[Read later] saved ${W.readSaved.length}, unread in total ${W.readUnread.length}`;
let ai = '';
try {
  const r = await this.helpers.httpRequest({ method: 'POST', url: `${S.ollamaUrl}/api/chat`, json: true, timeout: 600000,
    body: { model: S.model, stream: false, think: false, keep_alive: '2m', options: { num_ctx: 32768, temperature: 0.3 },
      messages: [{ role: 'user', content: `Write my weekly review for ${S.week} in English Markdown, using ONLY the data below. Never invent anything.
Sections, exactly:
## The week in short
One short paragraph.
## Done
Bullets: tasks completed this week (only ones the data shows as completed), GitHub progress, other wins.
## Still open
Bullets: open tasks, open issues, unanswered things that needed me.
## Next week
Bullets: what's on the calendar, then 3 concrete focus suggestions based on the data (e.g. which GitHub issue to tackle, which job to apply for, read-later backlog).

${data}` }] } });
  ai = (r.message?.content || '').trim();
} catch (e) { ai = `_AI summary unavailable: ${e.message}_`; }
const L = ['---', `week: ${S.week}`, 'tags: [weekly-review]', '---', '', `# Weekly review · ${S.week}`, '', ai, ''];
for (const r of W.github) {
  L.push(`### GitHub · [${r.repo}](https://github.com/${r.repo})`, `${r.commits.length} commits · ${r.closed.length} closed · ${r.openIssues} open issues · ${r.openPrs} open PRs · CI: ${Object.entries(r.ci).map(([k, v]) => `${v} ${k}`).join(', ') || 'no runs'}`);
  for (const c of r.closed) L.push(`- ✓ [#${c.n} ${c.title}](${c.url})`);
  L.push('');
}
if (W.jobs.length) { L.push(`### Best job matches (${W.jobsTotal} this week)`); for (const j of W.jobs) L.push(`- **${j.score}** [${j.role}](${j.url}) · ${j.company} · ${j.location} · ${j.mode}`); L.push(''); }
if (W.kev.length || W.watch.length) {
  L.push(`### Security this week`, `${W.kev.length} new actively exploited (KEV)`);
  for (const k of W.kev.slice(0, 15)) L.push(`- [${k.id}](https://nvd.nist.gov/vuln/detail/${k.id}) ${k.what}${k.ransomware ? ' · ransomware' : ''}`);
  for (const x of W.watch) L.push(`- **Your stack** [${x.id}](https://nvd.nist.gov/vuln/detail/${x.id}) CVSS ${x.cvss ?? '?'} · ${x.watch.join(', ')}`);
  L.push('');
}
if (W.youtube.length) { L.push('### Worth watching'); for (const v of W.youtube) L.push(`- [${v.title}](${v.link}) · ${v.channel}${v.why ? ' · ' + v.why : ''}`); L.push(''); }
L.push(`### Read later`, `Saved this week: ${W.readSaved.length} · unread: ${W.readUnread.length}`);
for (const n of W.readUnread.slice(0, 10)) L.push(`- [ ] [[Read later/${n}]]`);
L.push('');
if (W.days.length) L.push('### Daily notes', W.days.map(d => `[[Daily/${d.date} Briefing|${d.date}]]`).join(' · '), '');
if (W.errors.length) L.push('<small>Problems: ' + W.errors.join(' | ') + '</small>', '');
L.push('---', `_Generated ${$now.setZone(S.tz).toFormat('ccc d LLL HH:mm')} by n8n + ${S.model}._`);
fs.mkdirSync(S.folder, { recursive: true });
fs.writeFileSync(S.file, L.join('\n'), 'utf8');
return [{ json: { written: S.file.replace('/vault', 'Vault') } }];
