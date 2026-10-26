// Полный круг MCP вручную. Запуск: npm run mcp-demo
// Клиент поднимает сервер дочерним процессом, узнаёт его инструменты, отдаёт их модели,
// и модель сама решает, какой инструмент вызвать на сервере.
import { errorFromResponse, LlmError, loadConfig, type LlmConfig } from '../llm.ts';
import { META, PROTOCOL_VERSION, type CallToolResult, type ToolInfo } from './server.ts';
import { spawnTsPeer } from './spawn.ts';

const short = (line: string) => (line.length > 150 ? `${line.slice(0, 147)}...` : line);
const { peer, stop } = spawnTsPeer('src/mcp/serve.ts', [], {
  trace: (direction, line) => console.log(`${direction === 'out' ? '→' : '←'} ${short(line)}`),
});

// В 2026-07-28 нет рукопожатия: версия, клиент и его возможности едут в каждом запросе.
const meta = {
  [META.protocolVersion]: PROTOCOL_VERSION,
  [META.clientInfo]: { name: 'mcp-demo', version: '1.0.0' },
  [META.clientCapabilities]: {},
};
const mcp = <T>(method: string, params: Record<string, unknown> = {}) => peer.request<T>(method, { ...params, _meta: meta });
const text = (result: CallToolResult) => result.content.map((part) => part.text).join('\n');

try {
  console.log('# 1. server/discover: какие версии и возможности у сервера');
  const discovered = await mcp<{ supportedVersions: string[]; capabilities: object }>('server/discover');
  console.log(`  версии: ${discovered.supportedVersions.join(', ')} · возможности: ${Object.keys(discovered.capabilities).join(', ')}\n`);

  console.log('# 2. tools/list');
  const { tools } = await mcp<{ tools: ToolInfo[] }>('tools/list');
  console.log(`  инструменты: ${tools.map((tool) => tool.name).join(', ')}\n`);

  console.log('# 3. tools/call: путь за пределы проекта');
  const denied = await mcp<CallToolResult>('tools/call', { name: 'read_file', arguments: { path: '../../etc/passwd' } });
  console.log(`  isError: ${denied.isError} · ${text(denied)}\n`);

  console.log('# 4. Модель сама выбирает инструмент');
  await askModel(loadConfig(), tools, 'Какие npm-скрипты в этом проекте относятся к MCP?');
} catch (error) {
  // 401 — ключ устарел, 429 — лимит запросов. Сервер всё равно остановим в finally.
  console.error(error instanceof LlmError ? `Ошибка модели: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  await stop();
}

// ---------- Один круг tool calling, без цикла агента ----------

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

async function askModel(config: LlmConfig, tools: ToolInfo[], question: string) {
  // tools/list почти готовый формат для Chat Completions: inputSchema становится parameters.
  const openaiTools = tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Ты помощник по проекту. У тебя есть инструменты для файлов проекта. Отвечай кратко.' },
    { role: 'user', content: question },
  ];
  console.log(`ты> ${question}`);

  const first = await complete(config, messages, openaiTools);
  messages.push(first);
  if (!first.tool_calls?.length) {
    console.log(`модель> ${first.content}`);
    return;
  }

  // Модель не вызывает инструменты сама: она просит. Вызывает клиент — через tools/call на сервере.
  for (const call of first.tool_calls) {
    console.log(`модель просит: ${call.function.name}(${call.function.arguments})`);
    const result = await mcp<CallToolResult>('tools/call', {
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments || '{}'),
    });
    messages.push({ role: 'tool', tool_call_id: call.id, content: text(result) });
  }

  const second = await complete(config, messages, openaiTools);
  if (second.tool_calls?.length) {
    console.log(`модель хочет ещё: ${second.tool_calls.map((call) => call.function.name).join(', ')} — это уже работа цикла агента`);
  } else {
    console.log(`модель> ${second.content}`);
  }
}

async function complete(config: LlmConfig, messages: ChatMessage[], tools: object[]) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, tools, temperature: 0, max_tokens: 500 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  const data = (await response.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  console.log(`  [модель: вход ${data.usage?.prompt_tokens} · выход ${data.usage?.completion_tokens}]`);
  const { content, tool_calls } = data.choices[0].message;
  return { role: 'assistant' as const, content, ...(tool_calls?.length ? { tool_calls } : {}) };
}
