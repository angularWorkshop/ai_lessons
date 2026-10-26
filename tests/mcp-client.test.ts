import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { contentText, mcpTool, startMcpServers, toolName } from '../src/mcp/agent-tools.ts';
import { connectStdio, McpClient } from '../src/mcp/client.ts';
import { loadMcpConfig, serverEnv, type McpConfig } from '../src/mcp/config.ts';
import { JsonRpcError, JsonRpcPeer } from '../src/mcp/jsonrpc.ts';
import { serveMcp, type McpTool } from '../src/mcp/server.ts';
import { Toolbox } from '../src/tools.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OLD_SERVER = fileURLToPath(new URL('./support/old-server.mjs', import.meta.url));
const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';

interface Seen {
  method: string;
  params?: any;
  id?: number | string;
}

// Инструменты-заглушки нашего сервера из 11.2.
const fakeTools: McpTool[] = [
  {
    name: 'repeat',
    description: 'Повторить текст несколько раз',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, times: { type: 'integer' } },
      required: ['text'],
      additionalProperties: false,
    },
    run: (args) => String(args.text).repeat(Number(args.times ?? 1)),
  },
  {
    name: 'slow',
    description: 'Отвечает через секунду',
    inputSchema: { type: 'object', properties: {} },
    run: () => delay(1000).then(() => 'готово'),
  },
];

// Клиент и сервер 2026-07-28 в одном процессе. seen — всё, что получил сервер.
function connectNew(tools: McpTool[] = fakeTools, name = 'srv') {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const seen: Seen[] = [];
  serveMcp(
    new JsonRpcPeer(toServer, toClient, { trace: (dir, line) => dir === 'in' && seen.push(JSON.parse(line)) }),
    tools,
    { name: 'test-server', version: '0.0.1' },
    'Тестовый сервер',
  );
  const client = new McpClient(name, new JsonRpcPeer(toClient, toServer, { timeoutMs: 2000 }));
  return { client, seen };
}

// Сервер, которым управляет тест: обработчики задаются руками. Неизвестный метод — -32601, как у старых серверов.
function connectFake(handlers: Record<string, (params: any) => unknown>, timeoutMs = 2000) {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const seen: Seen[] = [];
  const server = new JsonRpcPeer(toServer, toClient, { trace: (dir, line) => dir === 'in' && seen.push(JSON.parse(line)) });
  for (const [method, handler] of Object.entries(handlers)) {
    server.onRequest(method, handler);
  }
  const client = new McpClient('old', new JsonRpcPeer(toClient, toServer, { timeoutMs }));
  return { client, seen };
}

const legacyHandlers = (version = '2025-11-25') => ({
  initialize: () => ({ protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: 'old-server', version: '0.9.0' } }),
  'tools/list': () => ({ tools: [{ name: 'ping', description: 'Пинг', inputSchema: { type: 'object', properties: {} } }] }),
  'tools/call': () => ({ content: [{ type: 'text', text: 'pong' }] }),
});

const methods = (seen: Seen[]) => seen.map((message) => message.method);

