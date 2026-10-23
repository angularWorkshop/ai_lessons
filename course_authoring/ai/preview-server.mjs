import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routes = new Map([
  ['/', 'ai-course.html'],
  ['/ai-course.html', 'ai-course.html'],
  ...['preview-client.mjs', 'render-browser.mjs', 'lesson-html.mjs', 'course.mjs', 'extension.mjs', 'depth.mjs', 'walkthroughs.mjs'].map(file => [`/course_authoring/ai/${file}`, `course_authoring/ai/${file}`]),
  ...['runtime.mjs', 'labs.mjs', 'extension-runtime.mjs', 'extension-labs.mjs', 'depth-labs.mjs'].map(file => [`/ai_lessons/${file}`, `ai_lessons/${file}`]),
  ...['LOCAL_MODELS.md', 'TRAINING.md', 'FINETUNING.md', 'ADVANCED_ACCEPTANCE.md', 'agent-os-example/README.md'].map(file => [`/ai_lessons/${file}`, `ai_lessons/${file}`]),
]);
const server = http.createServer((req, res) => {
  const file = routes.get(new URL(req.url, 'http://localhost').pathname);
  if (req.method !== 'GET' || !file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.md') ? 'text/plain; charset=utf-8' : 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'" });
  res.end(fs.readFileSync(path.join(root, file)));
});
server.listen(4313, '127.0.0.1', () => console.log('AI course preview: http://127.0.0.1:4313'));
