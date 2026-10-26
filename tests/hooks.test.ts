import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { editFileTool } from '../src/code-tools/edit-file.ts';
import { codePolicy, GuardedToolbox } from '../src/code-tools/permissions.ts';
import { Conversation } from '../src/conversation.ts';
import { createHarness } from '../src/harness/create.ts';
import { HookedToolbox, HookError, hookMatches, loadHooks, type LoadedHook } from '../src/harness/hooks.ts';
import { fromSettings, loadSettings, mergeSettings, parseSettings, protectHarness, settingsPolicy } from '../src/harness/settings.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const projects: TempProject[] = [];
after(async () => {
  await Promise.all(projects.map((project) => project.remove()));
});

async function shop(files: Record<string, string> = {}) {
  const project = await tempProject({
    'package.json': '{}',
    'src/cart.ts': 'export const total = 1;\n',
    'src/generated/codes.ts': '// @generated\nexport const CODES = [];\n',
    ...files,
  });
  projects.push(project);
  return project;
}

const read = (project: TempProject, file: string) => readFile(path.join(project.root, file), 'utf8');
const editCall = (file: string, oldStr: string, newStr: string) => ({
  id: 'c1',
  name: 'edit_file',
  arguments: JSON.stringify({ path: file, old_str: oldStr, new_str: newStr }),
});

// Toolbox с edit_file, режим auto: права пропускают правки внутри проекта.
function toolbox(project: TempProject, hooks: LoadedHook[]) {
  const box = new HookedToolbox({ policy: codePolicy('auto'), confirm: async () => 'no', hooks, root: project.root });
  box.register(editFileTool(project.root));
  return box;
}

const hook = (event: LoadedHook['event'], run: LoadedHook['run'], matcher = 'edit_file'): LoadedHook => ({ event, matcher, name: `${event}.mjs`, run });

describe('Шаг 1 / Step 1. Какие хуки и откуда', () => {
  it('matcher: имя, список через |, шаблон со *', () => {
    assert.ok(hookMatches('edit_file', 'edit_file'));
    assert.ok(!hookMatches('edit_file', 'edit_files'));
    assert.ok(hookMatches('edit_file|run_command', 'run_command'));
    assert.ok(hookMatches('project__*', 'project__add_note'));
    assert.ok(hookMatches('*', 'grep'));
  });

  it('loadHooks подключает модуль с export default function', async () => {
    const project = await shop({ '.agent/hooks/deny.mjs': "export default ({ tool }) => ({ block: `нельзя ${tool}` });\n" });
    const hooks = await loadHooks({ PreToolUse: [{ matcher: 'edit_file', module: path.join(project.root, '.agent/hooks/deny.mjs') }] });
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].event, 'PreToolUse');
    assert.equal(hooks[0].matcher, 'edit_file');
    assert.equal(hooks[0].name, 'deny.mjs');
    assert.deepEqual(await hooks[0].run({ event: 'PreToolUse', tool: 'edit_file', args: {}, root: project.root }), { block: 'нельзя edit_file' });
    assert.equal((await loadHooks({ PostToolUse: [{ module: path.join(project.root, '.agent/hooks/deny.mjs') }] }))[0].matcher, '*');
  });

  it('нет файла или нет функции — HookError при старте', async () => {
    const project = await shop({ '.agent/hooks/empty.mjs': 'export const x = 1;\n' });
    await assert.rejects(loadHooks({ PreToolUse: [{ module: path.join(project.root, 'nope.mjs') }] }), HookError);
    await assert.rejects(loadHooks({ PostToolUse: [{ module: path.join(project.root, '.agent/hooks/empty.mjs') }] }), /export default/);
  });
});