describe('Шаг 1 / Step 1. connect: server/discover и откат на initialize', () => {
  it('новый сервер: server/discover с _meta, без рукопожатия', async () => {
    const { client, seen } = connectNew();
    assert.equal(await client.connect(), client, 'connect возвращает сам клиент');
    assert.equal(client.protocolVersion, '2026-07-28');
    assert.equal(client.legacy, false);
    assert.deepEqual(client.serverInfo, { name: 'test-server', version: '0.0.1' });
    assert.equal(client.instructions, 'Тестовый сервер');
    assert.deepEqual(methods(seen), ['server/discover']);
    assert.equal(seen[0].params._meta[VERSION_KEY], '2026-07-28');
  });

  it('старый сервер: discover → -32601 → initialize и notifications/initialized', async () => {
    const { client, seen } = connectFake(legacyHandlers());
    await client.connect();
    assert.deepEqual(methods(seen), ['server/discover', 'initialize', 'notifications/initialized']);
    const init = seen[1].params;
    assert.equal(init.protocolVersion, '2025-11-25');
    assert.deepEqual(init.capabilities, {});
    assert.equal(typeof init.clientInfo?.name, 'string');
    assert.equal(seen[2].id, undefined, 'notifications/initialized — уведомление, без id');
    assert.equal(client.protocolVersion, '2025-11-25');
    assert.equal(client.legacy, true);
    assert.deepEqual(client.serverInfo, { name: 'old-server', version: '0.9.0' });
  });

  it('старый сервер с версией постарше 2025-11-25 — тоже подходит', async () => {
    const { client } = connectFake(legacyHandlers('2025-06-18'));
    await client.connect();
    assert.equal(client.protocolVersion, '2025-06-18');
  });

  it('незнакомая версия в ответ на initialize — ошибка с этой версией', async () => {
    const { client } = connectFake(legacyHandlers('2023-01-01'));
    await assert.rejects(client.connect(), /2023-01-01/);
  });

  it('сервер молчит — это не повод для initialize: ошибка таймаута', async () => {
    const { client, seen } = connectFake({ 'server/discover': () => new Promise(() => {}) }, 200);
    await assert.rejects(client.connect(), (error: Error) => error.name === 'TimeoutError');
    assert.deepEqual(methods(seen), ['server/discover']);
  });
});

