// npm run cache: видно ли кеш префикса на модели курса и сколько он экономит.
// 1) агент с длинным system решает задачу — смотрим cached по шагам и цену;
// 2) одиночные запросы: первый, тот же ещё раз, правка в начале system, правка в конце.
import { Agent } from './agent.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { chat, estimateCost, loadConfig, type Message, type Price, type Usage } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';
import { Toolbox } from './tools.ts';

// Цены qwen/qwen3.7-flash через шлюз, $ за миллион токенов: так их посчитал сам шлюз в поле usage.cost.
const PRICE: Price = { inputPerMillion: 0.03, outputPerMillion: 0.13 };
const PRICE_WITH_CACHE: Price = { ...PRICE, cachedInputPerMillion: 0.006 };

// Правила проекта, как в AGENTS.md (тема 7.3). Они длинные и одинаковые в каждом запросе — это и есть префикс.
const RULES = `Правила проекта.
Код:
- TypeScript в строгом режиме, без any и без ts-ignore. Типы на границах модулей описывай явно.
- Модули — ES, импорты с расширением .ts. Один модуль — одна ответственность.
- Имена функций — глаголы (loadConfig, parseArgs), имена типов — существительные (ToolResult, AgentRun).
- Файлы — kebab-case: print-event.ts, scripted-provider.ts. Тесты лежат в tests/ и называются <модуль>.test.ts.
- Не меняй публичные сигнатуры без нужды. Новые параметры — только необязательные, со значением по умолчанию.
- Ошибки, которые программа может обработать, — классы с полями (как LlmError), а не строки.
- Внешние вызовы — с таймаутом и AbortSignal. Повторы — только для 429 и 5xx.
- Никаких console.log в библиотечном коде: наружу — через события или возвращаемое значение.
- Комментарии объясняют «почему», а не «что». Комментарий, который пересказывает код, удаляй.
Тесты:
- node:test и node:assert/strict. Сеть в тестах запрещена: fetch подменяется заглушкой.
- Один тест — одно поведение. Название теста — что должно произойти, а не как устроен код.
- Сначала тест, который падает, потом код. Тест, который не может упасть, ничего не проверяет.
- Не правь чужие тесты, чтобы они прошли. Если поведение меняется намеренно, скажи об этом.
Работа с файлами:
- Перед правкой прочитай файл целиком. Правь точечно, через замену фрагмента, а не переписывая файл.
- Не трогай package-lock.json, .env и файлы вне проекта. Не добавляй зависимости без просьбы.
- Не удаляй файлы, если об этом не просили прямо.
Команды:
- Проверка — npm test и npm run typecheck. Перед ответом «готово» запусти обе.
- Долгие команды — с таймаутом. Вывод длиннее 200 строк обрезай и говори, что обрезал.
Ответ человеку:
- Коротко: что сделал, что проверил, что осталось. Без пересказа кода.
- Если задача неоднозначна — спроси, а не угадывай. Если что-то не получилось — так и скажи.
- Пиши по-русски, термины — как в коде.`;

const SYSTEM = `Ты — агент, который решает задачи с помощью инструментов.
Текущее время узнавай только через get_current_time, любые вычисления делай только через calculate.
Когда всё узнал, ответь коротко и по-русски.

${RULES.repeat(3)}`;

const config = loadConfig();

function cost(usage: Usage, price: Price): string {
  return `$${estimateCost(usage, price).toFixed(6)}`;
}

console.log('── 1. Агент с длинным system\n');
const agent = new Agent({
  provider: llmProvider(config),
  toolbox: new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator),
  system: SYSTEM,
  onEvent: printEvent,
});
const run = await agent.run('Сколько минут осталось до полуночи в Токио? Какая это доля суток в процентах?');
if (run.stopReason === 'error') {
  console.error(run.answer);
  process.exit(1);
}
const cached = run.usage.cached ?? 0;
console.log(`\nвход ${run.usage.input}, из них из кеша ${cached} (${Math.round((cached / run.usage.input) * 100)}%), выход ${run.usage.output}`);
console.log(`с кешем: ${cost(run.usage, PRICE_WITH_CACHE)}, без кеша было бы: ${cost(run.usage, PRICE)}`);

console.log('\n── 2. Что ломает кеш\n');
const question: Message = { role: 'user', content: 'Сколько правил в разделе «Тесты»? Ответь числом.' };
const variants: [string, string][] = [
  ['первый запрос', SYSTEM],
  ['тот же system', SYSTEM],
  ['правка в начале system', `Сегодня ${new Date().toISOString()}.\n${SYSTEM}`],
  ['правка в конце system', `${SYSTEM}\nСегодня ${new Date().toISOString()}.`],
];
for (const [name, system] of variants) {
  const result = await chat(config, [{ role: 'system', content: system }, question], { maxTokens: 10 });
  console.log(`${name.padEnd(24)} вход ${result.usage.input}, из кеша ${result.usage.cached ?? 0}`);
}
