// «Старый» MCP-сервер для тестов темы 11.3: только initialize, tools/list и tools/call, без _meta —
// так отвечают серверы на первой версии официального SDK. Обычный JS, чтобы запускаться без tsx.
// Аргумент stubborn — сервер не выходит ни по закрытию stdin, ни по SIGTERM.
import { createInterface } from 'node:readline';

const stubborn = process.argv.includes('stubborn');
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
const text = (value) => ({ content: [{ type: 'text', text: value }], isError: false });

const tools = [
  { name: 'env', description: 'Переменные окружения сервера, JSON', inputSchema: { type: 'object', properties: {} } },
  { name: 'pid', description: 'PID процесса сервера', inputSchema: { type: 'object', properties: {} } },
];

createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) {
    return; // уведомления, например notifications/initialized
  }
  switch (method) {
    case 'initialize':
      return send({
        id,
        result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'old-server', version: '0.1.0' } },
      });
    case 'tools/list':
      return send({ id, result: { tools } });
    case 'tools/call':
      return send({ id, result: text(params.name === 'pid' ? String(process.pid) : JSON.stringify(process.env)) });
    default:
      return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
});

if (stubborn) {
  process.on('SIGTERM', () => console.error('[old-server] SIGTERM? не выйду'));
  setInterval(() => {}, 1000);
}
