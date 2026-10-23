import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export function doctor(directory = root) {
  const required = ['AGENTS.md', 'ENGINEERING_WORKFLOW.md', 'AGENTS/worker.md', 'SKILLS/verify.md', 'PROJECTS/demo.json', 'KNOWLEDGE/projects/demo/README.md'];
  const missing = required.filter(file => {
    try { return !fs.lstatSync(path.join(directory, file)).isFile(); } catch { return true; }
  });
  if (!missing.length) {
    try {
      const profile = JSON.parse(fs.readFileSync(path.join(directory, 'PROJECTS/demo.json'), 'utf8'));
      if (profile.root !== '../capstone-project' || profile.verification?.join(',') !== 'node --test' || profile.cloudFallback !== false || profile.productionWrites !== false) missing.push('valid demo profile');
      if (!fs.existsSync(path.resolve(directory, profile.root, 'package.json'))) missing.push('demo project');
    } catch { missing.push('readable demo profile'); }
  }
  return { ready: missing.length === 0, missing, executesCommands: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = doctor();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
