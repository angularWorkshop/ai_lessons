// Вердикт ревьюера по схеме. Это askJson из темы 2.2, только через Provider, а не через chat():
// так ревьюер работает и с настоящей моделью, и со ScriptedProvider в тестах.
import { z } from 'zod';
import type { Message, Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';
import { jsonSchemaFormat, parseJson, repairMessage, StructuredOutputError, type JsonResult } from '../structured.ts';

export const VerdictSchema = z.object({
  verdict: z.enum(['approve', 'revise']).describe('approve — задача сделана полностью, revise — нужно доработать'),
  issues: z.array(z.string()).describe('Что именно исправить: по пункту на проблему, с файлом. Для approve — пустой список'),
});

export type Verdict = z.infer<typeof VerdictSchema>;

/** Последняя просьба к ревьюеру: всё проверено, теперь вердикт строго по схеме. */
export const VERDICT_REQUEST =
  'Вынеси вердикт по схеме. approve — только если задача выполнена полностью и ты проверил это по файлам. Иначе revise и список проблем.';

const MAX_ATTEMPTS = 2;

// Шаг 1: схема → response_format → проверка → одна попытка починки. Как в askJson, только provider.complete.
export async function completeJson<S extends z.ZodType>(
  provider: Provider,
  messages: Message[],
  schema: S,
  options: { name?: string; signal?: AbortSignal } = {},
): Promise<JsonResult<z.output<S>>> {
  const responseFormat = jsonSchemaFormat(schema, options.name);
  let request = messages;
  const usage: Usage = { input: 0, output: 0 };

  for (let attempt = 1; ; attempt++) {
    const result = await provider.complete(request, { responseFormat, signal: options.signal });
    usage.input += result.usage.input;
    usage.output += result.usage.output;

    const parsed = parseJson(result.text, schema);
    if (parsed.ok) {
      return { data: parsed.data, attempts: attempt, usage };
    }
    if (attempt >= MAX_ATTEMPTS) {
      throw new StructuredOutputError(`Ответ модели не прошёл схему после ${attempt} попыток:\n${parsed.problem}`, {
        raw: result.text,
        problem: parsed.problem,
        attempts: attempt,
      });
    }
    request = [...request, { role: 'assistant', content: result.text }, { role: 'user', content: repairMessage(parsed.problem) }];
  }
}
