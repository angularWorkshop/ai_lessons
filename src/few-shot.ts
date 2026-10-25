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
  throw new Error('TODO: шаг 1');
}
