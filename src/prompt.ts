// System prompt из слоёв: роль, цель, правила, формат, дополнительные разделы.
// Чистая функция: на вход описание, на выход строка. Её легко проверить тестом без модели.

export interface PromptSection {
  title: string;
  body: string;
}

export interface SystemPromptSpec {
  /** Кто модель и для кого она работает. Одна-две фразы. */
  role: string;
  /** Что считается хорошим результатом. */
  goal?: string;
  /** Конкретные правила, по одному на пункт. */
  rules?: string[];
  /** Как выглядит ответ: что в нём есть и чего в нём нет. */
  format?: string;
  /** Дополнительные разделы в конце: контекст проекта, а позже AGENTS.md и скиллы. */
  sections?: PromptSection[];
}

// Шаги 1, 3, 4
export function buildSystemPrompt(spec: SystemPromptSpec): string {
  throw new Error('TODO: шаг 1');
}

// Шаг 2: каждое правило — отдельный пункт списка.
export function formatRules(rules: string[]): string {
  throw new Error('TODO: шаг 2');
}
