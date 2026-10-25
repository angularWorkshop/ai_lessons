// MCP-сервер по stdio. Обычно его запускает клиент — агент или npm run mcp-demo — дочерним процессом.
// Запустить руками: npm run mcp-server, потом вставлять JSON-строки в терминал. Выход — Ctrl+D.
import { JsonRpcPeer } from './jsonrpc.ts';
import { serveMcp } from './server.ts';
import { projectTools } from './tools.ts';

// Корень проекта — первый аргумент или текущая папка.
const root = process.argv[2] ?? process.cwd();

serveMcp(
  new JsonRpcPeer(process.stdin, process.stdout),
  projectTools(root),
  { name: 'edutec-project', version: '1.0.0' },
  'Файлы проекта и заметки. Пути — относительно корня проекта.',
);

// stdout занят протоколом: всё для человека — в stderr.
console.error(`[mcp] сервер готов, корень проекта: ${root}`);
