// Одна задача — без рассуждений и с ними: npm run reasoning
import { chat, estimateCost, loadConfig, type ChatOptions, type Message, type ReasoningOptions } from '../llm.ts';
import { llmProvider } from '../provider.ts';
import { answerWithEscalation, REASONING_MAX_TOKENS } from './reasoning.ts';

const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

// Порядок event loop: синхронный код, микрозадачи, потом таймеры. Ответ проверяем кодом.
const TASK = `Что выведет этот код в Node.js? Ответь только числами через пробел, без пояснений.

console.log(1);
setTimeout(() => console.log(2), 0);
Promise.resolve().then(() => console.log(3)).then(() => console.log(4));
queueMicrotask(() => console.log(5));
(async () => { console.log(6); await null; console.log(7); })();
console.log(8);`;
const EXPECTED = '1 6 8 3 5 7 4 2';

const config = loadConfig();
const messages: Message[] = [{ role: 'user', content: TASK }];
const isRight = (text: string) => text.trim() === EXPECTED;

async function attempt(name: string, options: ChatOptions): Promise<void> {
  const started = Date.now();
  const result = await chat(config, messages, options);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const cost = estimateCost(result.usage, PRICE);
  console.log(`=== ${name}`);
  console.log(`ответ: ${JSON.stringify(result.text)} ${isRight(result.text) ? '✓' : '✗'} · finish: ${result.finishReason}`);
  console.log(
    `токены: ${result.usage.input} → ${result.usage.output}, из них рассуждения: ${result.usage.reasoning ?? 0} · $${cost.toFixed(6)} · ${seconds} с`,
  );
  if (result.reasoning) {
    console.log(`рассуждения, начало: ${result.reasoning.slice(0, 160).replace(/\s+/g, ' ')}…`);
  }
  console.log();
}

console.log(`задача> ${TASK}\nверный ответ: ${EXPECTED}\n`);

await attempt('Без рассуждений', {});
for (const reasoning of [{ effort: 'low' }, { effort: 'high' }] satisfies ReasoningOptions[]) {
  await attempt(`reasoning: ${JSON.stringify(reasoning)}`, { reasoning, maxTokens: REASONING_MAX_TOKENS });
}
// Предел ответа меньше, чем модель хочет думать: до текста дело не доходит.
await attempt('reasoning: {"enabled":true}, maxTokens: 300', { reasoning: { enabled: true }, maxTokens: 300 });

// Сначала дёшево, рассуждения — только если ответ не прошёл проверку.
const escalation = await answerWithEscalation(llmProvider(config), messages, {
  check: (result) => isRight(result.text),
  reasoning: { effort: 'low' },
});
console.log(
  `=== Эскалация: ${escalation.escalated ? 'понадобились рассуждения' : 'хватило первого ответа'} · ` +
    `ответ ${JSON.stringify(escalation.result.text)} · токены ${escalation.usage.input} → ${escalation.usage.output} · ` +
    `$${estimateCost(escalation.usage, PRICE).toFixed(6)}`,
);
