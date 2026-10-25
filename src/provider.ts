// Провайдер — то, у чего агент просит следующий ответ модели.
// Агенту всё равно, кто отвечает: настоящая модель через HTTP или заготовленные ответы в тесте.
import { chat, type ChatOptions, type ChatResult, type LlmConfig, type Message } from './llm.ts';

export interface Provider {
  complete(messages: Message[], options: ChatOptions): Promise<ChatResult>;
}

// Шаг 1: настоящая модель — это chat() из llm.ts с уже известным конфигом.
export function llmProvider(config: LlmConfig): Provider {
  throw new Error('TODO: шаг 1 — верни провайдер, который зовёт chat(config, messages, options)');
}
