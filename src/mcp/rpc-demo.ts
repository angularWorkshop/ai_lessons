// Два процесса говорят по JSON-RPC через stdin/stdout. Запуск: npm run rpc-demo
import { JsonRpcError } from './jsonrpc.ts';
import { spawnTsPeer } from './spawn.ts';

const { peer, child, stop } = spawnTsPeer('src/mcp/rpc-child.ts', [], {
  timeoutMs: 5000,
  trace: (direction, line) => console.log(`${direction === 'out' ? '→' : '←'} ${line}`),
});

peer.onRequest('whoami', () => ({ name: 'rpc-demo' }));
peer.onNotification('log', (params) => console.log(`  (уведомление: ${(params as { text: string }).text})`));

async function step(title: string, run: () => Promise<unknown>) {
  console.log(`\n# ${title}`);
  try {
    console.log('  результат:', JSON.stringify(await run()));
  } catch (error) {
    const code = error instanceof JsonRpcError ? ` ${error.code}` : '';
    console.log(`  ошибка${code}: ${(error as Error).message}`);
  }
}

await step('Запрос и ответ', () => peer.request('add', { a: 2, b: 3 }));
await step('Встречный запрос и уведомление', () => peer.request('greet'));
await step('Два запроса сразу: ответы приходят в другом порядке', () =>
  Promise.all([peer.request('sleep', { ms: 300 }), peer.request('add', { a: 40, b: 2 })]),
);
await step('Неизвестный метод', () => peer.request('multiply', { a: 2, b: 3 }));
await step('Неверные параметры', () => peer.request('add', { a: 2, b: 'три' }));
await step('Таймаут', () => peer.request('sleep', { ms: 1500 }, { timeoutMs: 500 }));

console.log('\n# Сломанная строка прямо в stdin');
const broken = '{"jsonrpc": "2.0", "id": 99, "method": ';
console.log(`→ ${broken}`);
child.stdin!.write(broken + '\n');
await new Promise((resolve) => setTimeout(resolve, 1200));

console.log(`\nКод выхода ребёнка: ${await stop()}`);
