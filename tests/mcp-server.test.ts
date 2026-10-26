import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { JsonRpcError, JsonRpcPeer } from '../src/mcp/jsonrpc.ts';
import { checkArguments, serveMcp, type CallToolResult, type McpTool, type ToolInfo } from '../src/mcp/server.ts';
import { projectTools, safePath } from '../src/mcp/tools.ts';

const INFO = { name: 'test-server', version: '0.0.1' };
const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '0.0.1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

// Инструменты-заглушки для шагов 1–4: проверяем протокол, а не файлы.
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
    name: 'explode',
    description: 'Всегда падает',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      throw new Error('Диск отвалился');
    },
  },
];

// Клиент и сервер в одном процессе: два JsonRpcPeer, соединённые потоками в памяти.
function connect(tools: McpTool[] = fakeTools) {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  serveMcp(new JsonRpcPeer(toServer, toClient), tools, INFO, 'Тестовый сервер');
  const client = new JsonRpcPeer(toClient, toServer, { timeoutMs: 2000 });
  // Обычный запрос нового клиента: _meta в каждом запросе.
  const call = <T = Record<string, any>>(method: string, params: Record<string, unknown> = {}) =>
    client.request<T>(method, { ...params, _meta: META });
  return { client, call };
}

const isRpcError = (code: number) => (error: unknown) => error instanceof JsonRpcError && error.code === code;

