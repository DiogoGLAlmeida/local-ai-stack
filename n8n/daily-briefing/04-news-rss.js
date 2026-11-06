const s = $input.first().json;
const since = Date.now() - s.hoursBack * 3600 * 1000;
const decode = (t) => (t || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n))
  .replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const news = {}; const errors = [];
for (const [category, urls] of Object.entries(s.feeds)) {
  news[category] = [];
  for (const url of urls) {
    try {
      let xml = await this.helpers.httpRequest({ url, json: false,
        headers: { 'User-Agent': 'Mozilla/5.0 (local daily briefing)' } });
      if (typeof xml !== 'string') xml = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml);
      const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
      const source = decode(tag(xml.split(/<item|<entry/i)[0], 'title')) || new URL(url).hostname;
      let count = 0;
      for (const b of blocks) {
        if (count >= s.itemsPerFeed) break;
        const title = decode(tag(b, 'title'));
        let link = decode(tag(b, 'link'));
        if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ''; }
        const dateStr = decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
        const t = Date.parse(dateStr);
        if (!isNaN(t) && t < since) continue;
        const summary = decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 300);
        if (title && link) { news[category].push({ title, link, source, summary }); count++; }
      }
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }
}
s.sections.news = { items: news, errors };
return [{ json: s }];
