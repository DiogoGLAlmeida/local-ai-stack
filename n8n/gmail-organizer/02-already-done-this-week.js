const fs = require('fs');
const S = $input.first().json;
const logFile = `${S.logFolder}/${S.week} Organizer.md`;
let manual = false;
try { manual = $('Test run').isExecuted; } catch (e) {}
if (!manual && fs.existsSync(logFile)) return [];
return [{ json: { ...S, logFile, manual } }];
