// Тема 15.2: поведение агента поддержки — база знаний, источники, отказ, лимит шагов, эскалация.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createSupportAgent } from '../src/support-agent.ts';
import { freshData } from './support/data.ts';
import { ScriptedProvider, textReply, toolMessage, toolReply, type ChatResult } from './support/scripted.ts';

// Один вызов инструмента и его результат: что модель получила бы в ответ.
async function callTool(name: string, args: unknown, dataDir = freshData()): Promise<string> {
  const call = toolReply([{ name, args }]);
  const provider = new ScriptedProvider([call, textReply('Готово')]);
  await createSupportAgent({ provider, dataDir }).run('Вопрос клиента');
  return toolMessage(provider.requests[1], call.toolCalls[0].id);
}

const read = (articlePath: string) => toolReply([{ name: 'read_article', args: { path: articlePath } }]);
const ticketFiles = (dataDir: string) => readdirSync(path.join(dataDir, 'tickets')).sort();

describe('Шаг 1 / Step 1. Инструменты базы знаний: search_kb и read_article', () => {
  it('search_kb находит статью по словам в другой форме', async () => {
    const result = await callTool('search_kb', { query: 'вернуть деньги' });
    assert.match(result, /billing\/refund\.md/);
    assert.match(result, /Возврат денег/);
  });

  it('search_kb находит по заголовку и по тексту', async () => {
    assert.match(await callTool('search_kb', { query: 'двухфакторная аутентификация' }), /account\/two-factor\.md/);
    assert.match(await callTool('search_kb', { query: 'Evernote' }), /data\/import\.md/);
  });

  it('search_kb: нечего найти — ни одной статьи, но и не ошибка', async () => {
    const result = await callTool('search_kb', { query: 'кофемашина эспрессо' });
    assert.doesNotMatch(result, /\.md/);
    assert.doesNotMatch(result, /^Ошибка/);
  });

  it('read_article отдаёт статью целиком', async () => {
    const result = await callTool('read_article', { path: 'billing/refund.md' });
    assert.match(result, /14 дней/);
    assert.match(result, /5–10 рабочих дней/);
  });

  for (const bad of ['../tickets/T-1042.json', 'billing/../../tickets/T-1042.json', '/etc/passwd', '../../package.json']) {
    it(`read_article не выходит за пределы базы: ${bad}`, async () => {
      // В том же прогоне — и чужой путь, и настоящая статья: отказ должен быть именно из-за пути.
      const step = toolReply([
        { name: 'read_article', args: { path: bad } },
        { name: 'read_article', args: { path: 'account/delete.md' } },
      ]);
      const provider = new ScriptedProvider([step, textReply('Готово')]);
      await createSupportAgent({ provider, dataDir: freshData() }).run('Вопрос клиента');

      const rejected = toolMessage(provider.requests[1], step.toolCalls[0].id);
      assert.match(rejected, /^Ошибка/);
      assert.doesNotMatch(rejected, /сменили почту|"name"/, 'содержимое файла вне базы утекло модели');
      assert.match(toolMessage(provider.requests[1], step.toolCalls[1].id), /30 дней/);
    });
  }

  it('read_article: не .md и несуществующая статья — ошибка с подсказкой', async () => {
    assert.match(await callTool('read_article', { path: 'billing/refund' }), /^Ошибка.*\.md/s);
    assert.match(await callTool('read_article', { path: 'billing/business.md' }), /^Ошибка.*search_kb/s);
  });
});

