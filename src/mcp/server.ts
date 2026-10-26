// MCP-сервер поверх JsonRpcPeer. Здесь только протокол: какие методы есть и что они отвечают.
// Сами инструменты — в tools.ts, запуск по stdio — в serve.ts.
import { ErrorCode, JsonRpcError, type JsonRpcPeer } from './jsonrpc.ts';

/** Текущая версия MCP. В ней нет рукопожатия: версия едет в _meta каждого запроса. */
export const PROTOCOL_VERSION = '2026-07-28';
/** Последняя версия с рукопожатием initialize. На ней ещё работает много клиентов. */
export const LEGACY_PROTOCOL_VERSION = '2025-11-25';
export const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION];
/** Код из спецификации 2026-07-28: клиент просит версию, которую сервер не знает. */
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;

// Ключи _meta, которые определяет спецификация.
export const META = {
  protocolVersion: 'io.modelcontextprotocol/protocolVersion',
  clientInfo: 'io.modelcontextprotocol/clientInfo',
  clientCapabilities: 'io.modelcontextprotocol/clientCapabilities',
  serverInfo: 'io.modelcontextprotocol/serverInfo',
} as const;

export interface PropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
}

// Подмножество JSON Schema, которого хватает нашим инструментам.
export interface InputSchema {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Так инструмент выглядит в ответе на tools/list. */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: InputSchema;
}

export interface McpTool extends ToolInfo {
  /** Вернуть текст для модели. Бросить ошибку — модель увидит её текст с isError: true. */
  run(args: Record<string, unknown>): string | Promise<string>;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface CallToolResult {
  content: TextContent[];
  isError: boolean;
}

export interface ServerInfo {
  name: string;
  version: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidParams = (message: string) => new JsonRpcError(ErrorCode.InvalidParams, message);

// Шаг 4: аргументы пришли от модели. Проверяем по той же схеме, которую ей показали.
export function checkArguments(schema: InputSchema, args: Record<string, unknown>): string | undefined {
  for (const name of schema.required ?? []) {
    if (args[name] === undefined) {
      return `Не хватает аргумента ${name}`;
    }
  }
  for (const [name, value] of Object.entries(args)) {
    const property = schema.properties[name];
    if (!property) {
      if (schema.additionalProperties === false) {
        return `Лишний аргумент ${name}. Есть только: ${Object.keys(schema.properties).join(', ') || 'никаких'}`;
      }
      continue;
    }
    const ok = property.type === 'integer' ? Number.isInteger(value) : typeof value === property.type;
    if (!ok) {
      return `Аргумент ${name} должен быть ${property.type}, а пришло ${JSON.stringify(value)}`;
    }
  }
  return undefined;
}

const toolError = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

export function serveMcp(peer: JsonRpcPeer, tools: McpTool[], info: ServerInfo, instructions?: string): void {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const capabilities = { tools: {} };
  // Версия, о которой договорились через initialize. Пока её нет — ждём _meta в каждом запросе.
  let legacyVersion: string | undefined;

  // Шаг 1: в 2026-07-28 каждый запрос сам говорит, на какой версии он написан.
  function checkMeta(params: unknown): Record<string, unknown> {
    const request = isObject(params) ? params : {};
    if (legacyVersion) {
      return request;
    }
    const meta = isObject(request._meta) ? request._meta : {};
    const version = meta[META.protocolVersion];
    if (typeof version !== 'string' || !isObject(meta[META.clientCapabilities])) {
      throw invalidParams(`Missing _meta: нужны ${META.protocolVersion} и ${META.clientCapabilities}`);
    }
    if (!SUPPORTED_VERSIONS.includes(version)) {
      throw new JsonRpcError(UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', {
        supported: SUPPORTED_VERSIONS,
        requested: version,
      });
    }
    return request;
  }

  // Обычный метод MCP: проверить _meta, выполнить, добавить resultType и подпись сервера.
  function method(name: string, handler: (params: Record<string, unknown>) => object | Promise<object>): void {
    peer.onRequest(name, async (params) => {
      const result = await handler(checkMeta(params));
      return { resultType: 'complete', ...result, _meta: { [META.serverInfo]: info } };
    });
  }

  method('server/discover', () => ({
    supportedVersions: SUPPORTED_VERSIONS,
    capabilities,
    ...(instructions ? { instructions } : {}),
  }));

  // Шаг 2: старые клиенты (2025-11-25 и раньше) начинают с рукопожатия.
  peer.onRequest('initialize', (params) => {
    if (!isObject(params) || typeof params.protocolVersion !== 'string') {
      throw invalidParams('initialize: нужен protocolVersion');
    }
    // Просили версию, которой у нас нет, — отвечаем своей. Подходит ли она, решает клиент.
    legacyVersion = LEGACY_PROTOCOL_VERSION;
    return {
      protocolVersion: legacyVersion,
      capabilities,
      serverInfo: info,
      ...(instructions ? { instructions } : {}),
    };
  });
  // Клиент подтверждает, что готов. Отвечать на уведомление нельзя, делать нам нечего.
  peer.onNotification('notifications/initialized', () => {});

  // Шаг 3
  method('tools/list', () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    // Список не меняется, пока сервер жив: клиент может кешировать его на час.
    ttlMs: 3_600_000,
    cacheScope: 'public',
  }));

  // Шаг 4: ошибка протокола — JSON-RPC error, ошибка инструмента — результат с isError.
  method('tools/call', async (params): Promise<CallToolResult> => {
    const tool = typeof params.name === 'string' ? byName.get(params.name) : undefined;
    if (!tool) {
      throw invalidParams(`Unknown tool: ${String(params.name)}`);
    }
    const args = params.arguments ?? {};
    if (!isObject(args)) {
      throw invalidParams('tools/call: arguments должен быть объектом');
    }
    const problem = checkArguments(tool.inputSchema, args);
    if (problem) {
      return toolError(problem);
    }
    try {
      return { content: [{ type: 'text', text: await tool.run(args) }], isError: false };
    } catch (error) {
      return toolError((error as Error).message);
    }
  });
}
