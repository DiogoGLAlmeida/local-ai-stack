const tz = 'Europe/Lisbon';
const now = $now.setZone(tz);
let manual = false; try { manual = $('Test run').isExecuted; } catch (e) {}

const target = (now.weekday === 7 && now.hour >= 18) || manual ? now : now.minus({ weeks: 1 });
const S = {
  tz, week: target.toFormat("kkkk-'W'WW"), start: target.startOf('week').toISO(), end: target.endOf('week').toISO(),
  nextStart: target.startOf('week').plus({ weeks: 1 }).toISO(), nextEnd: target.endOf('week').plus({ weeks: 1 }).toISO(),
  folder: '/vault/Weekly', dailyFolder: '/vault/Daily', readLaterFolder: '/vault/Read later', inboxNote: '/vault/Inbox.md', gmailLogFolder: '/vault/Gmail',
  appCache: '/home/node/.n8n',
  googleMcpUrl: 'http://mcp-google:8000/mcp',
  ollamaUrl: 'http://host.docker.internal:11434',
  model: 'qwen3.8:27b',
  manual,
};
S.file = `${S.folder}/${S.week} Review.md`;
const fs = require('fs');
if (!manual && fs.existsSync(S.file)) return [];
if (!manual && now.weekday !== 7 && now.weekday !== 1 && fs.existsSync(S.file)) return [];
return [{ json: S }];
