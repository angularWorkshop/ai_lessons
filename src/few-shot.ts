// Few-shot: примеры как настоящие реплики диалога. Модель видит, что уже «отвечала» так раньше.
import type { Message } from './llm.ts';

export interface Example {
  /** Что пришло от человека: например, git diff. */
  input: string;
  /** Каким должен быть ответ модели, ровно в том формате, который мы ждём. */
  output: string;
}

// Шаг 1: system, пары user/assistant по примерам, в конце — настоящий вопрос.
export function fewShotMessages(system: string, examples: Example[], input: string): Message[] {
  const messages: Message[] = [{ role: 'system', content: system }];
  for (const example of examples) {
    messages.push({ role: 'user', content: example.input }, { role: 'assistant', content: example.output });
  }
  messages.push({ role: 'user', content: input });
  return messages;
}
