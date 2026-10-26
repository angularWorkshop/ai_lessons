// Разговор с агентом в терминале: история между задачами, расход за сессию и своя отмена у каждой задачи.
import { Agent, type AgentOptions, type AgentRun } from './agent.ts';
import { INTERRUPTED_NOTE } from './interrupt.ts';
import type { Message, Usage } from './llm.ts';

export class Conversation {
  readonly #options: Omit<AgentOptions, 'signal'>;
  #messages: Message[] = [];
  #usage: Usage = { input: 0, output: 0 };

  // Тема 12.3: restored — история и расход из журнала сессии, чтобы продолжить разговор после перезапуска.
  constructor(options: Omit<AgentOptions, 'signal'>, restored: { messages?: readonly Message[]; usage?: Usage } = {}) {
    this.#options = options;
    this.#messages = [...(restored.messages ?? [])];
    this.#usage = { ...(restored.usage ?? this.#usage) };
  }

  /** История без system: все задачи разговора и всё, что агент сделал. */
  get messages(): readonly Message[] {
    return this.#messages;
  }

  /** Сумма usage всех задач разговора, включая прерванные. */
  get usage(): Usage {
    return { ...this.#usage };
  }

  // Шаг 3
  async send(task: string, signal?: AbortSignal): Promise<AgentRun> {
    // Новый Agent на каждую задачу: у задачи свой signal, и отмена одной не задевает следующую.
    const agent = new Agent({ ...this.#options, signal });
    const run = await agent.run(task, this.#messages);

    this.#usage = { input: this.#usage.input + run.usage.input, output: this.#usage.output + run.usage.output };
    // История после отмены уже целая: у каждого вызова есть результат. Добавляем только пометку для модели.
    this.#messages = run.stopReason === 'aborted' ? [...run.messages, { role: 'user', content: INTERRUPTED_NOTE }] : run.messages;
    return run;
  }

  // Шаг 1 (6.3): /clear. Историю забываем, а потраченное за сессию остаётся в usage.
  clear(): void {
    this.#messages = [];
  }
}
