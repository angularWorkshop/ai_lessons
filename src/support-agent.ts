// Контракт итогового проекта: createSupportAgent({ provider, dataDir }).run(question).
// Здесь harness собирает прогон: инструменты, цикл, и решает, что из ответа модели можно отдать клиенту.
import type { Provider, Usage } from './llm.ts';
import { runLoop, type StopReason, type ToolEvent } from './loop.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import { supportTools, type RunState } from './support-tools.ts';
import type { Ticket } from './tickets.ts';
import { Toolbox } from './tools.ts';

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

export function createSupportAgent(options: SupportAgentOptions): SupportAgent {
  const { provider, dataDir, onTool } = options;

  return {
    async run(question) {
      // Свои инструменты и своё состояние на каждый вопрос: прочитанное в прошлый раз не считается.
      const state: RunState = { question, read: new Set() };
      const toolbox = new Toolbox(supportTools(dataDir, state));
      const loop = await runLoop(question, { provider, toolbox, system: SYSTEM_PROMPT, onTool });
      // Источники, отказ и номер обращения — тема 15.2. Пока клиент видит ответ модели как есть.
      return {
        answer: loop.text,
        draft: loop.text,
        sources: [],
        ...(state.ticket ? { ticket: state.ticket } : {}),
        stopReason: loop.stopReason,
        steps: loop.steps,
        usage: loop.usage,
      };
    },
  };
}