describe('Шаг 2 / Step 2. listTools и callTool', () => {
  it('tools/list нового сервера: инструменты со схемами, _meta в запросе', async () => {
    const { client, seen } = connectNew();
    await client.connect();
    const tools = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['repeat', 'slow'],
    );
    assert.deepEqual(tools[0].inputSchema, fakeTools[0].inputSchema);
    assert.equal(seen[1].method, 'tools/list');
    assert.equal(seen[1].params._meta[VERSION_KEY], '2026-07-28');
  });

  it('старый сервер: запросы без _meta', async () => {
    const { client, seen } = connectFake(legacyHandlers());
    await client.connect();
    assert.deepEqual(
      (await client.listTools()).map((tool) => tool.name),
      ['ping'],
    );
    const list = seen.find((message) => message.method === 'tools/list')!;
    assert.equal(list.params?._meta, undefined);
  });

  it('список страницами: клиент идёт по nextCursor до конца', async () => {
    const tool = (name: string) => ({ name, inputSchema: { type: 'object' } });
    const { client, seen } = connectFake({
      ...legacyHandlers(),
      'tools/list': (params) =>
        params?.cursor === 'page-2' ? { tools: [tool('c')] } : { tools: [tool('a'), tool('b')], nextCursor: 'page-2' },
    });
    await client.connect();
    assert.deepEqual(
      (await client.listTools()).map((t) => t.name),
      ['a', 'b', 'c'],
    );
    const cursors = seen.filter((m) => m.method === 'tools/list').map((m) => m.params?.cursor);
    assert.deepEqual(cursors, [undefined, 'page-2']);
  });

  it('callTool: успех, ошибка инструмента (isError) и ошибка протокола', async () => {
    const { client, seen } = connectNew();
    await client.connect();
    const ok = await client.callTool('repeat', { text: 'ab', times: 2 });
    assert.deepEqual(ok.content, [{ type: 'text', text: 'abab' }]);
    assert.equal(ok.isError, false);
    const call = seen.find((m) => m.method === 'tools/call')!;
    assert.deepEqual(call.params.arguments, { text: 'ab', times: 2 });
    assert.equal(call.params._meta[VERSION_KEY], '2026-07-28');

    const bad = await client.callTool('repeat', { text: 42 });
    assert.equal(bad.isError, true);
    await assert.rejects(client.callTool('delete_all', {}), (error: unknown) => error instanceof JsonRpcError && error.code === -32602);
  });

  it('до connect() — понятная ошибка', async () => {
    const { client } = connectNew();
    await assert.rejects(client.listTools(), /connect/);
  });

  it('отмена: callTool отпускает сразу, сервер получает notifications/cancelled', async () => {
    const { client, seen } = connectNew();
    await client.connect();
    const controller = new AbortController();
    const started = Date.now();
    const pending = client.callTool('slow', {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
    assert.ok(Date.now() - started < 900, 'не ждём секунду, пока сервер досчитает');
    await delay(20);
    const call = seen.find((m) => m.method === 'tools/call')!;
    const cancelled = seen.find((m) => m.method === 'notifications/cancelled');
    assert.ok(cancelled, 'серверу сказали, что ответ больше не нужен');
    assert.equal(cancelled.params.requestId, call.id);
  });
});

describe('Шаг 3 / Step 3. Адаптер: MCP-инструмент → Tool', () => {
  it('toolName: префикс сервера и только допустимые символы', () => {
    assert.equal(toolName('project', 'read_file'), 'project__read_file');
    assert.equal(toolName('my.server', 'files.read'), 'my_server__files_read');
  });

  it('модель видит inputSchema как есть, без $schema', async () => {
    const { client } = connectNew();
    await client.connect();
    const [repeat] = await client.listTools();
    const withDialect = { ...repeat, inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...repeat.inputSchema } };
    const toolbox = new Toolbox().register(mcpTool(client, withDialect));
    assert.deepEqual(toolbox.specs(), [
      {
        type: 'function',
        function: { name: 'srv__repeat', description: 'Повторить текст несколько раз', parameters: fakeTools[0].inputSchema },
      },
    ]);
  });

  it('вызов уходит на сервер под его собственным именем', async () => {
    const { client, seen } = connectNew();
    await client.connect();
    const toolbox = new Toolbox();
    for (const remote of await client.listTools()) {
      toolbox.register(mcpTool(client, remote));
    }
    const result = await toolbox.execute({ id: 'c1', name: 'srv__repeat', arguments: '{"text":"ой","times":3}' });
    assert.deepEqual(result, { content: 'ойойой', isError: false });
    assert.equal(seen.find((m) => m.method === 'tools/call')!.params.name, 'repeat');
  });

  it('проверку аргументов делает сервер: его текст доходит до модели с isError', async () => {
    const { client } = connectNew();
    await client.connect();
    const [repeat] = await client.listTools();
    const toolbox = new Toolbox().register(mcpTool(client, repeat));
    const result = await toolbox.execute({ id: 'c1', name: 'srv__repeat', arguments: '{"text":42}' });
    assert.equal(result.isError, true);
    assert.match(result.content, /Аргумент text должен быть string/);
  });

  it('аргументы не объект — ошибка без похода на сервер', async () => {
    const { client, seen } = connectNew();
    await client.connect();
    const [repeat] = await client.listTools();
    const toolbox = new Toolbox().register(mcpTool(client, repeat));
    const result = await toolbox.execute({ id: 'c1', name: 'srv__repeat', arguments: '["ой"]' });
    assert.equal(result.isError, true);
    assert.equal(seen.filter((m) => m.method === 'tools/call').length, 0);
  });

  it('два сервера с одинаковым инструментом не сталкиваются', async () => {
    const a = connectNew(fakeTools, 'alpha');
    const b = connectNew(fakeTools, 'beta');
    await Promise.all([a.client.connect(), b.client.connect()]);
    const toolbox = new Toolbox();
    for (const client of [a.client, b.client]) {
      for (const remote of await client.listTools()) {
        toolbox.register(mcpTool(client, remote));
      }
    }
    assert.deepEqual(
      toolbox.specs().map((spec) => spec.function.name),
      ['alpha__repeat', 'alpha__slow', 'beta__repeat', 'beta__slow'],
    );
  });

  it('Ctrl+C посреди вызова: signal из ToolContext доходит до сервера', async () => {
    const { client, seen } = connectNew();
    await client.connect();
    const slow = (await client.listTools()).find((tool) => tool.name === 'slow')!;
    const toolbox = new Toolbox().register(mcpTool(client, slow));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const result = await toolbox.execute({ id: 'c1', name: 'srv__slow', arguments: '{}' }, { signal: controller.signal });
    assert.equal(result.isError, true);
    await delay(20);
    assert.ok(seen.some((m) => m.method === 'notifications/cancelled'));
  });

  it('contentText: текст склеен, остальное — пометкой', () => {
    const text = contentText([
      { type: 'text', text: 'первый' },
      { type: 'image', data: 'iVBOR…', mimeType: 'image/png' },
      { type: 'text', text: 'второй' },
    ]);
    assert.equal(text, 'первый\n[image: image/png]\nвторой');
  });
});