describe('Шаг 2 / Step 2. Источники и честный отказ', () => {
  it('ссылка на прочитанную статью попадает в sources', async () => {
    const provider = new ScriptedProvider([
      read('billing/refund.md'),
      textReply('Да, в течение 14 дней с даты оплаты [billing/refund.md]. Деньги вернутся за 5–10 рабочих дней [billing/refund.md].'),
    ]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Можно вернуть деньги?');
    assert.deepEqual(result.sources, ['billing/refund.md']);
    assert.match(result.answer, /14 дней/);
    assert.equal(result.stopReason, 'done');
  });

  it('ссылка на статью, которую агент не открывал, не считается источником', async () => {
    const provider = new ScriptedProvider([
      read('billing/refund.md'),
      textReply('Вернуть можно за 14 дней [billing/refund.md], а годовой Плюс стоит 2 990 ₽ [billing/plans.md].'),
    ]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Вопрос');
    assert.deepEqual(result.sources, ['billing/refund.md']);
  });

  it('прочитанное в прошлом вопросе не считается в следующем', async () => {
    const provider = new ScriptedProvider([
      read('billing/plans.md'),
      textReply('Плюс — 299 ₽ в месяц [billing/plans.md].'),
      textReply('Годовой Плюс — 2 990 ₽ [billing/plans.md].'),
    ]);
    const agent = createSupportAgent({ provider, dataDir: freshData() });
    assert.deepEqual((await agent.run('Сколько стоит Плюс?')).sources, ['billing/plans.md']);
    assert.deepEqual((await agent.run('А за год?')).sources, []);
  });

  it('ответ без прочитанного источника клиенту не уходит: никаких выдуманных фактов', async () => {
    const provider = new ScriptedProvider([
      toolReply([{ name: 'search_kb', args: { query: 'Business тариф' } }]),
      textReply('Тариф Business стоит 990 ₽ в месяц за человека [billing/business.md].'),
    ]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Сколько стоит Business?');
    assert.deepEqual(result.sources, []);
    assert.equal(result.ticket, undefined);
    assert.doesNotMatch(result.answer, /990/);
    assert.match(result.draft, /990/, 'черновик модели нужен для разбора: что она пыталась сказать');
    assert.ok(result.answer.length > 20, 'клиенту нужен понятный отказ, а не пустая строка');
  });
});

describe('Шаг 3 / Step 3. Лимит шагов', () => {
  const searches = (n: number): ChatResult[] =>
    Array.from({ length: n }, (_, i) => toolReply([{ name: 'search_kb', args: { query: `календарь ${i}` } }]));

  it('по умолчанию не больше 6 запросов к модели, последний — без новых вызовов', async () => {
    const provider = new ScriptedProvider([...searches(5), textReply('Ответа не нашёл.')]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Есть интеграция с календарём?');

    assert.equal(provider.requests.length, 6);
    assert.equal(provider.requests[5].options.toolChoice, 'none');
    assert.notEqual(provider.requests[4].options.toolChoice, 'none');
    assert.equal(result.stopReason, 'max_steps');
    assert.deepEqual(result.sources, []);
  });

  it('maxSteps задаётся опцией; перед последним запросом модель получает объяснение', async () => {
    const provider = new ScriptedProvider([...searches(2), textReply('Не нашёл.')]);
    await createSupportAgent({ provider, dataDir: freshData(), maxSteps: 3 }).run('Вопрос');

    assert.equal(provider.requests.length, 3);
    const last = provider.requests[2].messages.at(-1)!;
    assert.equal(last.role, 'user');
    assert.notEqual(last.content, 'Вопрос');
  });

  it('вызов на последнем шаге не исполняется: тикета нет, но у вызова есть ответ в истории', async () => {
    const dataDir = freshData();
    const lastCall = toolReply([{ name: 'create_ticket', args: { summary: 'Клиент спрашивает про календарь', priority: 'normal' } }]);
    const provider = new ScriptedProvider([searches(1)[0], lastCall]);
    const result = await createSupportAgent({ provider, dataDir, maxSteps: 2 }).run('Вопрос');

    assert.equal(provider.requests.length, 2);
    assert.equal(result.stopReason, 'max_steps');
    assert.equal(result.ticket, undefined);
    assert.deepEqual(ticketFiles(dataDir), ['T-1041.json', 'T-1042.json']);
  });
});

describe('Шаг 4 / Step 4. Эскалация: create_ticket', () => {
  const QUESTION = 'Потерял телефон, резервных кодов нет. Как войти?';
  const ticketCall = () => toolReply([{ name: 'create_ticket', args: { summary: 'Потерян телефон с 2FA, резервных кодов нет', priority: 'normal' } }]);

  it('заводит обращение со следующим номером и вопросом клиента дословно', async () => {
    const dataDir = freshData();
    const provider = new ScriptedProvider([read('account/two-factor.md'), ticketCall(), textReply('Передал специалисту, номер T-1043 [account/two-factor.md].')]);
    const result = await createSupportAgent({ provider, dataDir }).run(QUESTION);

    assert.deepEqual(ticketFiles(dataDir), ['T-1041.json', 'T-1042.json', 'T-1043.json']);
    const saved = JSON.parse(readFileSync(path.join(dataDir, 'tickets', 'T-1043.json'), 'utf8'));
    assert.equal(saved.id, 'T-1043');
    assert.equal(saved.status, 'open');
    assert.equal(saved.priority, 'normal');
    assert.equal(saved.question, QUESTION);
    assert.match(saved.summary, /2FA/);
    assert.ok(!Number.isNaN(Date.parse(saved.createdAt)));

    assert.equal(result.ticket?.id, 'T-1043');
    assert.deepEqual(result.sources, ['account/two-factor.md']);
  });

  it('модель узнаёт номер обращения из результата инструмента', async () => {
    const call = ticketCall();
    const provider = new ScriptedProvider([call, textReply('Передал вопрос специалисту.')]);
    await createSupportAgent({ provider, dataDir: freshData() }).run(QUESTION);
    assert.match(toolMessage(provider.requests[1], call.toolCalls[0].id), /T-1043/);
  });

  it('клиент всегда получает номер обращения, даже если модель его не назвала', async () => {
    const provider = new ScriptedProvider([ticketCall(), textReply('Передал вопрос специалисту.')]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Позовите живого человека');
    assert.match(result.answer, /T-1043/);
    assert.deepEqual(result.sources, []);
  });

  it('одно обращение на вопрос: второй вызов — ошибка для модели, файл один', async () => {
    const dataDir = freshData();
    const second = ticketCall();
    const provider = new ScriptedProvider([ticketCall(), second, textReply('Номер T-1043.')]);
    const result = await createSupportAgent({ provider, dataDir }).run(QUESTION);

    assert.match(toolMessage(provider.requests[2], second.toolCalls[0].id), /^Ошибка.*T-1043/s);
    assert.deepEqual(ticketFiles(dataDir), ['T-1041.json', 'T-1042.json', 'T-1043.json']);
    assert.equal(result.ticket?.id, 'T-1043');
  });

  it('пустая папка тикетов — первый номер T-1001; чужие обращения не меняются', async () => {
    const dataDir = freshData();
    const before = readFileSync(path.join(dataDir, 'tickets', 'T-1042.json'), 'utf8');
    const provider = new ScriptedProvider([ticketCall(), textReply('Готово.')]);
    await createSupportAgent({ provider, dataDir }).run(QUESTION);
    assert.equal(readFileSync(path.join(dataDir, 'tickets', 'T-1042.json'), 'utf8'), before);

    const empty = freshData();
    ticketFiles(empty).forEach((file) => rmSync(path.join(empty, 'tickets', file)));
    const first = new ScriptedProvider([ticketCall(), textReply('Готово.')]);
    const result = await createSupportAgent({ provider: first, dataDir: empty }).run(QUESTION);
    assert.equal(result.ticket?.id, 'T-1001');
  });
});
