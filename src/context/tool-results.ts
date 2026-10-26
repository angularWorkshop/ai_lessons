// Сжатие старых результатов инструментов: последние keep — целиком, старые — короткая заглушка.
// Подключается к агенту через prepareMessages. История агента остаётся полной: меняется только запрос.
import type { Message } from '../llm.ts';

export interface CompactToolResultsOptions {
  /** Сколько последних результатов оставить целиком. По умолчанию 3. */
  keep?: number;
  /** Результаты короче этого не трогаем: заглушка вышла бы длиннее оригинала. По умолчанию 500 символов. */
  minChars?: number;
}

export const DEFAULT_KEEP_TOOL_RESULTS = 3;
export const DEFAULT_MIN_STUB_CHARS = 500;

// Шаг 3: заглушка говорит модели, что здесь было, сколько и как получить это снова.
export function toolResultStub(name: string, content: string): string {
  return `[Старый результат ${name} скрыт: ${content.length} символов. Если он снова нужен — вызови инструмент ещё раз.]`;
}

// Шаг 3
export function compactToolResults(messages: Message[], options: CompactToolResultsOptions = {}): Message[] {
  const keep = options.keep ?? DEFAULT_KEEP_TOOL_RESULTS;
  const minChars = options.minChars ?? DEFAULT_MIN_STUB_CHARS;

  // Имя инструмента лежит не в сообщении tool, а в вызове внутри assistant. Соберём по id.
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.tool_calls ?? []) {
        names.set(call.id, call.function.name);
      }
    }
  }

  const toolIndexes = messages.flatMap((message, index) => (message.role === 'tool' ? [index] : []));
  const old = new Set(toolIndexes.slice(0, Math.max(0, toolIndexes.length - keep)));

  // Новый массив и новые объекты: исходную историю не трогаем, она нужна целиком для следующего шага.
  return messages.map((message, index) => {
    if (message.role !== 'tool' || !old.has(index) || message.content.length < minChars) {
      return message;
    }
    const name = names.get(message.tool_call_id) ?? 'инструмента';
    return { ...message, content: toolResultStub(name, message.content) };
  });
}
