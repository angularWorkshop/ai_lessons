// MCP-инструменты в Toolbox агента. Агент не знает, что инструмент живёт в другом процессе:
// для него это обычный Tool с именем, описанием, схемой и run.
import { z } from 'zod';
import { Toolbox, type Tool } from '../tools.ts';
import { connectStdio, type ConnectOptions, type ContentBlock, type McpClient, type RemoteTool } from './client.ts';
import type { McpConfig } from './config.ts';

// Аргументы по inputSchema проверяет сервер. Нам достаточно знать, что модель прислала объект.
const AnyObject = z.record(z.string(), z.unknown());

// Шаг 3: имя с префиксом сервера. Два сервера с read_file не столкнутся, а модель видит, чей инструмент.
// Точку и другие символы MCP разрешает, а API модели — нет: заменяем на _.
export function toolName(server: string, tool: string): string {
  throw new Error('TODO: шаг 3');
}

// Результат MCP — массив кусков. Модели отдаём текст, остальное — пометкой, что оно было.
export function contentText(content: ContentBlock[]): string {
  throw new Error('TODO: шаг 3');
}

// Шаг 3: инструмент сервера → Tool агента.
export function mcpTool(client: McpClient, remote: RemoteTool): Tool<Record<string, unknown>> {
  throw new Error('TODO: шаг 3');
}

export interface McpServers {
  clients: McpClient[];
  /** Серверы, которые не поднялись. Агент работает без них. error — готовая фраза с именем сервера. */
  failed: { name: string; error: string }[];
  /** Остановить все серверы. Звать при любом выходе: обычном, по ошибке, по Ctrl+C. */
  close(): Promise<void>;
}

// Шаг 5: поднять все серверы из конфига, сложить их инструменты в toolbox.
export async function startMcpServers(toolbox: Toolbox, config: McpConfig, options: ConnectOptions = {}): Promise<McpServers> {
  throw new Error('TODO: шаг 5');
}
