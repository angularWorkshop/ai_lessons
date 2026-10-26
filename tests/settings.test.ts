import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { Conversation } from '../src/conversation.ts';
import { createHarness } from '../src/harness/create.ts';
import {
  fromSettings,
  globToRegExp,
  headlessPolicy,
  loadSettings,
  matchRule,
  mergeSettings,
  parseSettings,
  SettingsError,
  settingsPolicy,
} from '../src/harness/settings.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const projects: TempProject[] = [];
after(async () => {
  await Promise.all(projects.map((project) => project.remove()));
});

async function temp(files: Record<string, string> = {}) {
  const created = await tempProject(files);
  projects.push(created);
  return created;
}

const edit = (file: string) => ({ tool: 'edit_file', args: { path: file, old_str: 'a', new_str: 'b' } });
const command = (name: string, ...args: string[]) => ({ tool: 'run_command', args: { command: name, args } });

describe('Шаг 1 / Step 1. Схема настроек', () => {
  it('правильный файл проходит как есть', () => {
    const settings = parseSettings(
      JSON.stringify({ model: 'qwen/qwen3.7-flash', limits: { maxSteps: 30 }, permissions: { mode: 'auto', deny: ['edit_file(tests/**)'] }, skills: ['skills'] }),
      'settings.json',
    );
    assert.deepEqual(settings.permissions, { mode: 'auto', deny: ['edit_file(tests/**)'] });
    assert.equal(settings.limits?.maxSteps, 30);
  });

  it('не JSON — SettingsError с именем файла', () => {
    assert.throws(() => parseSettings('{ "model": ', '/p/.agent/settings.json'), (error: Error) => {
      assert.ok(error instanceof SettingsError);
      assert.match(error.message, /\/p\/\.agent\/settings\.json/);
      return true;
    });
  });

  it('опечатка в ключе и неверный тип — ошибки, а не молча пропущенная настройка', () => {
    assert.throws(() => parseSettings('{ "permisions": {} }', 'a.json'), /permisions/);
    assert.throws(() => parseSettings('{ "limits": { "maxSteps": "много" } }', 'a.json'), /maxSteps/);
    assert.throws(() => parseSettings('{ "permissions": { "mode": "yolo" } }', 'a.json'), /mode/);
    assert.throws(() => parseSettings('{ "permissions": { "allow": ["edit file"] } }', 'a.json'), SettingsError);
  });
});

describe('Шаг 2 / Step 2. Слияние слоёв', () => {
  it('скаляры — из последнего слоя, где они заданы', () => {
    const merged = mergeSettings([
      { model: 'user-model', limits: { maxSteps: 10, maxTokens: 50_000 }, permissions: { mode: 'auto' } },
      { model: 'project-model', limits: { maxSteps: 30 } },
      { permissions: { mode: 'read-only' } },
    ]);
    assert.equal(merged.model, 'project-model');
    assert.deepEqual(merged.limits, { maxSteps: 30, maxTokens: 50_000 });
    assert.equal(merged.permissions?.mode, 'read-only');
  });

  it('правила и скиллы складываются без повторов, MCP-серверы — по имени', () => {
    const merged = mergeSettings([
      { permissions: { allow: ['run_command(npm test)'], deny: ['edit_file(.git/**)'] }, skills: ['/home/skills'], mcpServers: { a: { command: 'old' } } },
      { permissions: { allow: ['run_command(npm test)', 'edit_file(src/**)'] }, mcpServers: { a: { command: 'new' }, b: { command: 'b' } } },
      { permissions: { deny: ['edit_file(src/generated/**)'] }, skills: ['/project/skills'] },
    ]);
    assert.deepEqual(merged.permissions, {
      allow: ['run_command(npm test)', 'edit_file(src/**)'],
      deny: ['edit_file(.git/**)', 'edit_file(src/generated/**)'],
    });
    assert.deepEqual(merged.skills, ['/home/skills', '/project/skills']);
    assert.deepEqual(merged.mcpServers, { a: { command: 'new' }, b: { command: 'b' } });
  });

  it('нет слоёв — пустые настройки', () => {
    assert.deepEqual(mergeSettings([]), {});
  });
});

