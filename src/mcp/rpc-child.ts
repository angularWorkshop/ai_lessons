// Дочерний процесс для npm run rpc-demo. Читает stdin, пишет stdout, логи — в stderr.
import { setTimeout as delay } from 'node:timers/promises';
import { ErrorCode, JsonRpcError, JsonRpcPeer } from './jsonrpc.ts';

const peer = new JsonRpcPeer(process.stdin, process.stdout);

// Параметры пришли из чужого процесса: проверяем, а не верим типам.
function numbers(params: unknown, ...names: string[]): number[] {
  const values = names.map((name) => (params as Record<string, unknown> | undefined)?.[name]);
  if (!values.every((value) => typeof value === 'number')) {
    throw new JsonRpcError(ErrorCode.InvalidParams, `Invalid params: нужны числа ${names.join(', ')}`);
  }
  return values as number[];
}

peer.onRequest('add', (params) => {
  const [a, b] = numbers(params, 'a', 'b');
  return { sum: a + b };
});

peer.onRequest('sleep', async (params) => {
  const [ms] = numbers(params, 'ms');
  await delay(ms);
  return { slept: ms };
});

// Ребёнок тоже может спросить: перед ответом он сам отправляет запрос родителю.
peer.onRequest('greet', async () => {
  const { name } = await peer.request<{ name: string }>('whoami');
  peer.notify('log', { text: `родитель представился: ${name}` });
  return { text: `Привет, ${name}!` };
});

// stdout занят протоколом, поэтому отладочный вывод — только в stderr.
console.error(`[child] pid ${process.pid} готов`);
process.stdin.on('end', () => console.error('[child] stdin закрыт, выхожу'));
