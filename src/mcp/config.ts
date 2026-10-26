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
  const file = join(dir, CONFIG_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { mcpServers: {} };
    }
    throw error;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${CONFIG_FILE}: не JSON — ${(error as Error).message}`);
  }
  if (!isObject(data) || !isObject(data.mcpServers)) {
    throw new Error(`${CONFIG_FILE}: нужен объект mcpServers`);
  }

  for (const [name, server] of Object.entries(data.mcpServers)) {
    const where = `${CONFIG_FILE}: сервер ${name}`;
    if (!isObject(server) || typeof server.command !== 'string' || server.command === '') {
      throw new Error(`${where}: нужна строка command`);
    }
    if (server.args !== undefined && !isStringArray(server.args)) {
      throw new Error(`${where}: args должен быть массивом строк`);
    }
    if (server.env !== undefined && !(isObject(server.env) && Object.values(server.env).every((v) => typeof v === 'string'))) {
      throw new Error(`${where}: env должен быть объектом со строковыми значениями`);
    }
    if (server.cwd !== undefined && typeof server.cwd !== 'string') {
      throw new Error(`${where}: cwd должен быть строкой`);
    }
  }
  return data as unknown as McpConfig;
}

// Шаг 4: окружение сервера — короткий список из окружения агента плюс то, что явно написано в конфиге.
export function serverEnv(env: Record<string, string> = {}, parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_ENV) {
    if (parent[key] !== undefined) {
      result[key] = parent[key];
    }
  }
  // Ключи не пишут в mcp.json — он лежит в репозитории. Пишут ссылку: "TOKEN": "${GITHUB_TOKEN}".
  for (const [key, value] of Object.entries(env)) {
    result[key] = value.replace(/\$\{(\w+)\}/g, (_, name: string) => parent[name] ?? '');
  }
  return result;
}