describe('Шаг 1 / Step 1. server/discover и _meta в каждом запросе', () => {
  it('server/discover: версии, возможности и подпись сервера', async () => {
    const { call } = connect();
    const result = await call('server/discover');
    assert.equal(result.resultType, 'complete');
    assert.deepEqual(result.supportedVersions, ['2026-07-28', '2025-11-25']);
    assert.deepEqual(result.capabilities, { tools: {} });
    assert.deepEqual(result._meta['io.modelcontextprotocol/serverInfo'], INFO);
    assert.equal(result.instructions, 'Тестовый сервер');
  });

  it('запрос без _meta — ошибка -32602', async () => {
    const { client } = connect();
    await assert.rejects(client.request('server/discover', {}), isRpcError(-32602));
    await assert.rejects(client.request('tools/list'), isRpcError(-32602));
    await assert.rejects(
      client.request('tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } }),
      isRpcError(-32602),
      'clientCapabilities тоже обязателен',
    );
  });

  it('неизвестная версия — -32022 со списком поддерживаемых', async () => {
    const { client } = connect();
    const meta = { ...META, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' };
    await assert.rejects(client.request('tools/list', { _meta: meta }), (error: unknown) => {
      assert.ok(isRpcError(-32022)(error));
      assert.deepEqual((error as JsonRpcError).data, { supported: ['2026-07-28', '2025-11-25'], requested: '1900-01-01' });
      return true;
    });
  });
});

describe('Шаг 2 / Step 2. initialize для клиентов 2025-11-25', () => {
  it('рукопожатие, затем запросы без _meta', async () => {
    const { client } = connect();
    const init = await client.request<Record<string, any>>('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'old-client', version: '1.0.0' },
    });
    assert.equal(init.protocolVersion, '2025-11-25');
    assert.deepEqual(init.capabilities, { tools: {} });
    assert.deepEqual(init.serverInfo, INFO);
    client.notify('notifications/initialized');

    const list = await client.request<{ tools: ToolInfo[] }>('tools/list');
    assert.deepEqual(
      list.tools.map((tool) => tool.name),
      ['repeat', 'explode'],
    );
  });

  it('незнакомая версия в initialize — сервер отвечает своей', async () => {
    const { client } = connect();
    const init = await client.request<{ protocolVersion: string }>('initialize', {
      protocolVersion: '2024-01-01',
      capabilities: {},
      clientInfo: { name: 'ancient', version: '0' },
    });
    assert.equal(init.protocolVersion, '2025-11-25');
  });
});

describe('Шаг 3 / Step 3. tools/list', () => {
  it('имя, описание и JSON Schema каждого инструмента — без кода', async () => {
    const { call } = connect();
    const result = await call<Record<string, any>>('tools/list');
    assert.equal(result.resultType, 'complete');
    assert.deepEqual(result.tools[0], {
      name: 'repeat',
      description: 'Повторить текст несколько раз',
      inputSchema: fakeTools[0].inputSchema,
    });
    assert.equal(result.tools.length, 2);
    assert.equal(typeof result.ttlMs, 'number');
    assert.ok(['public', 'private'].includes(result.cacheScope));
    // run — это код сервера, по проводу он не передаётся.
    assert.ok(!JSON.stringify(result).includes('"run"'));
  });
});

describe('Шаг 4 / Step 4. tools/call', () => {
  it('успех — content с текстом и isError: false', async () => {
    const { call } = connect();
    const result = await call<CallToolResult & { resultType: string }>('tools/call', {
      name: 'repeat',
      arguments: { text: 'ха', times: 3 },
    });
    assert.equal(result.resultType, 'complete');
    assert.deepEqual(result.content, [{ type: 'text', text: 'хахаха' }]);
    assert.equal(result.isError, false);
  });

  it('неизвестный инструмент — ошибка протокола -32602', async () => {
    const { call } = connect();
    await assert.rejects(call('tools/call', { name: 'delete_everything', arguments: {} }), isRpcError(-32602));
  });

  it('неверные аргументы — ошибка инструмента: isError: true и текст для модели', async () => {
    const { call } = connect();
    const cases: [Record<string, unknown>, RegExp][] = [
      [{}, /text/],
      [{ text: 42 }, /text/],
      [{ text: 'a', times: 1.5 }, /times/],
      [{ text: 'a', loud: true }, /loud/],
    ];
    for (const [args, mentions] of cases) {
      const result = await call<CallToolResult>('tools/call', { name: 'repeat', arguments: args });
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(result.content[0].text, mentions);
    }
  });

  it('инструмент упал — isError: true с текстом ошибки, сервер живёт дальше', async () => {
    const { call } = connect();
    const failed = await call<CallToolResult>('tools/call', { name: 'explode', arguments: {} });
    assert.deepEqual(failed, {
      resultType: 'complete',
      content: [{ type: 'text', text: 'Диск отвалился' }],
      isError: true,
      _meta: { 'io.modelcontextprotocol/serverInfo': INFO },
    });
    const ok = await call<CallToolResult>('tools/call', { name: 'repeat', arguments: { text: 'ок' } });
    assert.equal(ok.content[0].text, 'ок');
  });

  it('checkArguments: undefined, если всё в порядке', () => {
    const schema = fakeTools[0].inputSchema;
    assert.equal(checkArguments(schema, { text: 'a', times: 2 }), undefined);
    assert.equal(checkArguments(schema, { text: 'a' }), undefined);
    assert.equal(typeof checkArguments(schema, { times: 2 }), 'string');
  });
});

describe('Шаг 5 / Step 5. Инструменты проекта и безопасный путь', () => {
  let root: string;
  let outside: string;

  before(async () => {
    // Временные папки — рядом с проектом: в браузерной песочнице так надёжнее, чем системная /tmp.
    root = await mkdtemp(join(process.cwd(), '.mcp-test-root-'));
    outside = await mkdtemp(join(process.cwd(), '.mcp-test-outside-'));
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'package.json'), '{"name":"demo"}');
    await writeFile(join(root, 'src', 'index.ts'), 'console.log(1);\n');
    await writeFile(join(root, 'big.txt'), 'x'.repeat(25_000));
    await writeFile(join(root, '.env'), 'LLM_API_KEY=secret');
    await writeFile(join(outside, 'secret.txt'), 'top secret');
    await symlink(outside, join(root, 'link'));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('safePath пускает внутрь проекта и не выпускает наружу', async () => {
    assert.match(await safePath(root, 'src/../package.json'), /package\.json$/);
    assert.match(await safePath(root, 'src/index.ts'), /index\.ts$/);
    await assert.rejects(safePath(root, '../secret.txt'), /за пределы проекта/);
    await assert.rejects(safePath(root, '/etc/passwd'), /за пределы проекта/);
    await assert.rejects(safePath(root, 'link/secret.txt'), /за пределы проекта/, 'симлинк наружу');
    await assert.rejects(safePath(root, '.env'), /\.env/);
    await assert.rejects(safePath(root, 'nope.txt'), /Нет такого файла/);
  });

  it('list_files и read_file через tools/call', async () => {
    const { call } = connect(projectTools(root));
    const list = await call<CallToolResult>('tools/call', { name: 'list_files', arguments: {} });
    assert.equal(list.isError, false);
    const names = list.content[0].text.split('\n');
    assert.ok(names.includes('src/') && names.includes('package.json'), list.content[0].text);

    const file = await call<CallToolResult>('tools/call', { name: 'read_file', arguments: { path: 'package.json' } });
    assert.equal(file.content[0].text, '{"name":"demo"}');

    const big = await call<CallToolResult>('tools/call', { name: 'read_file', arguments: { path: 'big.txt' } });
    assert.ok(big.content[0].text.length < 21_000, 'длинный файл обрезан');
    assert.match(big.content[0].text, /25000/);

    const escape = await call<CallToolResult>('tools/call', { name: 'read_file', arguments: { path: '../secret.txt' } });
    assert.equal(escape.isError, true);
    assert.doesNotMatch(escape.content[0].text, /top secret/);
  });

  it('add_note дописывает строку в NOTES.md', async () => {
    const { call } = connect(projectTools(root));
    await call('tools/call', { name: 'add_note', arguments: { text: 'Таймаут MCP — 30 секунд' } });
    const second = await call<CallToolResult>('tools/call', { name: 'add_note', arguments: { text: 'Проверить\nсимлинки' } });
    assert.equal(second.isError, false);
    assert.match(second.content[0].text, /2/);
    assert.equal(await readFile(join(root, 'NOTES.md'), 'utf8'), '- Таймаут MCP — 30 секунд\n- Проверить симлинки\n');
  });
});
