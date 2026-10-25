// Сессия диалога: хранит историю и каждый раз отправляет её модели целиком.
import { chat, estimateCost, type ChatResult, type LlmConfig, type Message, type Price, type Usage } from './llm.ts';

export interface SessionOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  price?: Price;
}

export class ChatSession {
  readonly #config: LlmConfig;
  readonly #options: SessionOptions;
  #history: Message[] = [];
  #usage: Usage = { input: 0, output: 0 };

  // Шаг 1
  constructor(config: LlmConfig, options: SessionOptions = {}) {
    this.#config = config;
    this.#options = options;
    throw new Error('TODO: шаг 1');
  }

  // Шаг 1
  get messages(): readonly Readonly<Message>[] {
    throw new Error('TODO: шаг 1');
  }

  // Шаги 2–3
  async send(text: string): Promise<ChatResult> {
    throw new Error('TODO: шаг 2');
  }

  // Шаг 4
  get usage(): Usage {
    throw new Error('TODO: шаг 4');
  }

  // Шаг 4
  get cost(): number | undefined {
    throw new Error('TODO: шаг 4');
  }

  // Шаг 5
  reset(): void {
    throw new Error('TODO: шаг 5');
  }
}
