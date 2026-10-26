// Провайдер — то, у чего агент просит следующий ответ модели.
// Агенту всё равно, кто отвечает: настоящая модель через HTTP или заготовленные ответы в тесте.
import { chat, chatStream, type ChatOptions, type ChatResult, type LlmConfig, type Message } from './llm.ts';

export interface Provider {
  complete(messages: Message[], options: ChatOptions): Promise<ChatResult>;
  /**
   * Тот же ответ, но текст уходит в onDelta по мере генерации (тема 6.1).
   * Необязательный: у провайдера без стрима агент просто спросит complete.
   */
  stream?(messages: Message[], options: ChatOptions, onDelta: (text: string) => void): Promise<ChatResult>;
}

// Шаг 1: настоящая модель — это chat() из llm.ts с уже известным конфигом.
export function llmProvider(config: LlmConfig): Provider {
  return {
    complete: (messages, options) => chat(config, messages, options),
    // Шаг 3 (6.1)
    stream: () => {
      throw new Error('TODO: шаг 3 — позови chatStream с tools хотя бы пустым массивом');
    },
  };
}
