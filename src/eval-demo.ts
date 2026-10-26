// Промпт без примеров против промпта с примерами на отложенном наборе.
// Запуск: npm run eval
import { setTimeout as delay } from 'node:timers/promises';
import { COMMIT_TYPE_PROMPT, CommitTypeSchema, EVAL_CASES, EXAMPLES, type CommitType } from './commit-cases.ts';
import { formatReport, findLeaks, runEval } from './eval.ts';
import { fewShotMessages, type Example } from './few-shot.ts';
import { estimateCost, loadConfig, type Usage } from './llm.ts';
import { askJson } from './structured.ts';

// Цены qwen/qwen3.7-flash в долларах за миллион токенов.
const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

const leaks = findLeaks(EXAMPLES, EVAL_CASES);
if (leaks.length > 0) {
  console.error(`Примеры попали в проверочный набор: ${leaks.join(', ')}. Такой замер ничего не докажет.`);
  process.exit(1);
}

const config = loadConfig();

// Шлюз пускает 30 запросов в минуту. Не даём eval съесть их за двадцать секунд.
const MIN_INTERVAL_MS = 2100;
let lastStart = 0;
async function pace(): Promise<void> {
  const wait = lastStart + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await delay(wait);
  }
  lastStart = Date.now();
}

async function evaluate(title: string, examples: Example[]) {
  const usage: Usage = { input: 0, output: 0 };
  const classify = async (diff: string): Promise<CommitType> => {
    await pace();
    const result = await askJson(config, fewShotMessages(COMMIT_TYPE_PROMPT, examples, diff), CommitTypeSchema, {
      name: 'commit_type',
      maxTokens: 50,
      retries: 4,
    });
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    return result.data.type;
  };

  const report = await runEval(EVAL_CASES, classify);
  console.log(formatReport(title, report));
  console.log(`  [вход ${usage.input} · выход ${usage.output} · $${estimateCost(usage, PRICE).toFixed(6)}]\n`);
}

console.log(`Кейсов: ${EVAL_CASES.length}, примеров в промпте: ${EXAMPLES.length}\n`);
await evaluate('Без примеров', []);
await evaluate('С примерами', EXAMPLES);
