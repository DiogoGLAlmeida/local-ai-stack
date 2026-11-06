const s = $input.first().json;
const g = s.sections.google || {};
const a = s.sections.app || {};
const part = (o) => o?.text ? o.text : (o?.error ? `[unavailable: ${o.error}]` : '[no data]');
const newsLines = Object.entries(s.sections.news?.items || {})
  .map(([cat, items]) => `## ${cat}\n` + (items.length ? items.map(i => `- ${i.title} (${i.source}): ${i.summary}`).join('\n') : '- nothing new'))
  .join('\n');
const gh = (s.sections.github || []).map(r => `${r.repo}: ${r.issues.length} open issues, ${r.prs.length} open PRs, `
  + `${r.commits.length} new commits${r.commits.length ? ' (' + r.commits.map(c => c.message).join('; ') + ')' : ''}`).join('\n');

const prompt = `Today is ${s.dayName}. Write my daily briefing in English, in Markdown, using ONLY the data below.
Never invent events, tasks, emails, news or numbers. If a part says unavailable or no data, say so in one short line.
Copy facts exactly: keep the same words for weather ("light rain" stays "light rain", never "heavy"), counts and names.
Keep each news item under the category it is listed in (for example, security stories are Security, not Tech).

Output exactly these two sections:
### Highlights
3 to 5 short bullets, each starting with its category in bold (**Weather**, **Calendar**, **Tasks**, **Email**, **GitHub**, **CI**, **Security**, **Politics**, **Markets**, **Local AI**, **Tech**, **CS2**, **YouTube**): the most important things for my day.
Only include things that actually happened or are coming up. NEVER write a highlight that just says there is nothing (no "no events", "no tasks", "nothing important"). A failed CI run or a newly exploited (KEV) bug affecting my software comes first.
### Today
**Calendar:** bullets with time and title (or "No events").
**Tasks:** bullets (or "No open tasks").
**Email:** bullets "Sender – Subject" for messages that look personal or important; skip newsletters (or "Nothing important").

DATA
[Weather] ${s.sections.weather?.text || 'unavailable'}
[Calendar]
${part(g.calendar)}
[Tasks]
${part(g.tasks)}
[Unread email]
${part(g.email)}
[GitHub]
${gh || 'no data'}
[News]
${newsLines}
[CI runs] ${(a.ci || []).map(w => `${w.repo} ${w.name}@${w.branch}: ${w.result}`).join('; ') || 'no data'}
[Newly exploited vulnerabilities (CISA KEV)] ${(a.kev || []).map(k => `${k.id} ${k.what}${k.ransomware ? ' (ransomware)' : ''}`).join('; ') || 'none'}
[New CVEs in software I use] ${(a.watch || []).map(x => `${x.id} CVSS ${x.cvss ?? '?'} (${x.watch.join('/')})${x.kev ? ' KEV' : ''}`).join('; ') || 'none'}
[Markets] ${(a.markets || []).join(', ') || 'no data'}
[Politics] ${(a.politics || []).map(p => `${p.region}: ${p.text.replace(/\n/g, ' ')}`).join(' | ').slice(0, 3000) || 'no data'}
[New YouTube videos] ${(a.youtube || []).map(v => `${v.channel}: ${v.title} (${v.verdict})`).join('; ') || 'none'}`;

try {
  const r = await this.helpers.httpRequest({ method: 'POST', url: `${s.ollamaUrl}/api/chat`, json: true, timeout: 300000,
    body: { model: s.model, stream: false, think: false, keep_alive: '2m',
      options: { num_ctx: 16384, temperature: 0.2 },
      messages: [{ role: 'user', content: prompt }] } });
  s.summary = (r.message?.content || '').trim();
} catch (e) {
  s.summary = `_Summary unavailable (Ollama: ${e.message})._`;
}
return [{ json: s }];
