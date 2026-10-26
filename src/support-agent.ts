// Контракт итогового проекта: createSupportAgent({ provider, dataDir }).run(question).
// Здесь harness собирает прогон: инструменты, цикл, и решает, что из ответа модели можно отдать клиенту.
import path from 'node:path';
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
  /** Сколько раз можно спросить модель на один вопрос. По умолчанию 6. */
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

export const DEFAULT_MAX_STEPS = 6;

/** Ответ без подтверждённого источника и без обращения клиенту не уходит — вместо него этот. */
export const NO_ANSWER =
  'В базе знаний «Тетради» нет ответа на этот вопрос, а гадать я не буду. Если вопрос важен, попроси передать его специалисту — я заведу обращение.';

// Ссылка — путь .md в любом обрамлении: [billing/refund.md], (billing/refund.md) или просто текстом.
export function citedPaths(text: string): string[] {
  const found = text.match(/[\w-]+(?:\/[\w-]+)*\.md/g) ?? [];
  return [...new Set(found.map((item) => path.posix.normalize(item)))];
}

export function createSupportAgent(options: SupportAgentOptions): SupportAgent {
  const { provider, dataDir, maxSteps = DEFAULT_MAX_STEPS, onTool } = options;

  return {
    async run(question) {
      // Свои инструменты и своё состояние на каждый вопрос: прочитанное в прошлый раз не считается.
      const state: RunState = { question, read: new Set() };
      const toolbox = new Toolbox(supportTools(dataDir, state));
      const loop = await runLoop(question, { provider, toolbox, system: SYSTEM_PROMPT, maxSteps, toolFirst: true, onTool });
      const base = {
        draft: loop.text,
        stopReason: loop.stopReason,
        steps: loop.steps,
        usage: loop.usage,
        ...(state.ticket ? { ticket: state.ticket } : {}),
      };

      if (loop.stopReason === 'error') {
        return { ...base, answer: `Не получилось ответить: ${loop.text}`, sources: [] };
      }

      // Источник засчитывается, только если статья прочитана в этом прогоне. Остальное — выдумка модели.
      const sources = citedPaths(loop.text).filter((id) => state.read.has(id));

      if (state.ticket) {
        const id = state.ticket.id;
        const text = loop.text.trim() || 'Передал твой вопрос специалисту поддержки.';
        return { ...base, answer: text.includes(id) ? text : `${text}\n\nНомер обращения: ${id}.`, sources };
      }
      if (sources.length === 0) {
        return { ...base, answer: NO_ANSWER, sources };
      }
      return { ...base, answer: loop.text, sources };
    },
  };
}
