const fs = require('fs');

const N = {
  cacheFile: '/home/node/.n8n/mailapp-news.json',
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.5:9b',
  fetchEveryMin: 30,
  summariseEveryHours: 2,
  hoursBack: 24,

  feeds: [

    { cat: 'Cybersecurity', sub: 'News', name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    { cat: 'Cybersecurity', sub: 'News', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { cat: 'Cybersecurity', sub: 'News', name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
    { cat: 'Cybersecurity', sub: 'News', name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
    { cat: 'Cybersecurity', sub: 'Analysis', name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },

    { cat: 'Politics', sub: 'Portugal', name: 'Público', lean: 'left', url: 'https://feeds.feedburner.com/PublicoRSS' },
    { cat: 'Politics', sub: 'Portugal', name: 'RTP Notícias', lean: 'centre', url: 'https://www.rtp.pt/noticias/rss' },
    { cat: 'Politics', sub: 'Portugal', name: 'Expresso', lean: 'centre', url: 'https://expresso.pt/rss' },
    { cat: 'Politics', sub: 'Portugal', name: 'Observador', lean: 'right', url: 'https://observador.pt/feed/' },
    { cat: 'Politics', sub: 'Europe', name: 'Politico Europe', lean: 'centre', url: 'https://www.politico.eu/section/politics/feed/' },
    { cat: 'Politics', sub: 'Europe', name: 'Euronews', lean: 'centre', url: 'https://www.euronews.com/rss?level=theme&name=news' },
    { cat: 'Politics', sub: 'World', name: 'BBC World', lean: 'centre', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { cat: 'Politics', sub: 'World', name: 'The Guardian', lean: 'left', url: 'https://www.theguardian.com/world/rss' },
    { cat: 'Politics', sub: 'World', name: 'Al Jazeera', lean: 'left', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { cat: 'Politics', sub: 'World', name: 'The Telegraph', lean: 'right', url: 'https://www.telegraph.co.uk/news/rss.xml' },
    { cat: 'Politics', sub: 'US', name: 'NPR', lean: 'left', url: 'https://feeds.npr.org/1014/rss.xml' },
    { cat: 'Politics', sub: 'US', name: 'Politico', lean: 'left', url: 'https://rss.politico.com/politics-news.xml' },
    { cat: 'Politics', sub: 'US', name: 'The Hill', lean: 'centre', url: 'https://thehill.com/news/feed' },
    { cat: 'Politics', sub: 'US', name: 'Fox News', lean: 'right', url: 'https://moxie.foxnews.com/google-publisher/politics.xml' },

    { cat: 'Markets', sub: 'News', name: 'CNBC Markets', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
    { cat: 'Markets', sub: 'News', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
    { cat: 'Markets', sub: 'News', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },

    { cat: 'AI', sub: 'Industry', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
    { cat: 'AI', sub: 'Industry', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
    { cat: 'AI', sub: 'Industry', name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/' },
    { cat: 'AI', sub: 'Open models', name: 'Ollama releases', url: 'https://github.com/ollama/ollama/releases.atom' },
    { cat: 'AI', sub: 'Open models', name: 'Hugging Face blog', url: 'https://huggingface.co/blog/feed.xml' },
    { cat: 'AI', sub: 'Research', name: 'arXiv cs.AI / cs.CL', url: 'https://rss.arxiv.org/rss/cs.AI+cs.CL', max: 25, hours: 48 },
    { cat: 'AI', sub: 'Research', name: 'arXiv cs.CR (security)', url: 'https://rss.arxiv.org/rss/cs.CR', max: 15, hours: 48 },
  ],
  markets: [
    ['S&P 500', '^GSPC'], ['Nasdaq', '^IXIC'], ['Euro Stoxx 50', '^STOXX50E'], ['PSI (Lisbon)', 'PSI20.LS'],
    ['DAX', '^GDAXI'], ['Bitcoin', 'BTC-USD'], ['EUR/USD', 'EURUSD=X'], ['Gold', 'GC=F'],
  ],
};

const load = () => { try { return JSON.parse(fs.readFileSync(N.cacheFile, 'utf8')); } catch (e) { return {}; } };
const c = load(); const now = Date.now(); const log = [];
c.items = c.items || []; c.summaries = c.summaries || {}; c.errors = c.errors || {};
const decode = (t) => (t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (b, name) => { const m = b.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

if (!c.fetchedAt || now - c.fetchedAt > N.fetchEveryMin * 60000) {
  const fresh = [];
  for (const f of N.feeds) {
    try {
      let xml = await this.helpers.httpRequest({ url: f.url, json: false, timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 (local news reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      if (typeof xml !== 'string') xml = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml);
      const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
      const since = now - (f.hours || N.hoursBack) * 3600000; let n = 0;
      for (const b of blocks) {
        if (n >= (f.max || 12)) break;
        const title = decode(tag(b, 'title'));
        let link = decode(tag(b, 'link')); if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ''; }
        if (!title || !/^https?:\/\//.test(link)) continue;
        const t = Date.parse(decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
        if (!isNaN(t) && t < since) continue;
        fresh.push({ cat: f.cat, sub: f.sub, source: f.name, lean: f.lean || '', title, link, t: isNaN(t) ? now : t,
          summary: decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 280) });
        n++;
      }
      delete c.errors[f.name];
    } catch (e) { c.errors[f.name] = (e.message || 'failed').slice(0, 150); }
  }
  const seen = new Set(); c.items = fresh.filter(i => !seen.has(i.link) && seen.add(i.link)).sort((a, b) => b.t - a.t);
  c.fetchedAt = now; log.push(`fetched ${c.items.length} items, ${Object.keys(c.errors).length} feeds failed`);

  c.markets = [];
  for (const [name, sym] of N.markets) {
    try {
      const r = await this.helpers.httpRequest({ url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`,
        json: true, timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const res = r.chart?.result?.[0]; const closes = (res?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
      const price = res?.meta?.regularMarketPrice ?? closes[closes.length - 1];
      const prev = closes.length > 1 ? closes[closes.length - 2] : res?.meta?.chartPreviousClose;
      c.markets.push({ name, sym, price, change: prev ? (price - prev) / prev * 100 : null, spark: closes.slice(-5), currency: res?.meta?.currency || '' });
    } catch (e) { c.markets.push({ name, sym, error: (e.message || 'failed').slice(0, 80) }); }
  }
}

const groups = {};
for (const i of c.items) { const k = i.cat === 'Politics' ? `Politics/${i.sub}` : i.cat; (groups[k] = groups[k] || []).push(i); }
for (const [k, items] of Object.entries(groups)) {
  const sig = items.slice(0, 40).map(i => i.link).join('|');
  const old = c.summaries[k];
  if (old && (old.sig === sig || now - old.at < N.summariseEveryHours * 3600000)) continue;
  const list = items.slice(0, 50).map(i => `- [${i.source}${i.lean ? ', ' + i.lean + '-leaning' : ''}] ${i.title}${i.summary ? ' — ' + i.summary.slice(0, 160) : ''}`).join('\n');
  const isPol = k.startsWith('Politics');
  const extra = isPol
    ? `Group by story. When sources with different leanings cover the same story, add one neutral line on how their framing differs, attributing it to the sources by name ("Observador stresses…, Público focuses on…"). Do not take sides or add opinions. Translate Portuguese to English.`
    : k === 'Markets' ? 'Focus on what moved markets and why. No investment advice.'
    : k === 'AI' ? 'Separate industry news, open-model releases and notable research papers.'
    : 'Lead with actively exploited vulnerabilities, major breaches and urgent patches.';
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: `${N.ollamaUrl}/api/chat`, json: true, timeout: 300000,
      body: { model: N.model, stream: false, think: false, keep_alive: '2m', options: { num_ctx: 16384, temperature: 0.2 },
        messages: [{ role: 'user', content: `Write a short English briefing of the most important ${k.replace('/', ' – ')} news: 3 to 6 bullets, each one sentence. Use ONLY these headlines; never add facts. ${extra}\n\n${list}` }] } });
    c.summaries[k] = { text: (r.message?.content || '').trim(), at: now, sig };
  } catch (e) { log.push(`summary ${k}: ${e.message}`); }
}
c.updatedAt = now;
fs.writeFileSync(N.cacheFile, JSON.stringify(c), 'utf8');
return [{ json: { ok: true, log, items: c.items.length, failedFeeds: c.errors } }];
