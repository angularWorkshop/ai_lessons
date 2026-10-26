// Разговор с агентом в терминале: история между задачами, расход за сессию и своя отмена у каждой задачи.
import type { AgentOptions, AgentRun } from './agent.ts';
import type { Message, Usage } from './llm.ts';

export class Conversation {
  readonly #options: Omit<AgentOptions, 'signal'>;
  #messages: Message[] = [];
  #usage: Usage = { input: 0, output: 0 };

  constructor(options: Omit<AgentOptions, 'signal'>) {
    this.#options = options;
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
    throw new Error('TODO: шаг 3 — запусти задачу новым Agent со своим signal и обнови историю и usage');
  }
}
