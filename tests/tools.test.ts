import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { calculator, currentTime } from '../src/demo-tools.ts';
import { Toolbox, toParameters, type Tool } from '../src/tools.ts';

// Инструмент-пустышка: для реестра важны только имя, описание и схема.
function fake(name: string, schema: z.ZodType = z.object({})): Tool {
  return { name, description: `Инструмент ${name}`, schema, run: async () => 'ok' };
}

const ReadFileArgs = z.object({
  path: z.string().describe('Путь к файлу от корня проекта'),
  limit: z.number().int().min(1).default(200).describe('Сколько строк прочитать'),
});

describe('Шаг 1 / Step 1. toParameters: JSON Schema из zod', () => {
  it('объект: type, properties с описаниями и required', () => {
    const parameters = toParameters('read_file', z.object({ path: z.string().describe('Путь к файлу от корня проекта') }));
    assert.deepEqual(parameters, {
      type: 'object',
      properties: { path: { type: 'string', description: 'Путь к файлу от корня проекта' } },
      required: ['path'],
    });
  });

  it('без $schema: модели он не нужен', () => {
    const parameters = toParameters('read_file', ReadFileArgs);
    assert.ok(!('$schema' in parameters), 'в схеме остался $schema');
  });

  it('поле с default модель может не присылать', () => {
    const parameters = toParameters('read_file', ReadFileArgs);
    assert.deepEqual(parameters.required, ['path']);
    assert.equal((parameters.properties as Record<string, { default?: number }>).limit.default, 200);
  });

  it('аргументы не объектом — ошибка с именем инструмента', () => {
    assert.throws(() => toParameters('echo', z.string()), /echo/);
  });
});

describe('Шаг 2 / Step 2. Toolbox', () => {
  it('register возвращает тот же реестр, get находит по имени', () => {
    const toolbox = new Toolbox();
    const read = fake('read_file');
    const list = fake('list_files');
    assert.equal(toolbox.register(read).register(list), toolbox);
    assert.equal(toolbox.get('read_file'), read);
    assert.equal(toolbox.get('list_files'), list);
  });

  it('незнакомое имя — undefined', () => {
    const toolbox = new Toolbox().register(fake('read_file'));
    assert.equal(toolbox.get('delete_everything'), undefined);
  });

  it('второй инструмент с тем же именем — ошибка', () => {
    const toolbox = new Toolbox().register(fake('read_file'));
    assert.throws(() => toolbox.register(fake('read_file')), /read_file/);
  });

  it('имя не по правилам API — ошибка', () => {
    const toolbox = new Toolbox();
    assert.throws(() => toolbox.register(fake('read file')), /read file/);
    assert.throws(() => toolbox.register(fake('прочитать_файл')), /прочитать_файл/);
    assert.throws(() => toolbox.register(fake('x'.repeat(65))));
  });

  it('схема, которую не перевести в JSON Schema, — ошибка уже при регистрации', () => {
    const toolbox = new Toolbox();
    assert.throws(() => toolbox.register(fake('remind', z.object({ at: z.date() }))));
    assert.equal(toolbox.get('remind'), undefined);
  });

  it('specs: формат tools из Chat Completions, в порядке регистрации', () => {
    const toolbox = new Toolbox().register(fake('read_file', ReadFileArgs)).register(fake('list_files'));
    const specs = toolbox.specs();
    assert.deepEqual(
      specs.map((spec) => spec.function.name),
      ['read_file', 'list_files'],
    );
    assert.deepEqual(specs[0], {
      type: 'function',
      function: { name: 'read_file', description: 'Инструмент read_file', parameters: toParameters('read_file', ReadFileArgs) },
    });
  });

  it('пустой реестр — пустой список', () => {
    assert.deepEqual(new Toolbox().specs(), []);
  });
});

describe('Шаг 3 / Step 3. Калькулятор', () => {
  const spec = () => new Toolbox().register(calculator).specs()[0];

  it('у аргумента expression есть описание', () => {
    const { properties } = spec().function.parameters as { properties: Record<string, { description?: string }> };
    assert.ok(properties.expression?.description, 'опиши expression через .describe()');
  });

  it('схема: арифметика проходит, функции, проценты и запятая — нет', () => {
    for (const expression of ['2350 * 17 / 100', '(1 + 2) * 3', '144 ** 0.5', '-7.5 - 2']) {
      assert.ok(calculator.schema.safeParse({ expression }).success, expression);
    }
    for (const expression of ['sqrt(144) * 3.5', '17% * 2350', '3,5 * 2', 'process.exit()']) {
      assert.ok(!calculator.schema.safeParse({ expression }).success, expression);
    }
  });

  it('run считает выражение', async () => {
    assert.equal(await calculator.run({ expression: '2350 * 17 / 100' }, {}), '399.5');
    assert.equal(await calculator.run({ expression: '(1 + 2) * 3' }, {}), '9');
  });

  it('деление на ноль — исключение с результатом в тексте, а не строка "Infinity"', async () => {
    await assert.rejects(calculator.run({ expression: '1 / 0' }, {}), /Infinity/);
  });

  it('время из get_current_time — в нужном часовом поясе (этот инструмент уже готов)', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 25, 20, 39) });
    const text = await currentTime.run({ timezone: 'Asia/Tokyo' }, {});
    assert.match(text, /26 октября 2026/);
    assert.match(text, /05:39/);
  });
});
