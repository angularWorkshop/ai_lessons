// Сообщение коммита как данные: схема, system prompt и сборка строки для git commit -m.
import { z } from 'zod';
import { buildSystemPrompt } from './prompt.ts';

export const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'build', 'ci', 'chore'] as const;
export const MAX_HEADER_LENGTH = 50;

export interface Commit {
  type: (typeof COMMIT_TYPES)[number];
  scope: string | null;
  subject: string;
}

// Первая строка коммита: feat(session): add turns getter
export function formatCommit(commit: Commit): string {
  const scope = commit.scope ? `(${commit.scope})` : '';
  return `${commit.type}${scope}: ${commit.subject}`;
}

export const CommitSchema = z
  .object({
    type: z.enum(COMMIT_TYPES),
    scope: z.string().nullable(),
    subject: z.string().min(1).refine((text) => !text.endsWith('.'), 'subject не должен заканчиваться точкой'),
  })
  // Правило на всю строку сразу: в JSON Schema его не выразить, а zod проверит.
  .superRefine((commit, ctx) => {
    const header = formatCommit(commit);
    if (header.length > MAX_HEADER_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        path: ['subject'],
        // Сообщение читает модель: что не так и что с этим сделать.
        message: `строка «${header}» длиннее ${MAX_HEADER_LENGTH} символов на ${header.length - MAX_HEADER_LENGTH}: сократи subject, убери лишние слова`,
      });
    }
  });

export const COMMIT_SYSTEM_PROMPT = buildSystemPrompt({
  role: 'Ты пишешь сообщения коммитов для TypeScript-проекта. Тебе присылают git diff.',
  goal: 'Сообщение в формате Conventional Commits, которое можно сразу передать в git commit -m.',
  rules: [
    `type — одно из: ${COMMIT_TYPES.join(', ')}.`,
    'scope — имя изменённого модуля без расширения, например llm или session. Если модулей несколько — null.',
    'subject — на английском, в повелительном наклонении, со строчной буквы, без точки в конце.',
    `Вся строка «type(scope): subject» — не длиннее ${MAX_HEADER_LENGTH} символов.`,
  ],
  format: 'JSON с полями type, scope, subject.',
});
