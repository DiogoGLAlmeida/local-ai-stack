const tz = 'Europe/Lisbon';
const now = $now.setZone(tz);
return [{ json: {
  week: now.toFormat("kkkk-'W'WW"),
  tz,
  logFolder: '/vault/Gmail',
  googleMcpUrl: 'http://mcp-google:8000/mcp',
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.8:27b',
  dryRun: true,

  lookbackQuery: 'newer_than:30d -in:sent -in:drafts -in:chats -in:spam -in:trash',
  maxMessages: 300,
  minEmailsPerSender: 2,
  maxNewFiltersPerRun: 25,
  labels: {
    Finance:     ['banks, payments, invoices, receipts, bills, subscriptions billing, PayPal, MB Way', '#16a766'],
    Shopping:    ['online stores, orders, shipping and delivery updates, marketplaces', '#ffad47'],
    Gaming:      ['Steam, Epic Games, game stores, FACEIT, esports, game publishers and newsletters', '#a479e2'],
    Dev:         ['GitHub, GitLab, CI, developer tools, cloud services, package registries, AI tools', '#4a86e8'],
    Security:    ['security services, password managers, account protection services (not normal companies)', '#fb4c2f'],
    Jobs:        ['job alerts, job boards, recruiters, LinkedIn job emails', '#43d692'],
    Education:   ['universities, schools, online courses, learning platforms', '#fad165'],
    Newsletters: ['newsletters, blogs, media, marketing and promotional emails', '#999999'],
    Social:      ['social networks, forums, communities, Discord, Reddit, LinkedIn social notifications', '#f691b3'],
    Travel:      ['airlines, hotels, trains, buses, booking sites, transport apps', '#cccccc'],
    Personal:    ['individual people writing personally (friends, family)', '#ffffff'],
  },
  freeMailDomains: ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','msn.com','yahoo.com',
    'icloud.com','me.com','proton.me','protonmail.com','sapo.pt','gmx.com','gmx.net','aol.com','mail.com'],
}}];