describe('Шаг 3 / Step 3. Файлы слоёв', () => {
  it('пользователь → проект → локальные; пути скиллов — от своего слоя', async () => {
    const home = await temp({ '.agent/settings.json': JSON.stringify({ model: 'from-user', skills: ['my-skills'] }) });
    const project = await temp({
      '.agent/settings.json': JSON.stringify({ model: 'from-project', permissions: { allow: ['run_command(npm test)'] } }),
      '.agent/settings.local.json': JSON.stringify({ permissions: { allow: ['edit_file(src/**)'] }, skills: ['.agent/skills'] }),
    });
    const { settings, files } = await loadSettings({ home: home.root, root: project.root });
    assert.equal(settings.model, 'from-project');
    assert.deepEqual(settings.permissions?.allow, ['run_command(npm test)', 'edit_file(src/**)']);
    assert.deepEqual(settings.skills, [path.join(home.root, 'my-skills'), path.join(project.root, '.agent/skills')]);
    assert.deepEqual(files, [
      path.join(home.root, '.agent/settings.json'),
      path.join(project.root, '.agent/settings.json'),
      path.join(project.root, '.agent/settings.local.json'),
    ]);
  });

  it('файлов нет — настроек нет, это не ошибка', async () => {
    const empty = await temp();
    assert.deepEqual(await loadSettings({ home: empty.outside, root: empty.root }), { settings: {}, files: [] });
  });

  it('битый слой — ошибка с путём, а не работа без него', async () => {
    const project = await temp({ '.agent/settings.local.json': '{ "permissions": { "deny": "всё" } }' });
    await assert.rejects(loadSettings({ home: project.outside, root: project.root }), /settings\.local\.json/);
  });
});

describe('Шаг 4 / Step 4. Правила прав', () => {
  it('шаблоны путей: * внутри папки, ** — сквозь папки', () => {
    assert.ok(globToRegExp('src/*.ts', 'path').test('src/cart.ts'));
    assert.ok(!globToRegExp('src/*.ts', 'path').test('src/deep/cart.ts'));
    assert.ok(globToRegExp('src/**', 'path').test('src/deep/cart.ts'));
    assert.ok(globToRegExp('node *', 'text').test('node scripts/a.mjs'));
    assert.ok(!globToRegExp('a.b', 'path').test('aXb'), 'точка — это точка');
  });

  it('matchRule: имя, путь, команда целиком', () => {
    assert.ok(matchRule('edit_file', edit('src/cart.ts')));
    assert.ok(matchRule('edit_file(src/generated/**)', edit('./src/generated/prices.ts')));
    assert.ok(!matchRule('edit_file(src/generated/**)', edit('src/cart.ts')));
    assert.ok(matchRule('run_command(npm test)', command('npm', 'test')));
    assert.ok(!matchRule('run_command(npm test)', command('npm', 'test', '--', '--watch')));
    assert.ok(matchRule('run_command(node *)', command('node', '-e', '1')));
    assert.ok(matchRule('project__*', { tool: 'project__add_note', args: {} }));
    assert.ok(!matchRule('todo_write(src/**)', { tool: 'todo_write', args: { todos: [] } }), 'у инструмента нет пути — шаблону не с чем сравнивать');
  });

  it('allow снимает вопрос, ask добавляет его, без правила решает режим', () => {
    const policy = settingsPolicy({ mode: 'ask', allow: ['run_command(npm test)'], ask: ['read_file(secrets/**)'] });
    assert.equal(policy(command('npm', 'test')).decision, 'allow');
    assert.equal(policy(command('node', '-e', '1')).decision, 'ask');
    assert.equal(policy({ tool: 'read_file', args: { path: 'secrets/keys.txt' } }).decision, 'ask');
    assert.equal(policy({ tool: 'read_file', args: { path: 'src/cart.ts' } }).decision, 'allow');
  });

  it('deny сильнее allow, в каком бы слое ни лежало разрешение', () => {
    const permissions = mergeSettings([{ permissions: { allow: ['edit_file(src/**)'] } }, { permissions: { deny: ['edit_file(src/generated/**)'] } }]).permissions;
    const policy = settingsPolicy(permissions, 'ask');
    assert.equal(policy(edit('src/cart.ts')).decision, 'allow');
    const verdict = policy(edit('src/generated/prices.ts'));
    assert.equal(verdict.decision, 'deny');
    assert.match(verdict.reason, /src\/generated/);
  });

  it('allow не снимает запретов кода: секреты, выход за корень, read-only', () => {
    const policy = settingsPolicy({ allow: ['edit_file'] }, 'auto');
    assert.equal(policy(edit('.env')).decision, 'deny');
    assert.equal(policy(edit('../outside.ts')).decision, 'deny');
    assert.equal(settingsPolicy({ allow: ['edit_file'] }, 'read-only')(edit('src/a.ts')).decision, 'deny');
  });

  it('режим без явного аргумента берётся из настроек', () => {
    assert.equal(settingsPolicy({ mode: 'auto' })(edit('src/a.ts')).decision, 'allow');
    assert.equal(settingsPolicy({})(edit('src/a.ts')).decision, 'ask');
  });
});

