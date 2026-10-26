import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgentRun, StopReason } from '../src/agent.ts';
import { COMMANDS, PRICE, runCommand } from '../src/commands.ts';
import { Conversation } from '../src/conversation.ts';
import { calculator } from '../src/demo-tools.ts';
import { exitCode, parseCli, runHeadless, toResult, USAGE_EXIT_CODE, UsageError } from '../src/headless.ts';
import { LlmError, type ChatResult } from '../src/llm.ts';
import type { Provider } from '../src/provider.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

const SYSTEM = 'Ты — агент.';

// Поток вывода, который всё запоминает: так видно, что ушло в stdout, а что в stderr.
function sink() {
  const chunks: string[] = [];
  return { chunks, write: (text: string | Uint8Array) => chunks.push(String(text)) > 0, text: () => chunks.join('') };
}

async function conversationAfter(...replies: ChatResult[]) {
  const provider = new ScriptedProvider(replies);
  const conversation = new Conversation({ provider, toolbox: new Toolbox().register(calculator), system: SYSTEM });
  for (let i = 0; i < replies.length; i++) {
    await conversation.send(`задача ${i + 1}`);
  }
  return { conversation, provider };
}

describe('Шаг 1 / Step 1. Слэш-команды', () => {
  it('строка без / в начале — не команда, её получит модель', async () => {
    const { conversation } = await conversationAfter();
    assert.equal(runCommand('Который час в Токио?', conversation), undefined);
    assert.equal(runCommand('Сколько будет 6 / 3?', conversation), undefined);
    assert.equal(runCommand('', conversation), undefined);
  });

  it('/help перечисляет все команды с описаниями', async () => {
    const { conversation } = await conversationAfter();
    const result = runCommand('/help', conversation);
    for (const [name, command] of Object.entries(COMMANDS)) {
      assert.ok(result?.output.includes(name), `в /help нет ${name}`);
      assert.ok(result?.output.includes(command.description), `в /help нет описания ${name}`);
    }
    assert.deepEqual(Object.keys(COMMANDS).sort(), ['/clear', '/cost', '/exit', '/help']);
  });

  it('/clear забывает историю, но не расход', async () => {
    const { conversation, provider } = await conversationAfter(textReply('Привет!', { usage: { input: 1000, output: 200 } }));
    assert.equal(conversation.messages.length, 2);
    const result = runCommand('/clear', conversation);
    assert.match(result?.output ?? '', /2/);
    assert.equal(conversation.messages.length, 0);
    assert.deepEqual(conversation.usage, { input: 1000, output: 200 });
    assert.equal(provider.requests.length, 1, 'команда не должна ходить к модели');
  });

  it('/cost — токены и деньги за сессию по PRICE', async () => {
    const { conversation } = await conversationAfter(
      textReply('a', { usage: { input: 600, output: 100 } }),
      textReply('b', { usage: { input: 400, output: 100 } }),
    );
    const output = runCommand('/cost', conversation)?.output ?? '';
    const dollars = (1000 * PRICE.inputPerMillion + 200 * PRICE.outputPerMillion) / 1_000_000;
    assert.match(output, /1000/);
    assert.match(output, /200/);
    assert.ok(output.includes(`$${dollars.toFixed(6)}`), `ждали $${dollars.toFixed(6)} в «${output}»`);
  });

  it('/exit просит выйти, остальные — нет', async () => {
    const { conversation } = await conversationAfter();
    assert.equal(runCommand('/exit', conversation)?.exit, true);
    assert.ok(!runCommand('/help', conversation)?.exit);
  });

  it('неизвестная команда — подсказка про /help, а не задача для модели', async () => {
    const { conversation } = await conversationAfter();
    const result = runCommand('/hepl', conversation);
    assert.ok(result, 'строка с / — всегда команда');
    assert.match(result.output, /\/hepl/);
    assert.match(result.output, /\/help/);
    assert.ok(!result.exit);
    assert.ok(runCommand('/constructor', conversation)?.output.includes('/help'), 'свойства объекта — не команды');
  });

  it('пробелы вокруг команды не мешают', async () => {
    const { conversation } = await conversationAfter();
    assert.equal(runCommand('  /exit  ', conversation)?.exit, true);
  });
});

