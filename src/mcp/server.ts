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
  throw new Error('TODO: шаг 4');
}

const toolError = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

export function serveMcp(peer: JsonRpcPeer, tools: McpTool[], info: ServerInfo, instructions?: string): void {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const capabilities = { tools: {} };
  // Версия, о которой договорились через initialize. Пока её нет — ждём _meta в каждом запросе.
  let legacyVersion: string | undefined;

  // Шаг 1: в 2026-07-28 каждый запрос сам говорит, на какой версии он написан.
  function checkMeta(params: unknown): Record<string, unknown> {
    throw new Error('TODO: шаг 1');
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
    throw new Error('TODO: шаг 2');
  });
  // Клиент подтверждает, что готов. Отвечать на уведомление нельзя, делать нам нечего.
  peer.onNotification('notifications/initialized', () => {});

  // Шаг 3
  method('tools/list', () => {
    throw new Error('TODO: шаг 3');
  });

  // Шаг 4: ошибка протокола — JSON-RPC error, ошибка инструмента — результат с isError.
  method('tools/call', async (params): Promise<CallToolResult> => {
    throw new Error('TODO: шаг 4');
  });
}
