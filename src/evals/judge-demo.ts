// npm run judge — калибровка судьи на примерах с разметкой человека и проверка на смещение к позиции.
import { z } from 'zod';
import { PRICE } from '../commands.ts';
import { estimateCost, loadConfig, type Usage } from '../llm.ts';
import { llmProvider, type Provider } from '../provider.ts';
import { jsonSchemaFormat, parseJson } from '../structured.ts';
import { calibrate, comparePair, formatAgreement, judge, type JudgeItem, type Verdict } from './judge.ts';
import { COMMIT_RUBRIC, JUDGE_CASES, JUDGE_PAIRS } from './judge-cases.ts';

const provider = llmProvider(loadConfig());
const usage: Usage = { input: 0, output: 0 };
const count = (extra: Usage) => {
  usage.input += extra.input;
  usage.output += extra.output;
};

// Судья «как попросил бы любой»: без рубрики, один вопрос — хорошее ли сообщение.
const Holistic = z.object({ reasoning: z.string(), pass: z.boolean() });
async function holisticVerdict(provider: Provider, item: JudgeItem): Promise<boolean> {
  const result = await provider.complete(
    [
      { role: 'system', content: 'Ты оцениваешь сообщение коммита к diff. Хорошее ли это сообщение? JSON: reasoning, pass.' },
      { role: 'user', content: `<context>\n${item.context}\n</context>\n\n<answer>\n${item.answer}\n</answer>` },
    ],
    { responseFormat: jsonSchemaFormat(Holistic, 'verdict'), temperature: 0, maxTokens: 600 },
  );
  count(result.usage);
  const parsed = parseJson(result.text, Holistic);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.data.pass;
}

console.log(`Примеров с разметкой: ${JUDGE_CASES.length}\n`);

const holistic = await calibrate(JUDGE_CASES, (item) => holisticVerdict(provider, item));
console.log(`${formatAgreement('Без рубрики', holistic)}\n`);

const verdicts = new Map<JudgeItem, Verdict>();
const rubric = await calibrate(JUDGE_CASES, async (item) => {
  const verdict = await judge(provider, COMMIT_RUBRIC, item);
  count(verdict.usage);
  verdicts.set(item, verdict);
  return verdict.pass;
});
console.log(formatAgreement('С рубрикой', rubric));
// Где судья ошибся — его рассуждения: по ним видно, чего не хватает рубрике.
for (const result of rubric.results) {
  const item = JUDGE_CASES.find((labeled) => labeled.id === result.id)!.input;
  const verdict = verdicts.get(item);
  if (result.ok || !verdict) continue;
  console.log(`  ${result.id}:`);
  for (const criterion of verdict.criteria) {
    console.log(`    ${criterion.pass ? '✓' : '✗'} ${criterion.id}: ${criterion.reasoning}`);
  }
}

console.log('\nПары, оба порядка (first как A, потом second как A):');
for (const pair of JUDGE_PAIRS) {
  const comparison = await comparePair(provider, COMMIT_RUBRIC, pair.context, pair.first, pair.second);
  count(comparison.usage);
  const note = comparison.consistent ? '' : ' — порядки разошлись';
  console.log(`  ${pair.title}: ${comparison.votes.join(' / ')} → ${comparison.winner}${note}`);
}

console.log(`\n[вход ${usage.input} · выход ${usage.output} · $${estimateCost(usage, PRICE).toFixed(6)}]`);