describe('Шаг 2 / Step 2. Аргументы командной строки', () => {
  it('без аргументов — разговор', () => {
    assert.deepEqual(parseCli([]), { mode: 'repl' });
  });

  it('слова без флагов — разговор, начиная с задачи', () => {
    assert.deepEqual(parseCli(['Который', 'час?']), { mode: 'repl', task: 'Который час?' });
  });

  it('-p "задача" — headless', () => {
    assert.deepEqual(parseCli(['-p', 'Который час в Токио?']), { mode: 'headless', task: 'Который час в Токио?', json: false });
    assert.deepEqual(parseCli(['--print', 'Который час?']), { mode: 'headless', task: 'Который час?', json: false });
  });

  it('--json — где угодно рядом с -p', () => {
    assert.deepEqual(parseCli(['-p', 'задача', '--json']), { mode: 'headless', task: 'задача', json: true });
    assert.deepEqual(parseCli(['--json', '-p', 'задача']), { mode: 'headless', task: 'задача', json: true });
  });

  it('ошибки человека — UsageError', () => {
    assert.throws(() => parseCli(['--json']), UsageError, '--json без -p');
    assert.throws(() => parseCli(['-p']), UsageError, '-p без задачи');
    assert.throws(() => parseCli(['-p', '   ']), UsageError, 'пустая задача');
    assert.throws(() => parseCli(['--verbose']), UsageError, 'неизвестный флаг');
    assert.throws(() => parseCli(['-p', 'Который', 'час?']), UsageError, 'задача без кавычек');
  });
});

describe('Шаг 3 / Step 3. Код выхода и результат', () => {
  it('done — 0, error — 1, aborted — 130', () => {
    assert.equal(exitCode('done'), 0);
    assert.equal(exitCode('error'), 1);
    assert.equal(exitCode('aborted'), 130);
  });

  it('лимиты — 3: агент работал, но не закончил', () => {
    for (const reason of ['max_steps', 'budget', 'repeated_call', 'truncated'] as StopReason[]) {
      assert.equal(exitCode(reason), 3, reason);
    }
  });

  it('2 занят ошибкой в аргументах', () => {
    assert.equal(USAGE_EXIT_CODE, 2);
  });

  it('toResult: answer, stopReason, usage и steps — без истории', () => {
    const run: AgentRun = {
      answer: 'В Токио 06:37',
      stopReason: 'done',
      steps: 2,
      usage: { input: 1156, output: 181 },
      messages: [{ role: 'user', content: 'Который час в Токио?' }],
    };
    assert.deepEqual(toResult(run), { answer: 'В Токио 06:37', stopReason: 'done', usage: { input: 1156, output: 181 }, steps: 2 });
  });
});

