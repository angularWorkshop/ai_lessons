import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { encodeMessage, ErrorCode, JsonRpcError, JsonRpcPeer, parseMessage } from '../src/mcp/jsonrpc.ts';
import { spawnTsPeer } from '../src/mcp/spawn.ts';

// «Другая сторона» без процессов: два потока в памяти. В stdin пишем руками, из stdout читаем строки.
function wire() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const lines: string[] = [];
  let rest = '';
  stdout.on('data', (chunk: Buffer) => {
    const parts = (rest + chunk.toString('utf8')).split('\n');
    rest = parts.pop() ?? '';
    lines.push(...parts);
  });
  const sent = () => lines.map((line) => JSON.parse(line));
  // Дождаться, пока сторона напишет n строк.
  async function waitFor(n: number) {
    for (let i = 0; i < 100 && lines.length < n; i++) {
      await delay(5);
    }
    return sent();
  }
  return { stdin, stdout, lines, sent, waitFor };
}

// Две стороны, соединённые друг с другом напрямую.
function pair() {
  const aToB = new PassThrough();
  const bToA = new PassThrough();
  return { a: new JsonRpcPeer(bToA, aToB), b: new JsonRpcPeer(aToB, bToA) };
}

const line = (message: unknown) => JSON.stringify(message) + '\n';

describe('Шаг 1 / Step 1. parseMessage', () => {
  it('различает запрос, уведомление и ответ', () => {
    const request = parseMessage('{"jsonrpc":"2.0","id":1,"method":"add","params":{"a":2,"b":3}}');
    assert.deepEqual(request, { jsonrpc: '2.0', id: 1, method: 'add', params: { a: 2, b: 3 } });
    assert.ok('id' in request && 'method' in request);

    const notification = parseMessage('{"jsonrpc":"2.0","method":"log","params":{"text":"hi"}}');
    assert.ok(!('id' in notification));

    const ok = parseMessage('{"jsonrpc":"2.0","id":"a1","result":{"sum":5}}');
    assert.deepEqual(ok, { jsonrpc: '2.0', id: 'a1', result: { sum: 5 } });
    const failed = parseMessage('{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}');
    assert.equal((failed as { error: { code: number } }).error.code, -32700);
  });

  it('не JSON — ParseError -32700', () => {
    assert.throws(
      () => parseMessage('{"jsonrpc": "2.0", "id": 1, "method": '),
      (error: unknown) => error instanceof JsonRpcError && error.code === ErrorCode.ParseError,
    );
  });

  it('JSON, но не JSON-RPC 2.0 — InvalidRequest -32600', () => {
    for (const bad of [
      '[1, 2]',
      '"hello"',
      '{"id":1,"method":"add"}',
      '{"jsonrpc":"1.0","id":1,"method":"add"}',
      '{"jsonrpc":"2.0","id":null,"method":"add"}',
      '{"jsonrpc":"2.0","id":{"x":1},"method":"add"}',
      '{"jsonrpc":"2.0","id":1,"method":"add","params":"a,b"}',
      '{"jsonrpc":"2.0","id":1}',
    ]) {
      assert.throws(
        () => parseMessage(bad),
        (error: unknown) => error instanceof JsonRpcError && error.code === ErrorCode.InvalidRequest,
        bad,
      );
    }
  });
});

describe('Шаг 2 / Step 2. encodeMessage', () => {
  it('одно сообщение — ровно одна строка, даже если в тексте есть переводы строк', () => {
    const encoded = encodeMessage({ jsonrpc: '2.0', id: 1, result: { text: 'строка 1\nстрока 2\r\n' } });
    assert.ok(encoded.endsWith('\n'));
    assert.equal(encoded.split('\n').length, 2, 'перевод строки только в конце');
    assert.deepEqual(JSON.parse(encoded), { jsonrpc: '2.0', id: 1, result: { text: 'строка 1\nстрока 2\r\n' } });
  });
});