describe('Шаг 5 / Step 5. Headless: ask работает как deny', () => {
  it('ask → deny с честной причиной, остальное как было', () => {
    const policy = headlessPolicy(settingsPolicy({ allow: ['run_command(npm test)'] }, 'ask'));
    assert.equal(policy(command('npm', 'test')).decision, 'allow');
    const verdict = policy(edit('src/cart.ts'));
    assert.equal(verdict.decision, 'deny');
    assert.match(verdict.reason, /спросить некого/);
    assert.match(verdict.reason, /settings\.local\.json/);
    assert.ok(!/человек не разрешил/.test(verdict.reason));
  });

  it('fromSettings: флаг --mode сильнее настроек, лимиты и скиллы — из настроек', () => {
    const settings = { permissions: { mode: 'read-only' as const }, limits: { maxSteps: 7, compactThreshold: 1000 }, skills: ['/s'] };
    const options = fromSettings({ settings, mode: 'auto', headless: false });
    assert.equal(options.mode, 'auto');
    assert.deepEqual(options.limits, { maxSteps: 7 });
    assert.equal(options.compactThreshold, 1000);
    assert.deepEqual(options.skillDirs, ['/s']);
    assert.equal(options.policy?.(edit('src/a.ts')).decision, 'allow');
    assert.equal(fromSettings({ settings, headless: false }).mode, 'read-only');
  });

  it('headless-прогон: правка без разрешения отклонена, модель видит почему', async () => {
    const shop = await temp({ 'package.json': '{}', 'src/cart.ts': 'export const total = 1;\n' });
    const provider = new ScriptedProvider([
      toolReply([{ name: 'edit_file', args: { path: 'src/cart.ts', old_str: '1;', new_str: '2;' } }]),
      textReply('Не могу без разрешения.'),
    ]);
    const harness = await createHarness({ root: shop.root, provider, ...fromSettings({ settings: {}, headless: true }) });
    const run = await new Conversation(harness.agent).send('Поменяй total');
    await harness.close();
    const result = run.messages.find((message) => message.role === 'tool');
    assert.match(String(result?.content), /Отказано: .*спросить некого/);
    assert.equal(await readFile(path.join(shop.root, 'src/cart.ts'), 'utf8'), 'export const total = 1;\n');
  });

  it('headless-прогон: с правилом allow правка проходит без вопроса', async () => {
    const shop = await temp({ 'package.json': '{}', 'src/cart.ts': 'export const total = 1;\n' });
    const provider = new ScriptedProvider([
      toolReply([{ name: 'edit_file', args: { path: 'src/cart.ts', old_str: '1;', new_str: '2;' } }]),
      textReply('Готово.'),
    ]);
    const settings = { permissions: { allow: ['edit_file(src/**)'] } };
    const harness = await createHarness({ root: shop.root, provider, ...fromSettings({ settings, headless: true }) });
    await new Conversation(harness.agent).send('Поменяй total');
    await harness.close();
    assert.equal(await readFile(path.join(shop.root, 'src/cart.ts'), 'utf8'), 'export const total = 2;\n');
  });
});