describe('Шаг 4 / Step 4. runHeadless', () => {
  const calc = (expression: string) => ({ id: 'call_1', name: 'calculate', args: { expression } });

  it('--json: в stdout ровно одна строка JSON, шаги — в stderr, код 0', async () => {
    const stdout = sink();
    const stderr = sink();
    const provider = new ScriptedProvider([
      toolReply([calc('17 * 23')], { usage: { input: 500, output: 30 } }),
      textReply('17 × 23 = 391', { usage: { input: 560, output: 12 } }),
    ]);
    const code = await runHeadless({ agent: { provider, toolbox: new Toolbox().register(calculator), system: SYSTEM }, task: 'Сколько будет 17 * 23?', json: true, stdout, stderr });

    assert.equal(code, 0);
    assert.equal(stdout.text().trim().split('\n').length, 1, `в stdout что-то кроме JSON:\n${stdout.text()}`);
    assert.deepEqual(JSON.parse(stdout.text()), { answer: '17 × 23 = 391', stopReason: 'done', usage: { input: 1060, output: 42 }, steps: 2 });
    assert.match(stderr.text(), /шаг 1/);
    assert.match(stderr.text(), /calculate/);
  });

  it('без --json: в stdout только ответ', async () => {
    const stdout = sink();
    const stderr = sink();
    const provider = new ScriptedProvider([textReply('Готово.')]);
    const code = await runHeadless({ agent: { provider, toolbox: new Toolbox(), system: SYSTEM }, task: 'ok?', json: false, stdout, stderr });
    assert.equal(code, 0);
    assert.equal(stdout.text(), 'Готово.\n');
  });

  it('ошибка провайдера: код 1, в JSON — текст ошибки', async () => {
    const stdout = sink();
    const provider = new ScriptedProvider([new LlmError('LLM API ответил 429: daily_quota_exceeded', { status: 429, code: 'daily_quota_exceeded', retryable: false })]);
    const code = await runHeadless({ agent: { provider, toolbox: new Toolbox(), system: SYSTEM }, task: 'ok?', json: true, stdout, stderr: sink() });
    assert.equal(code, 1);
    const result = JSON.parse(stdout.text());
    assert.equal(result.stopReason, 'error');
    assert.match(result.answer, /daily_quota_exceeded/);
  });

  it('ошибка без --json: stdout пустой, текст ошибки — в stderr', async () => {
    const stdout = sink();
    const stderr = sink();
    const provider = new ScriptedProvider([new LlmError('LLM API ответил 401', { status: 401, code: 'invalid_api_key', retryable: false })]);
    const code = await runHeadless({ agent: { provider, toolbox: new Toolbox(), system: SYSTEM }, task: 'ok?', json: false, stdout, stderr });
    assert.equal(code, 1);
    assert.equal(stdout.text(), '');
    assert.match(stderr.text(), /401/);
  });

  it('лимит шагов: код 3 и stopReason max_steps', async () => {
    const stdout = sink();
    const provider = new ScriptedProvider([toolReply([calc('1 + 1')]), textReply('Не успел досчитать.')]);
    const code = await runHeadless({
      agent: { provider, toolbox: new Toolbox().register(calculator), system: SYSTEM, limits: { maxSteps: 2 } },
      task: 'Считай',
      json: true,
      stdout,
      stderr: sink(),
    });
    assert.equal(code, 3);
    assert.equal(JSON.parse(stdout.text()).stopReason, 'max_steps');
  });

  it('остановили сигналом: код 130, JSON всё равно напечатан', async () => {
    const stdout = sink();
    const controller = new AbortController();
    controller.abort();
    const code = await runHeadless({
      agent: { provider: new ScriptedProvider([]), toolbox: new Toolbox(), system: SYSTEM, signal: controller.signal },
      task: 'ok?',
      json: true,
      stdout,
      stderr: sink(),
    });
    assert.equal(code, 130);
    assert.equal(JSON.parse(stdout.text()).stopReason, 'aborted');
  });

  it('текст модели по мере генерации идёт в stderr, а не в stdout', async () => {
    const stdout = sink();
    const stderr = sink();
    const provider: Provider = {
      complete: () => Promise.reject(new Error('headless должен просить стрим')),
      async stream(_messages, _options, onDelta) {
        onDelta('Сейчас ');
        onDelta('посчитаю.');
        return textReply('Сейчас посчитаю.');
      },
    };
    await runHeadless({ agent: { provider, toolbox: new Toolbox(), system: SYSTEM }, task: 'ok?', json: true, stdout, stderr });
    assert.match(stderr.text(), /модель> Сейчас посчитаю\./);
    assert.deepEqual(Object.keys(JSON.parse(stdout.text())), ['answer', 'stopReason', 'usage', 'steps']);
  });
});
