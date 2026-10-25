// mcp.json — какие MCP-серверы поднять вместе с агентом. Формат тот же, что у .mcp.json в Claude Code:
// { "mcpServers": { "<имя>": { "command": "...", "args": [...], "env": { ... } } } }
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface McpServerConfig {
  /** Программа сервера: node, npx, python, путь к бинарнику. */
  command: string;
  args?: string[];
  /** Переменные окружения для сервера. ${ИМЯ} подставляется из окружения агента. */
  env?: Record<string, string>;
  /** Папка запуска. По умолчанию — папка агента. */
  cwd?: string;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export const CONFIG_FILE = 'mcp.json';

/** Что сервер получает из окружения агента без спроса. Остальное, включая LLM_API_KEY, — только через env в конфиге. */
export const INHERITED_ENV = ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

// Шаг 4: прочитать и проверить конфиг. Файла нет — серверов нет, это не ошибка.
export async function loadMcpConfig(dir: string = process.cwd()): Promise<McpConfig> {
  throw new Error('TODO: шаг 4');
}

// Шаг 4: окружение сервера — короткий список из окружения агента плюс то, что явно написано в конфиге.
export function serverEnv(env: Record<string, string> = {}, parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  throw new Error('TODO: шаг 4');
}
