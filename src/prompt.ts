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

// Шаг 1
export function buildSystemPrompt(spec: SystemPromptSpec): string {
  const role = spec.role.trim();
  if (!role) {
    throw new Error('buildSystemPrompt: role не может быть пустой');
  }
  const parts = [role];

  // Шаги 2–3: разделы идут в фиксированном порядке, пустые пропускаем.
  const add = (title: string, body: string | undefined) => {
    const text = body?.trim();
    if (text) {
      parts.push(`## ${title}\n${text}`);
    }
  };

  add('Цель', spec.goal);
  add('Правила', formatRules(spec.rules ?? []));
  add('Формат ответа', spec.format);

  // Шаг 4
  for (const section of spec.sections ?? []) {
    const title = section.title.trim();
    if (!title) {
      throw new Error('buildSystemPrompt: у раздела нет заголовка');
    }
    add(title, section.body);
  }

  return parts.join('\n\n');
}

// Шаг 2: каждое правило — отдельный пункт списка.
export function formatRules(rules: string[]): string {
  return rules
    .map((rule) => rule.trim())
    .filter((rule) => rule !== '')
    .map((rule) => `- ${rule}`)
    .join('\n');
}
