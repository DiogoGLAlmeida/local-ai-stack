const fs = require('fs');
const path = require('path');
const s = $input.first().json;
const file = path.join(s.vaultFolder, `${s.date} Briefing.md`);
let manual = false;
try { manual = $('Test run').isExecuted; } catch (e) { manual = false; }
if (!manual) {
  if (fs.existsSync(file)) return [];
  if ($now.setZone(s.tz).hour < 6) return [];
}
return [{ json: { ...s, file, manual } }];
