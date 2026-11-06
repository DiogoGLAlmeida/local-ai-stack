const tz = 'Europe/Lisbon';
const now = $now.setZone(tz);
return [{ json: {
  date: now.toFormat('yyyy-MM-dd'),
  dayName: now.toFormat('cccc, d LLLL yyyy'),
  tz,
  vaultFolder: '/vault/Daily',
  city: 'Guimarães', lat: 41.4425, lon: -8.2918,
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.5:9b',
  googleMcpUrl: 'http://mcp-google:8000/mcp',
  githubRepos: ['your-user/your-repo'],
  hoursBack: 24,
  itemsPerFeed: 4,
  feeds: {
    'Local AI': [
      'https://github.com/ollama/ollama/releases.atom',
      'https://huggingface.co/blog/feed.xml',
    ],
    'Cybersecurity': [
      'https://www.bleepingcomputer.com/feed/',
      'https://feeds.feedburner.com/TheHackersNews',
    ],
    'Tech': [
      'https://feeds.arstechnica.com/arstechnica/index',
      'https://www.theverge.com/rss/index.xml',
    ],
    'CS2 / Esports': [
      'https://www.hltv.org/rss/news',
    ],
  },
  sections: {},
}}];
