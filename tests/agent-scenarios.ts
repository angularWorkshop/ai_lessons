// Твои тесты агента. Каждый сценарий получает фабрику агента и падает, если агент ведёт себя неправильно.
// tests/agent-scenarios.test.ts запустит каждый сценарий дважды: на настоящем Agent (должен пройти)
// и на сломанных агентах из tests/support/broken-agent.ts (должен упасть).
import assert from 'node:assert/strict';
import type { AgentOptions, AgentRun } from '../src/agent.ts';
import { calculator } from '../src/demo-tools.ts';
import type { Message } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

export type MakeAgent = (options: AgentOptions) => { run(task: string, history?: Message[]): Promise<AgentRun> };

const SYSTEM = 'Ты — агент. Считай только через calculate.';
const toolbox = () => new Toolbox().register(calculator);
const calc = (expression: string) => toolReply([{ name: 'calculate', args: { expression } }]);

// Шаг 3: порядок сообщений. Ловит агента без system, без результатов, с чужим id и с результатами не на месте.
export async function historyOrder(makeAgent: MakeAgent): Promise<void> {
  throw new Error('TODO: шаг 3 — сценарий historyOrder');
}

// Шаг 3: лимит шагов. Ловит агента без лимита и агента, который обрывает работу без итога.
export async function stepLimit(makeAgent: MakeAgent): Promise<void> {
  throw new Error('TODO: шаг 3 — сценарий stepLimit');
}

// Шаг 4: зацикливание. Ловит агента без защиты и агента, который путает повтор с работой.
export async function repeatedCall(makeAgent: MakeAgent): Promise<void> {
  throw new Error('TODO: шаг 4 — сценарий repeatedCall');
}

// Шаг 4: обрезанный ответ. Ловит агента, который исполняет обрезанный вызов, и агента, который ломает историю.
export async function truncatedReply(makeAgent: MakeAgent): Promise<void> {
  throw new Error('TODO: шаг 4 — сценарий truncatedReply');
}