describe('Шаг 2 / Step 2. PreToolUse: заблокировать или изменить', () => {
  it('block — инструмент не запускается, модель видит причину', async () => {
    const project = await shop();
    const box = toolbox(project, [hook('PreToolUse', () => ({ block: 'файл сгенерирован' }))]);
    const result = await box.execute(editCall('src/generated/codes.ts', '[]', "['A']"));
    assert.equal(result.isError, true);
    assert.match(result.content, /Заблокировано хуком PreToolUse\.mjs: файл сгенерирован/);
    assert.equal(await read(project, 'src/generated/codes.ts'), '// @generated\nexport const CODES = [];\n');
  });

  it('args — вызов идёт с новыми аргументами, следующий хук видит уже их', async () => {
    const project = await shop();
    const seen: unknown[] = [];
    const box = toolbox(project, [
      hook('PreToolUse', ({ args }) => ({ args: { ...args, path: String(args.path).replace(/^\.\//, '') } })),
      hook('PreToolUse', ({ args }) => void seen.push(args.path)),
    ]);
    const result = await box.execute(editCall('./src/cart.ts', '1;', '2;'));
    assert.equal(result.isError, false);
    assert.deepEqual(seen, ['src/cart.ts']);
    assert.equal(await read(project, 'src/cart.ts'), 'export const total = 2;\n');
  });

  it('права проверяют аргументы после хука: хук не проведёт вызов мимо deny', async () => {
    const project = await shop();
    const box = toolbox(project, [hook('PreToolUse', ({ args }) => ({ args: { ...args, path: '.env' } }))]);
    const result = await box.execute(editCall('src/cart.ts', '1;', '2;'));
    assert.match(result.content, /Отказано: запись в файл с секретами/);
    assert.ok(box instanceof GuardedToolbox);
  });

  it('упавший хук — отказ, а не пропуск; хук другого инструмента не вызывается', async () => {
    const project = await shop();
    let called = false;
    const box = toolbox(project, [
      hook('PreToolUse', () => void (called = true), 'run_command'),
      hook('PreToolUse', () => {
        throw new Error('нет файла правил');
      }),
    ]);
    const result = await box.execute(editCall('src/cart.ts', '1;', '2;'));
    assert.match(result.content, /хук упал — нет файла правил/);
    assert.equal(called, false);
    assert.equal(await read(project, 'src/cart.ts'), 'export const total = 1;\n');
  });
});

describe('Шаг 3 / Step 3. PostToolUse: увидеть результат', () => {
  it('хук получает результат, feedback дописывается для модели', async () => {
    const project = await shop();
    const results: string[] = [];
    const box = toolbox(project, [
      hook('PostToolUse', ({ result }) => {
        results.push(result!.content.split('\n')[0]);
        return { feedback: 'npm test: зелёные' };
      }),
    ]);
    const result = await box.execute(editCall('src/cart.ts', '1;', '2;'));
    assert.deepEqual(results, ['Изменён src/cart.ts']);
    assert.match(result.content, /^Изменён src\/cart\.ts/);
    assert.match(result.content, /\n\n\[хук PostToolUse\.mjs\] npm test: зелёные$/);
    assert.equal(result.isError, false);
  });

  it('видит и ошибки инструмента; упавший PostToolUse — пометка, результат не теряется', async () => {
    const project = await shop();
    const errors: boolean[] = [];
    const box = toolbox(project, [
      hook('PostToolUse', ({ result }) => void errors.push(result!.isError)),
      hook('PostToolUse', () => {
        throw new Error('диск полон');
      }),
    ]);
    const result = await box.execute(editCall('src/cart.ts', 'нет такого', 'x'));
    assert.deepEqual(errors, [true]);
    assert.equal(result.isError, true);
    assert.match(result.content, /old_str не найден/);
    assert.match(result.content, /\[хук PostToolUse\.mjs упал: диск полон\]/);
  });
});

describe('Шаг 4 / Step 4. Хуки в настройках', () => {
  it('хуки в схеме и в слиянии: складываются, сначала пользователя, потом проекта', () => {
    const settings = parseSettings(JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'edit_file', module: 'a.mjs' }] } }), 'f');
    assert.deepEqual(settings.hooks, { PreToolUse: [{ matcher: 'edit_file', module: 'a.mjs' }] });
    assert.throws(() => parseSettings(JSON.stringify({ hooks: { BeforeTool: [] } }), 'f'), /BeforeTool/);
    assert.throws(() => parseSettings(JSON.stringify({ hooks: { PreToolUse: [{ command: 'jq' }] } }), 'f'));
    const merged = mergeSettings([
      { hooks: { PostToolUse: [{ module: '/home/log.mjs' }] } },
      { hooks: { PreToolUse: [{ module: '/p/guard.mjs' }], PostToolUse: [{ module: '/p/check.mjs' }] } },
    ]);
    assert.deepEqual(merged.hooks, { PreToolUse: [{ module: '/p/guard.mjs' }], PostToolUse: [{ module: '/home/log.mjs' }, { module: '/p/check.mjs' }] });
  });

  it('путь к модулю — от своего слоя, fromSettings передаёт хуки дальше', async () => {
    const home = await shop({ '.agent/settings.json': JSON.stringify({ hooks: { PostToolUse: [{ module: '.agent/log.mjs' }] } }) });
    const project = await shop({ '.agent/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ module: '.agent/hooks/guard.mjs' }] } }) });
    const { settings } = await loadSettings({ home: home.root, root: project.root });
    assert.equal(settings.hooks?.PostToolUse?.[0].module, path.join(home.root, '.agent/log.mjs'));
    assert.equal(settings.hooks?.PreToolUse?.[0].module, path.join(project.root, '.agent/hooks/guard.mjs'));
    assert.deepEqual(fromSettings({ settings, headless: true }).hooks, settings.hooks);
  });

  it('агент не правит .agent/: ни allow, ни режим auto этого не меняют', () => {
    const policy = protectHarness(settingsPolicy({ allow: ['edit_file'] }, 'auto'));
    for (const file of ['.agent/settings.json', './.agent/hooks/no-generated.mjs', '.agent']) {
      assert.equal(policy({ tool: 'edit_file', args: { path: file, old_str: '', new_str: '' } }).decision, 'deny', file);
    }
    assert.equal(policy({ tool: 'edit_file', args: { path: 'src/agent.ts', old_str: '', new_str: '' } }).decision, 'allow');
    assert.equal(policy({ tool: 'read_file', args: { path: '.agent/settings.json' } }).decision, 'allow');
    const fromFile = fromSettings({ settings: { permissions: { mode: 'auto' } }, headless: false }).policy!;
    assert.equal(fromFile({ tool: 'edit_file', args: { path: '.agent/settings.local.json', old_str: '', new_str: '{}' } }).decision, 'deny');
  });
});

describe('Шаг 5 / Step 5. Хуки в harness', () => {
  it('createHarness с хуками: модель получает отказ хука и не трогает сгенерированный файл', async () => {
    const project = await shop({
      '.agent/hooks/no-generated.mjs':
        "export default ({ args }) => String(args.path).startsWith('src/generated/') ? { block: 'файл сгенерирован, правь источник' } : undefined;\n",
    });
    const provider = new ScriptedProvider([
      toolReply([{ name: 'edit_file', args: { path: 'src/generated/codes.ts', old_str: '[]', new_str: "['SPRING']" } }]),
      textReply('Файл сгенерирован, не трогаю.'),
    ]);
    const harness = await createHarness({
      root: project.root,
      provider,
      mode: 'auto',
      hooks: { PreToolUse: [{ matcher: 'edit_file', module: path.join(project.root, '.agent/hooks/no-generated.mjs') }] },
    });
    assert.ok(harness.toolbox instanceof HookedToolbox);
    const run = await new Conversation(harness.agent).send('Добавь SPRING');
    await harness.close();
    const result = run.messages.find((message) => message.role === 'tool');
    assert.match(String(result?.content), /Заблокировано хуком no-generated\.mjs: файл сгенерирован/);
    assert.equal(await read(project, 'src/generated/codes.ts'), '// @generated\nexport const CODES = [];\n');

    // Без хуков — прежний GuardedToolbox.
    const plain = await createHarness({ root: project.root, provider: new ScriptedProvider([]) });
    assert.ok(!(plain.toolbox instanceof HookedToolbox));
    assert.ok(plain.toolbox instanceof GuardedToolbox);
    await plain.close();
  });
});
