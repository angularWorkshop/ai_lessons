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
    if (options.system) {
      this.#history.push({ role: 'system', content: options.system });
    }
  }

  // Шаг 1
  get messages(): readonly Readonly<Message>[] {
    return [...this.#history];
  }

  // Шаги 2–3
  async send(text: string): Promise<ChatResult> {
    const request: Message[] = [...this.#history, { role: 'user', content: text }];
    const result = await chat(this.#config, request, {
      temperature: this.#options.temperature,
      maxTokens: this.#options.maxTokens,
    });
    this.#history = [...request, { role: 'assistant', content: result.text }];
    this.#usage = {
      input: this.#usage.input + result.usage.input,
      output: this.#usage.output + result.usage.output,
    };
    return result;
  }

  // Шаг 4
  get usage(): Usage {
    return { ...this.#usage };
  }

  // Шаг 4
  get cost(): number | undefined {
    return this.#options.price ? estimateCost(this.#usage, this.#options.price) : undefined;
  }

  // Шаг 5
  reset(): void {
    const { system } = this.#options;
    this.#history = system ? [{ role: 'system', content: system }] : [];
  }
}
