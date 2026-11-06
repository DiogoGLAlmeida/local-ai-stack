// Checks the n8n workflows without running them:
//  1. every workflow export (n8n/*.json) is valid JSON with a list of nodes
//  2. the JavaScript in every Code node, and every readable step file (n8n/**/*.js), parses
// n8n runs Code-node scripts inside an async function, so top-level `await` and `return`
// are allowed. We compile them the same way. Nothing is executed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || 'n8n';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const errors = [];
let workflows = 0, codeNodes = 0, stepFiles = 0;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const compiles = (code, where) => {
  try { new AsyncFunction(code); }
  catch (e) { errors.push(`${where}: ${e.message}`); }
};

for (const file of walk(root)) {
  const rel = relative('.', file);
  if (file.endsWith('.json')) {
    let wf;
    try { wf = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); continue; }
    if (!Array.isArray(wf.nodes)) { errors.push(`${rel}: no "nodes" list, not an n8n workflow export`); continue; }
    workflows++;
    for (const node of wf.nodes) {
      const code = node?.parameters?.jsCode;
      if (typeof code === 'string') { codeNodes++; compiles(code, `${rel} > node "${node.name}"`); }
    }
  } else if (file.endsWith('.js')) {
    stepFiles++;
    compiles(readFileSync(file, 'utf8'), rel);
  }
}

console.log(`Checked ${workflows} workflows, ${codeNodes} Code nodes, ${stepFiles} step files.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('All n8n workflows and code steps parse.');
