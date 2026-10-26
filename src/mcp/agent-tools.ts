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
  const clean = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${clean(server)}__${clean(tool)}`;
}

// Результат MCP — массив кусков. Модели отдаём текст, остальное — пометкой, что оно было.
export function contentText(content: ContentBlock[]): string {
  const parts = content.map((block) =>
    block.type === 'text' ? String(block.text ?? '') : `[${block.type}${typeof block.mimeType === 'string' ? `: ${block.mimeType}` : ''}]`,
  );
  return parts.join('\n') || '(пустой результат)';
}

// Шаг 3: инструмент сервера → Tool агента.
export function mcpTool(client: McpClient, remote: RemoteTool): Tool<Record<string, unknown>> {
  const { $schema, ...parameters } = remote.inputSchema;
  if (parameters.type !== 'object') {
    throw new Error(`MCP-сервер ${client.name}: у инструмента ${remote.name} inputSchema не объект`);
  }
  return {
    name: toolName(client.name, remote.name),
    description: remote.description ?? remote.title ?? remote.name,
    schema: AnyObject,
    // Схему отдаём модели как есть: сервер написал её для модели, переводить нечего.
    parameters,
    async run(args, ctx) {
      // Серверу — его собственное имя инструмента, без префикса.
      const result = await client.callTool(remote.name, args, { signal: ctx.signal });
      const text = contentText(result.content);
      // Toolbox превратит исключение в результат с isError: true — модель прочитает текст сервера.
      if (result.isError) {
        throw new Error(text);
      }
      return text;
    },
  };
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
  const names = Object.keys(config.mcpServers);
  // Серверы стартуют параллельно: каждый — отдельный процесс, ждать их по очереди незачем.
  const settled = await Promise.allSettled(names.map((name) => connectStdio(name, config.mcpServers[name], options)));
  const clients: McpClient[] = [];
  const failed: McpServers['failed'] = [];

  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === 'rejected') {
      failed.push({ name: names[i], error: (outcome.reason as Error).message });
      continue;
    }
    const client = outcome.value;
    try {
      const tools = (await client.listTools()).map((remote) => mcpTool(client, remote));
      // Сначала проверяем все имена, потом регистрируем: сервер подключается целиком или никак.
      // Пробный Toolbox поймает плохое имя и дубли внутри сервера, get — столкновение с тем, что уже есть.
      const probe = new Toolbox();
      tools.forEach((tool) => probe.register(tool));
      const taken = tools.find((tool) => toolbox.get(tool.name));
      if (taken) {
        throw new Error(`инструмент ${taken.name} уже есть`);
      }
      tools.forEach((tool) => toolbox.register(tool));
      clients.push(client);
    } catch (error) {
      failed.push({ name: client.name, error: `MCP-сервер ${client.name}: ${(error as Error).message}` });
      await client.close();
    }
  }

  return {
    clients,
    failed,
    close: async () => {
      await Promise.all(clients.map((client) => client.close()));
    },
  };
}
