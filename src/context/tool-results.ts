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
  throw new Error('TODO: шаг 3');
}