describe('Шаг 4 / Step 4. mcp.json и окружение сервера', () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcp-config-'));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function configIn(text: string): Promise<string> {
    const sub = await mkdtemp(join(dir, 'case-'));
    await writeFile(join(sub, 'mcp.json'), text);
    return sub;
  }

  it('читает серверы: команда, аргументы, окружение', async () => {
    const config = {
      mcpServers: { project: { command: 'node', args: ['server.js'], env: { TOKEN: '${GITHUB_TOKEN}' } } },
    };
    assert.deepEqual(await loadMcpConfig(await configIn(JSON.stringify(config))), config);
  });

  it('проект без mcp.json — серверов нет, это не ошибка', async () => {
    assert.deepEqual(await loadMcpConfig(dir), { mcpServers: {} });
  });

  it('сломанный конфиг — ошибка, которая называет файл и сервер', async () => {
    await assert.rejects(loadMcpConfig(await configIn('{ "mcpServers": ')), /mcp\.json/);
    await assert.rejects(loadMcpConfig(await configIn('{"servers": {}}')), /mcpServers/);
    await assert.rejects(loadMcpConfig(await configIn('{"mcpServers": {"broken": {"args": []}}}')), /broken.*command/);
    await assert.rejects(loadMcpConfig(await configIn('{"mcpServers": {"x": {"command": "node", "args": "a.js"}}}')), /x.*args/);
    await assert.rejects(loadMcpConfig(await configIn('{"mcpServers": {"y": {"command": "node", "env": {"N": 1}}}}')), /y.*env/);
  });

  it('serverEnv: только безопасный минимум и то, что разрешено в конфиге', () => {
    const parent = { PATH: '/usr/bin', HOME: '/home/me', LLM_API_KEY: 'edt_secret', GITHUB_TOKEN: 'ghp_1' };
    assert.deepEqual(serverEnv({ TOKEN: '${GITHUB_TOKEN}', MODE: 'ro', EMPTY: '${NOPE}' }, parent), {
      PATH: '/usr/bin',
      HOME: '/home/me',
      TOKEN: 'ghp_1',
      MODE: 'ro',
      EMPTY: '',
    });
    assert.deepEqual(serverEnv(undefined, parent), { PATH: '/usr/bin', HOME: '/home/me' });
  });
});

