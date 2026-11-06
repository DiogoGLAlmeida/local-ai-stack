const fs = require('fs');
const s = $input.first().json;
const read = (f) => { try { return JSON.parse(fs.readFileSync(`/home/node/.n8n/${f}`, 'utf8')); } catch (e) { return null; } };
const day = 864e5, now = Date.now();
const news = read('mailapp-news.json'), vul = read('mailapp-vulns.json'), yt = read('mailapp-youtube.json'), gh = read('mailapp-github.json');
const app = {};
if (news?.markets?.length) app.markets = news.markets.filter(m => !m.error && m.change != null)
  .map(m => `${m.name} ${m.change >= 0 ? '▲' : '▼'}${Math.abs(m.change).toFixed(2)}%`);
if (news?.summaries) {
  app.politics = Object.entries(news.summaries).filter(([k]) => k.startsWith('Politics/')).map(([k, v]) => ({ region: k.split('/')[1], text: v.text }));
  if (news.summaries.Markets) app.marketNews = news.summaries.Markets.text;
}
if (vul) {
  const since = new Date(now - 2 * day).toISOString().slice(0, 10);
  app.kev = (vul.kev || []).filter(k => k.added >= since).map(k => ({ id: k.id, what: `${k.vendor} ${k.product} – ${k.name}`, ransomware: k.ransomware }));
  app.watch = Object.values(vul.cves || {}).filter(x => x.watch?.length && Date.parse(x.published) >= now - day).map(x => ({ id: x.id, cvss: x.cvss, watch: x.watch, kev: x.kev }));
}
if (gh?.repos) app.ci = gh.repos.flatMap(r => (r.health || []).map(w => ({ repo: r.repo, name: w.name, branch: w.branch, result: w.status !== 'completed' ? w.status : w.conclusion, url: w.url })));
if (yt?.videos) app.youtube = yt.videos.filter(v => v.t >= now - day && v.verdict !== 'skip').map(v => ({ title: v.title, channel: v.channel, link: v.link, verdict: v.verdict, why: v.why }));
s.sections.app = app;
return [{ json: s }];
