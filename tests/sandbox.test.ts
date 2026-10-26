import assert from 'node:assert/strict';
import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import type { ChildLike, SpawnFn } from '../src/code-tools/run-command.ts';
import { REDACTED } from '../src/security/redact.ts';
import {
  checkSandbox,
  DEFAULT_RULES,
  describeRules,
  readScripts,
  sandboxCommandTool,
  secureCodeTools,
  type SandboxRules,
} from '../src/security/sandbox.ts';
import { Toolbox } from '../src/tools.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const PROJECT = {
  'package.json': JSON.stringify({ name: 'shop', scripts: { test: 'tsx --test tests/cart.test.ts', lint: 'tsc --noEmit', build: 'tsc' } }, null, 2),
  'src/cart.ts': 'export const total = 1;\n',
  '.env': 'SHOP_API_KEY=demo_not_a_real_key_0000\n',
};

let project: TempProject;
before(async () => {
  project = await tempProject(PROJECT);
});
after(() => project.remove());

// Таблица: команда → null (можно) или кусок причины отказа.
async function verdict(command: string, args: string[] = [], rules: SandboxRules = DEFAULT_RULES) {
  return checkSandbox(project.root, command, args, rules, await readScripts(project.root));
}

describe('Шаг 1 / Step 1. Политика команд', () => {
  const table: [string, string[], RegExp | null][] = [
    ['npm', ['test'], null],
    ['ls', ['src'], null],
    ['ls', ['-la'], null],
    ['cat', ['src/cart.ts'], null],
    ['npm', ['publish'], /так npm запускать нельзя/],
    ['npm', ['install', 'left-pad'], /так npm запускать нельзя/],
    ['npm', ['test', '--', '--watch'], /так npm запускать нельзя/],
    ['sh', ['-c', 'ls'], /shell/],
    ['bash', ['-c', 'ls'], /shell/],
    ['jsh', [], /shell/],
    ['node', ['-e', '1'], /любой код в одной строке/],
    ['node', ['-p', '1'], /любой код в одной строке/],
    ['node', ['--eval=1'], /любой код в одной строке/],
    ['node', ['src/cart.ts'], /исполняет любой код, даже из файла проекта/],
    ['npx', ['left-pad'], /исполняет любой код/],
    ['/bin/ls', [], /без пути/],
    ['cat', ['../outside/secret.txt'], /выходит за корень/],
    ['cat', ['.env'], /секрет/],
    ['ls', ['/'], /абсолютный/],
    ['git', ['status'], /нет в списке разрешённых/],
  ];

  for (const [command, args, expected] of table) {
    const line = [command, ...args].join(' ');
    it(`${line} → ${expected ? 'нельзя' : 'можно'}`, async () => {
      const result = await verdict(command, args);
      if (expected === null) assert.equal(result, null);
      else assert.match(result ?? '(разрешено)', expected);
    });
  }

  it('ссылка внутри проекта, ведущая наружу, — нельзя', async (t) => {
    if (!(await project.link(project.outside, 'out'))) return t.skip('файловая система без ссылок');
    assert.match((await verdict('cat', ['out/secret.txt'])) ?? '(разрешено)', /ссылка за пределы/);
  });

  it('команду, объявленную целиком, можно — но только ровно такую', async () => {
    const rules: SandboxRules = { ...DEFAULT_RULES, commands: [['node', '--version']] };
    assert.equal(await verdict('node', ['--version'], rules), null);
    assert.match((await verdict('node', ['--version', 'x'], rules)) ?? '', /исполняет любой код/);
    assert.match(describeRules(rules), /node --version/);
  });
});

describe('Шаг 2 / Step 2. npm run: имя из списка, скрипт не менялся', () => {
  const rules: SandboxRules = { ...DEFAULT_RULES, npmScripts: ['test', 'lint'] };

  it('readScripts: скрипты из package.json; нет файла или сломан — пусто', async () => {
    assert.deepEqual(Object.keys(await readScripts(project.root)), ['test', 'lint', 'build']);
    const empty = await tempProject({ 'package.json': '{ сломан' });
    try {
      assert.deepEqual(await readScripts(empty.root), {});
      assert.deepEqual(await readScripts(path.join(empty.root, 'нет')), {});
    } finally {
      await empty.remove();
    }
  });

  it('npm run lint — можно, npm run build — скрипта нет в списке', async () => {
    assert.equal(await verdict('npm', ['run', 'lint'], rules), null);
    assert.match((await verdict('npm', ['run', 'build'], rules)) ?? '', /скрипта build нет в списке разрешённых/);
    assert.match((await verdict('npm', ['run'], rules)) ?? '', /так npm запускать нельзя/);
    assert.match((await verdict('npm', ['run', '--prefix'], rules)) ?? '', /так npm запускать нельзя/);
  });

  it('скрипт из списка, которого нет в package.json, — нельзя', async () => {
    const strict: SandboxRules = { ...DEFAULT_RULES, npmScripts: ['test', 'e2e'] };
    assert.match((await verdict('npm', ['run', 'e2e'], strict)) ?? '', /в package\.json нет скрипта e2e/);
  });

  it('скрипт изменился после старта — нельзя, пока человек не перезапустит агента', async () => {
    const snapshot = await readScripts(project.root);
    const changed = await tempProject({ 'package.json': JSON.stringify({ scripts: { ...snapshot, test: 'tsx --test tests/*.ts && echo ok' } }) });
    try {
      const result = await checkSandbox(changed.root, 'npm', ['test'], DEFAULT_RULES, snapshot);
      assert.match(result ?? '', /изменился после старта агента/);
    } finally {
      await changed.remove();
    }
  });
});