describe('Шаг 5 / Step 5. Процессы: запуск, закрытие, конфиг целиком', () => {
  const T = { timeout: 30_000 };

  it('наш сервер из mcp.json проекта: подключение, вызов, выход с кодом 0', T, async () => {
    const config = await loadMcpConfig(ROOT);
    const client = await connectStdio('project', config.mcpServers.project, { cwd: ROOT, timeoutMs: 20_000 });
    try {
      assert.equal(client.protocolVersion, '2026-07-28');
      const result = await client.callTool('list_files', { path: 'tests' });
      assert.match(result.content[0].text!, /mcp-client\.test\.ts/);
    } finally {
      assert.equal(await client.close(), 0, 'сервер вышел сам, когда закрылся его stdin');
    }
  });

  it('старый сервер в отдельном процессе: откат на initialize, ключ агента не утёк', T, async () => {
    const savedKey = process.env.LLM_API_KEY;
    process.env.MCP_TEST_TOKEN = 'token-from-agent';
    process.env.LLM_API_KEY = 'edt_test_key';
    const client = await connectStdio('old', { command: 'node', args: [OLD_SERVER], env: { TOKEN: '${MCP_TEST_TOKEN}' } }, { timeoutMs: 20_000 });
    try {
      assert.equal(client.legacy, true);
      const env = JSON.parse((await client.callTool('env', {})).content[0].text!);
      assert.equal(env.TOKEN, 'token-from-agent');
      assert.equal(env.LLM_API_KEY, undefined, 'ключ к модели серверу не нужен');
      assert.equal(env.MCP_TEST_TOKEN, undefined);
    } finally {
      await client.close();
      delete process.env.MCP_TEST_TOKEN;
      if (savedKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = savedKey;
    }
  });

  it('несуществующая команда — ошибка с именем сервера', T, async () => {
    await assert.rejects(connectStdio('ghost', { command: 'no-such-mcp-server-command' }), /ghost/);
  });

  it('сервер не выходит ни по stdin, ни по SIGTERM — SIGKILL', T, async () => {
    const client = await connectStdio('stubborn', { command: 'node', args: [OLD_SERVER, 'stubborn'] }, { graceMs: 200, timeoutMs: 20_000 });
    const pid = Number((await client.callTool('pid', {})).content[0].text);
    const started = Date.now();
    assert.equal(await client.close(), null, 'убит сигналом — кода выхода нет');
    assert.ok(Date.now() - started < 5000);
    assert.throws(() => process.kill(pid, 0), 'процесса больше нет');
  });

  it('startMcpServers: инструменты в toolbox, сломанный сервер пропущен, close останавливает всех', T, async () => {
    const config: McpConfig = {
      mcpServers: {
        project: (await loadMcpConfig(ROOT)).mcpServers.project,
        ghost: { command: 'no-such-mcp-server-command' },
      },
    };
    const toolbox = new Toolbox();
    const mcp = await startMcpServers(toolbox, config, { cwd: ROOT, timeoutMs: 20_000 });
    try {
      assert.deepEqual(
        toolbox.specs().map((spec) => spec.function.name),
        ['project__list_files', 'project__read_file', 'project__add_note'],
      );
      assert.deepEqual(
        mcp.failed.map((f) => f.name),
        ['ghost'],
      );
      const denied = await toolbox.execute({ id: 'c1', name: 'project__read_file', arguments: '{"path":".env"}' });
      assert.equal(denied.isError, true);
      assert.match(denied.content, /\.env закрыт/);
    } finally {
      await mcp.close();
    }
    const afterClose = await toolbox.execute({ id: 'c2', name: 'project__list_files', arguments: '{}' });
    assert.equal(afterClose.isError, true, 'сервер остановлен — вызов становится ошибкой, а не зависает');
  });

  it('startMcpServers: имя уже занято — сервер не подключается целиком', T, async () => {
    const toolbox = new Toolbox();
    const { mcpServers } = await loadMcpConfig(ROOT);
    const first = await startMcpServers(toolbox, { mcpServers }, { cwd: ROOT, timeoutMs: 20_000 });
    try {
      // Второй раз тот же сервер под тем же именем: все его имена заняты.
      const second = await startMcpServers(toolbox, { mcpServers }, { cwd: ROOT, timeoutMs: 20_000 });
      assert.deepEqual(second.clients, []);
      assert.match(second.failed[0]?.error ?? '', /project__list_files/);
      assert.equal(toolbox.specs().length, 3);
    } finally {
      await first.close();
    }
  });
});
