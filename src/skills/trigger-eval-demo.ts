// Trigger-eval на настоящей модели: npm run trigger-eval
// Каждое описание из DESCRIPTION_VARIANTS и описание из SKILL.md — на одном и том же наборе запросов.
import { setTimeout as delay } from 'node:timers/promises';
import { runEval } from '../eval.ts';
import { estimateCost, loadConfig, type Usage } from '../llm.ts';
import { llmProvider, type Provider } from '../provider.ts';
import { skillAgentSystem, skillAgentToolbox } from './agent-setup.ts';
import { discoverSkills } from './loader.ts';
import type { Skill } from './skill.ts';
import { DESCRIPTION_VARIANTS, TRIGGER_CASES, TRIGGER_SKILL } from './trigger-cases.ts';
import { formatTriggerReport, TRIGGER_RUNS, triggersMostly, withDescription } from './trigger-eval.ts';

// Цены qwen/qwen3.7-flash в долларах за миллион токенов.
const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };
// Шлюз пускает 30 запросов в минуту на всех.
const MIN_INTERVAL_MS = 2100;

const { skills, errors } = await discoverSkills('skills');
if (errors.length > 0) {
  console.error(errors.map((error) => error.message).join('\n'));
  process.exit(1);
}

// Провайдер-обёртка: держит паузу между запросами и считает токены. Сам eval об этом не знает.
const usage: Usage = { input: 0, output: 0 };
const model = llmProvider(loadConfig());
let lastStart = 0;
const provider: Provider = {
  async complete(messages, options) {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await delay(wait);
    }
    lastStart = Date.now();
    const result = await model.complete(messages, { ...options, retries: 4 });
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    return result;
  },
};

async function measure(title: string, set: Skill[]): Promise<void> {
  const setup = { provider, system: skillAgentSystem(set), tools: skillAgentToolbox(set).specs() };
  const report = await runEval(TRIGGER_CASES, (query) => triggersMostly(setup, TRIGGER_SKILL, query));
  console.log(`${formatTriggerReport(title, report)}\n`);
}

console.log(`Скилл ${TRIGGER_SKILL}, запросов: ${TRIGGER_CASES.length}, прогонов на запрос: ${TRIGGER_RUNS}\n`);
for (const description of DESCRIPTION_VARIANTS) {
  await measure(`«${description}»`, withDescription(skills, TRIGGER_SKILL, description));
}
await measure('SKILL.md', skills);
console.log(`[вход ${usage.input} · выход ${usage.output} · $${estimateCost(usage, PRICE).toFixed(6)}]`);