describe('Шаг 3 / Step 3. Входящие сообщения', () => {
  it('собирает строку из кусков, даже разрезанных посреди буквы', async () => {
    const { stdin, stdout, waitFor } = wire();
    const seen: unknown[] = [];
    new JsonRpcPeer(stdin, stdout).onRequest('echo', (params) => {
      seen.push(params);
      return params;
    });

    const bytes = Buffer.from(line({ jsonrpc: '2.0', id: 1, method: 'echo', params: { text: 'привет' } }));
    // Режем по 7 байт: разрезы попадут и в середину JSON, и в середину кириллической буквы.
    for (let i = 0; i < bytes.length; i += 7) {
      stdin.write(bytes.subarray(i, i + 7));
      await delay(1);
    }
    const [reply] = await waitFor(1);
    assert.deepEqual(seen, [{ text: 'привет' }]);
    assert.deepEqual(reply, { jsonrpc: '2.0', id: 1, result: { text: 'привет' } });
  });

  it('два сообщения в одном куске — два ответа, у каждого свой id', async () => {
    const { stdin, stdout, waitFor } = wire();
    new JsonRpcPeer(stdin, stdout).onRequest('add', (params) => {
      const { a, b } = params as { a: number; b: number };
      return { sum: a + b };
    });
    stdin.write(
      line({ jsonrpc: '2.0', id: 'x', method: 'add', params: { a: 1, b: 2 } }) +
        line({ jsonrpc: '2.0', id: 7, method: 'add', params: { a: 3, b: 4 } }),
    );
    const replies = await waitFor(2);
    assert.deepEqual(
      replies.sort((p, q) => String(p.id).localeCompare(String(q.id))),
      [
        { jsonrpc: '2.0', id: 7, result: { sum: 7 } },
        { jsonrpc: '2.0', id: 'x', result: { sum: 3 } },
      ],
    );
  });

  it('неизвестный метод — ошибка -32601 с тем же id', async () => {
    const { stdin, stdout, waitFor } = wire();
    new JsonRpcPeer(stdin, stdout);
    stdin.write(line({ jsonrpc: '2.0', id: 5, method: 'multiply' }));
    const [reply] = await waitFor(1);
    assert.equal(reply.id, 5);
    assert.equal(reply.error.code, -32601);
    assert.equal(reply.result, undefined);
  });

  it('JsonRpcError из обработчика уходит со своим кодом, любая другая ошибка — -32603', async () => {
    const { stdin, stdout, waitFor } = wire();
    new JsonRpcPeer(stdin, stdout)
      .onRequest('strict', () => {
        throw new JsonRpcError(ErrorCode.InvalidParams, 'Invalid params: нужен path', { field: 'path' });
      })
      .onRequest('buggy', () => {
        throw new Error('что-то сломалось');
      });
    stdin.write(line({ jsonrpc: '2.0', id: 1, method: 'strict', params: {} }));
    stdin.write(line({ jsonrpc: '2.0', id: 2, method: 'buggy' }));
    const replies = await waitFor(2);
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    assert.deepEqual(byId.get(1).error, { code: -32602, message: 'Invalid params: нужен path', data: { field: 'path' } });
    assert.equal(byId.get(2).error.code, -32603);
    assert.match(byId.get(2).error.message, /что-то сломалось/);
  });

  it('сломанный JSON — ответ -32700 с id: null, и чтение продолжается', async () => {
    const { stdin, stdout, waitFor } = wire();
    new JsonRpcPeer(stdin, stdout).onRequest('ping', () => ({}));
    stdin.write('{"jsonrpc": "2.0", "id": 99, "method": \n');
    stdin.write(line({ jsonrpc: '2.0', id: 3, method: 'ping' }));
    const replies = await waitFor(2);
    assert.deepEqual(replies[0], { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    assert.deepEqual(replies[1], { jsonrpc: '2.0', id: 3, result: {} });
  });

  it('на уведомление не отвечают — даже если обработчика нет или он упал', async () => {
    const { stdin, stdout, lines } = wire();
    const got: unknown[] = [];
    new JsonRpcPeer(stdin, stdout)
      .onNotification('log', (params) => {
        got.push(params);
      })
      .onNotification('crash', () => {
        throw new Error('boom');
      });
    stdin.write(line({ jsonrpc: '2.0', method: 'log', params: { text: 'hi' } }));
    stdin.write(line({ jsonrpc: '2.0', method: 'crash' }));
    stdin.write(line({ jsonrpc: '2.0', method: 'unknown' }));
    await delay(30);
    assert.deepEqual(got, [{ text: 'hi' }]);
    assert.deepEqual(lines, []);
  });
});

describe('Шаг 4 / Step 4. request и notify', () => {
  it('request пишет запрос с новым id и ждёт ответ с этим id', async () => {
    const { stdin, stdout, waitFor } = wire();
    const peer = new JsonRpcPeer(stdin, stdout);
    const first = peer.request('add', { a: 2, b: 3 });
    const second = peer.request('add', { a: 40, b: 2 });
    const [r1, r2] = await waitFor(2);
    assert.equal(r1.method, 'add');
    assert.deepEqual(r1.params, { a: 2, b: 3 });
    assert.notEqual(r1.id, r2.id);
    // Отвечаем в обратном порядке: сопоставление — только по id.
    stdin.write(line({ jsonrpc: '2.0', id: r2.id, result: { sum: 42 } }));
    stdin.write(line({ jsonrpc: '2.0', id: r1.id, result: { sum: 5 } }));
    assert.deepEqual(await first, { sum: 5 });
    assert.deepEqual(await second, { sum: 42 });
  });

  it('ответ с error — reject с JsonRpcError, код и data сохраняются', async () => {
    const { stdin, stdout, waitFor } = wire();
    const pending = new JsonRpcPeer(stdin, stdout).request('multiply');
    const [request] = await waitFor(1);
    stdin.write(line({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found', data: 'multiply' } }));
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof JsonRpcError);
      assert.equal(error.code, -32601);
      assert.equal(error.data, 'multiply');
      return true;
    });
  });

  it('нет ответа дольше timeoutMs — TimeoutError, опоздавший ответ игнорируется', async () => {
    const { stdin, stdout, waitFor } = wire();
    const peer = new JsonRpcPeer(stdin, stdout, { timeoutMs: 1000 });
    const started = Date.now();
    const slow = peer.request('sleep', { ms: 5000 }, { timeoutMs: 50 });
    await assert.rejects(slow, (error: Error) => error.name === 'TimeoutError' && !(error instanceof JsonRpcError));
    assert.ok(Date.now() - started < 900, 'таймаут из опций запроса важнее таймаута по умолчанию');

    const [request] = await waitFor(1);
    stdin.write(line({ jsonrpc: '2.0', id: request.id, result: { slept: 5000 } }));
    // Следующий запрос работает как обычно.
    const next = peer.request('ping');
    const [, ping] = await waitFor(2);
    stdin.write(line({ jsonrpc: '2.0', id: ping.id, result: { ok: true } }));
    assert.deepEqual(await next, { ok: true });
  });

  it('notify пишет сообщение без id', async () => {
    const { stdin, stdout, waitFor } = wire();
    new JsonRpcPeer(stdin, stdout).notify('notifications/initialized');
    const [message] = await waitFor(1);
    assert.deepEqual(message, { jsonrpc: '2.0', method: 'notifications/initialized' });
  });

  it('две стороны спрашивают друг друга одновременно', async () => {
    const { a, b } = pair();
    a.onRequest('whoami', () => ({ name: 'a' }));
    b.onRequest('greet', async () => {
      const { name } = await b.request<{ name: string }>('whoami');
      return { text: `Привет, ${name}!` };
    });
    assert.deepEqual(await a.request('greet'), { text: 'Привет, a!' });
  });
});

describe('Шаг 5 / Step 5. Закрытие', () => {
  it('конец входного потока будит всех, кто ждёт ответа', async () => {
    const { stdin, stdout, waitFor } = wire();
    const peer = new JsonRpcPeer(stdin, stdout, { timeoutMs: 10_000 });
    const pending = peer.request('sleep');
    await waitFor(1);
    stdin.end();
    await assert.rejects(pending, (error: Error) => error.name === 'ConnectionClosedError');
    assert.equal(peer.closed, true);
    await assert.rejects(peer.request('ping'), (error: Error) => error.name === 'ConnectionClosedError');
  });

  it('close() закрывает выходной поток', async () => {
    const { stdin, stdout } = wire();
    const peer = new JsonRpcPeer(stdin, stdout);
    const ended = new Promise((resolve) => stdout.once('finish', resolve));
    peer.close();
    await ended;
    assert.equal(peer.closed, true);
  });
});

describe('Шаг 6 / Step 6. Настоящий процесс', () => {
  it('spawn: запросы к дочернему node-процессу и выход по закрытию stdin', { timeout: 30_000 }, async () => {
    const { peer, stop } = spawnTsPeer('src/mcp/rpc-child.ts', [], { timeoutMs: 20_000 });
    let stopped = false;
    try {
      peer.onRequest('whoami', () => ({ name: 'test' }));
      assert.deepEqual(await peer.request('add', { a: 2, b: 3 }), { sum: 5 });
      assert.deepEqual(await peer.request('greet'), { text: 'Привет, test!' });
      await assert.rejects(peer.request('add', { a: 2 }), (error: unknown) => error instanceof JsonRpcError && error.code === -32602);
      stopped = true;
      assert.equal(await stop(10_000), 0, 'ребёнок вышел сам, когда закрылся его stdin');
    } finally {
      // Упал тест — всё равно не оставляем процесс висеть.
      if (!stopped) {
        await stop(1000);
      }
    }
  });
});
