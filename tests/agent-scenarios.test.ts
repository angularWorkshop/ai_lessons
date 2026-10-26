// Проверка твоих сценариев из tests/agent-scenarios.ts.
// Сценарий должен пройти на настоящем агенте и упасть на каждом сломанном агенте из своего списка.
// Тест, который проходит на сломанном коде, ничего не проверяет.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Agent } from '../src/agent.ts';
import * as scenarios from './agent-scenarios.ts';
import { brokenAgent, type Bug } from './support/broken-agent.ts';

const realAgent: scenarios.MakeAgent = (options) => new Agent(options);

type Scenario = (makeAgent: scenarios.MakeAgent) => Promise<void>;

function check(name: string, scenario: Scenario, bugs: [Bug, string][]) {
  it(`${name}: проходит на настоящем агенте`, async () => {
    await scenario(realAgent);
  });
  for (const [bug, description] of bugs) {
    it(`${name}: падает на агенте, который ${description}`, async () => {
      await scenario(realAgent);
      await assert.rejects(
        scenario(brokenAgent(bug)),
        `Сценарий ${name} прошёл на сломанном агенте (${bug}): ${description}. Добавь проверку, которая это заметит.`,
      );
    });
  }
}

describe('Шаг 3 / Step 3. Сценарии: порядок истории и лимит шагов', () => {
  check('historyOrder', scenarios.historyOrder, [
    ['no-system', 'не отправляет system prompt'],
    ['no-tool-results', 'не кладёт результаты инструментов в историю'],
    ['wrong-tool-id', 'кладёт результат с чужим tool_call_id'],
    ['tools-before-assistant', 'кладёт результаты раньше ответа модели'],
  ]);
  check('stepLimit', scenarios.stepLimit, [
    ['no-step-limit', 'не знает про maxSteps'],
    ['no-final-summary', 'обрывает работу без последнего запроса без инструментов'],
  ]);
});

describe('Шаг 4 / Step 4. Сценарии: зацикливание и обрезанный ответ', () => {
  check('repeatedCall', scenarios.repeatedCall, [
    ['no-repeat-guard', 'не замечает одинаковых вызовов'],
    ['repeat-by-name', 'считает повтором тот же инструмент с другими аргументами'],
  ]);
  check('truncatedReply', scenarios.truncatedReply, [
    ['ignores-truncated', 'исполняет обрезанный вызов'],
    ['truncated-loses-history', 'оставляет обрезанный вызов без результата в истории'],
  ]);
});
