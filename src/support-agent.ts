// Контракт итогового проекта: createSupportAgent({ provider, dataDir }).run(question).
// Типы ниже — из ТЗ (README). Модули, из которых они импортируются, ты напишешь сам:
// llm.ts — шаг 1, tools.ts, tickets.ts и support-tools.ts — шаг 2, loop.ts — шаг 3.
import type { Provider, Usage } from './llm.ts';
import type { StopReason, ToolEvent } from './loop.ts';
import type { Ticket } from './tickets.ts';

export type { Ticket } from './tickets.ts';

export interface SupportAgentOptions {
  provider: Provider;
  /** Папка с данными: kb/ — статьи, tickets/ — обращения. */
  dataDir: string;
  /** Сколько раз можно спросить модель на один вопрос. По умолчанию 6. Тема 15.2. */
  maxSteps?: number;
  /** Каждый исполненный вызов инструмента — для вывода в терминал и трейса. */
  onTool?: (event: ToolEvent) => void;
}

export interface SupportResult {
  /** Что увидит клиент. */
  answer: string;
  /** Что написала модель, до проверок harness. Клиенту не показываем — это для разбора провалов. */
  draft: string;
  /** Статьи, на которые ответ ссылается и которые агент действительно прочитал. */
  sources: string[];
  /** Обращение, если агент передал вопрос специалисту. */
  ticket?: Ticket;
  stopReason: StopReason;
  steps: number;
  usage: Usage;
}

export interface SupportAgent {
  run(question: string): Promise<SupportResult>;
}

// Шаг 3
export function createSupportAgent(options: SupportAgentOptions): SupportAgent {
  throw new Error('TODO: шаг 3');
}
