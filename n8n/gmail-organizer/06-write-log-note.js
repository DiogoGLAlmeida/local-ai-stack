const fs = require('fs');
const S = $input.first().json;
const L = [];
L.push('---', `week: ${S.week}`, 'tags: [gmail, organizer]', '---', '', `# Gmail organizer · ${S.week}`, '');
L.push(S.dryRun ? '> **Dry run:** nothing was changed in Gmail. Check the plan below, then set `dryRun: false` in the Settings step.'
                : '> Changes were made in Gmail (labels/filters below). New mail from these senders is labelled automatically.', '');
L.push(`Looked at ${S.stats.messages} emails from ${S.stats.senders} senders · ${S.stats.alreadyFiltered} already had a filter · ${S.candidates.length} candidates (≥ ${S.minEmailsPerSender} emails).`, '');
const byLabel = {};
for (const p of S.planned) (byLabel[p.label] = byLabel[p.label] || []).push(p);
L.push(S.dryRun ? '## Planned filters' : '## Filters created');
for (const [label, items] of Object.entries(byLabel)) {
  L.push(`**${label}**`);
  for (const p of items) {
    const ok = S.dryRun || S.result.createdFilters.some(f => f.sender === p.sender);
    L.push(`- ${ok ? '' : '❌ '}\`from:${p.sender}\` (${p.name}, ${p.count} emails)`);
  }
  L.push('');
}
if (!S.planned.length) L.push('_Nothing new to organise._', '');
const skipped = S.candidates.filter(c => !S.assignments[c.key] || S.assignments[c.key] === 'none');
if (skipped.length) L.push('## Left unlabelled', ...skipped.map(c => `- ${c.key} (${c.name}, ${c.count})`), '');
if (S.result.createdLabels.length) L.push(`**New labels:** ${S.result.createdLabels.join(', ')}`, '');
if (S.result.errors.length) L.push('## Problems', ...S.result.errors.map(e => `- ${e}`), '');
L.push('## Undo', '- Gmail → Settings → **Filters and Blocked Addresses** → delete the filter.',
  '- Labels: Gmail → Settings → **Labels** → remove.',
  '- To label **older** mail too: open a filter → Continue → tick **Also apply filter to matching conversations**.');
fs.mkdirSync(S.logFolder, { recursive: true });
fs.writeFileSync(S.logFile, L.join('\n'), 'utf8');
return [{ json: { log: S.logFile.replace('/vault', 'Vault'), dryRun: S.dryRun, planned: S.planned.length, created: S.result.createdFilters.length } }];