// Заглушка процесса, как в теме 5.3: тест сам решает, что напечатать.
class FakeChild extends EventEmitter implements ChildLike {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill(): boolean {
    return true;
  }
  finish(code: number): void {
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit('close', code, null));
  }
}

function fakeSpawn(print: string) {
  const calls: { command: string; args: string[]; options: SpawnOptions }[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new FakeChild();
    setImmediate(() => {
      child.stdout.write(print);
      child.finish(0);
    });
    return child;
  };
  return { spawn, calls };
}

const call = (command: string, args: string[]) => ({ id: 'c1', name: 'run_command', arguments: JSON.stringify({ command, args }) });

describe('Шаг 3 / Step 3. run_command в песочнице', () => {
  it('разрешённая команда: корень проекта, без shell, чистое окружение', async () => {
    const fake = fakeSpawn('# pass 7\n');
    const env = { PATH: '/bin', LLM_API_KEY: 'edt_agent_key_123', NODE_OPTIONS: '--require ./x.js' };
    const toolbox = new Toolbox().register(await sandboxCommandTool(project.root, { spawn: fake.spawn, env }));
    const result = await toolbox.execute(call('npm', ['test']));
    assert.equal(result.isError, false);
    assert.equal(fake.calls.length, 1);
    const { options } = fake.calls[0];
    assert.equal(options.cwd, project.root);
    assert.ok(!options.shell);
    assert.deepEqual(options.env, { PATH: '/bin' });
  });

  it('секрет в выводе разрешённой команды приходит как [секрет скрыт]', async () => {
    const fake = fakeSpawn('KEY=demo_not_a_real_key_0000\n# pass 7\n');
    const tool = await sandboxCommandTool(project.root, { spawn: fake.spawn, secrets: ['demo_not_a_real_key_0000'] });
    const result = await new Toolbox().register(tool).execute(call('npm', ['test']));
    assert.doesNotMatch(result.content, /demo_not_a_real_key_0000/);
    assert.ok(result.content.includes(`KEY=${REDACTED}`));
  });

  it('запрещённая команда не запускается, модель видит причину и список разрешённого', async () => {
    const fake = fakeSpawn('');
    const tool = await sandboxCommandTool(project.root, { spawn: fake.spawn });
    const result = await new Toolbox().register(tool).execute(call('node', ['-e', '1']));
    assert.equal(result.isError, true);
    assert.match(result.content, /любой код в одной строке/);
    assert.equal(fake.calls.length, 0);
    assert.match(tool.description, /Можно только: npm test, ls <путь>, cat <путь>/);
  });

  it('secureCodeTools: те же пять инструментов, run_command — из песочницы', async () => {
    const tools = await secureCodeTools(project.root);
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['edit_file', 'grep', 'list_files', 'read_file', 'run_command']);
    assert.match(tools.find((tool) => tool.name === 'run_command')!.description, /Можно только/);
  });

  it('правка скрипта test через edit_file — и npm test больше не запускается', async () => {
    const local = await tempProject(PROJECT);
    try {
      const fake = fakeSpawn('');
      const toolbox = new Toolbox();
      for (const tool of await secureCodeTools(local.root, { spawn: fake.spawn })) toolbox.register(tool);
      const edit = { id: 'e1', name: 'edit_file', arguments: JSON.stringify({ path: 'package.json', old_str: 'tsx --test tests/cart.test.ts', new_str: 'tsx --test tests/*.ts' }) };
      assert.equal((await toolbox.execute(edit)).isError, false);
      const result = await toolbox.execute(call('npm', ['test']));
      assert.match(result.content, /изменился после старта агента/);
      assert.equal(fake.calls.length, 0);
      await writeFile(path.join(local.root, 'package.json'), PROJECT['package.json']);
      assert.equal((await toolbox.execute(call('npm', ['test']))).isError, false, 'вернули как было — снова можно');
    } finally {
      await local.remove();
    }
  });
});
