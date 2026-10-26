import assert from 'node:assert/strict';
import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  checkCommand,
  cleanEnv,
  OutputBuffer,
  runCommandTool,
  type ChildLike,
  type RunCommandOptions,
  type SpawnFn,
} from '../src/code-tools/run-command.ts';
import { Toolbox, type ToolContext } from '../src/tools.ts';
import { SHOP, tempProject, type TempProject } from './support/temp-project.ts';

// Заглушка дочернего процесса: тест сам решает, что он напечатает, с каким кодом выйдет и как ответит на kill.
class FakeChild extends EventEmitter implements ChildLike {
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals: NodeJS.Signals[] = [];
  /** На какой сигнал процесс завершится. null — не завершится ни на какой. */
  diesOn: NodeJS.Signals | null = 'SIGTERM';
  /** Не умирает даже от SIGKILL: так бывает с зависшим процессом в WebContainer. */
  immortal = false;

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal);
    if (!this.immortal && (signal === this.diesOn || signal === 'SIGKILL')) {
      this.finish(null, signal);
    }
    return true;
  }

  finish(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit('close', code, signal));
  }
}

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
}

// spawn-заглушка: запоминает вызовы и отдаёт процесс, которым управляет script.
function fakeSpawn(script: (child: FakeChild) => void) {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new FakeChild();
    children.push(child);
    setImmediate(() => script(child));
    return child;
  };
  return { spawn, calls, children };
}

let project: TempProject;
before(async () => {
  project = await tempProject(SHOP);
});
after(() => project.remove());

async function run(options: RunCommandOptions, command: string, args: string[] = [], ctx: ToolContext = {}) {
  const toolbox = new Toolbox({ maxResultChars: 100_000 }).register(runCommandTool(project.root, options));
  return toolbox.execute({ id: 'call_1', name: 'run_command', arguments: JSON.stringify({ command, args }) }, ctx);
}

describe('Шаг 1 / Step 1. Белый список', () => {
  it('можно: node, npm test, ls и cat внутри проекта', async () => {
    assert.equal(await checkCommand(project.root, 'node', ['-e', '1']), null);
    assert.equal(await checkCommand(project.root, 'npm', ['test']), null);
    assert.equal(await checkCommand(project.root, 'npm', ['test', '--', '--test-name-pattern', 'скидка']), null);
    assert.equal(await checkCommand(project.root, 'ls', ['-la', 'src']), null);
    assert.equal(await checkCommand(project.root, 'cat', ['src/cart.ts']), null);
  });

  it('нельзя: чужие программы и npm кроме test', async () => {
    assert.match((await checkCommand(project.root, 'bash', ['-c', 'ls'])) ?? '', /нет в белом списке/);
    assert.match((await checkCommand(project.root, 'rm', ['-rf', '.'])) ?? '', /нет в белом списке/);
    assert.match((await checkCommand(project.root, 'npm', ['install', 'left-pad'])) ?? '', /только npm test/);
    assert.match((await checkCommand(project.root, 'npm', [])) ?? '', /только npm test/);
  });

  it('cat и ls не выходят за корень и не читают .env', async () => {
    await assert.rejects(checkCommand(project.root, 'cat', ['../outside/secret.txt']), /выходит за корень/);
    await assert.rejects(checkCommand(project.root, 'cat', ['.env']), /секрет/);
    await assert.rejects(checkCommand(project.root, 'ls', ['/']), /абсолютный/);
  });

  it('запрещённая команда — ошибка для модели, процесс не запускается', async () => {
    const fake = fakeSpawn((child) => child.finish(0));
    const result = await run({ spawn: fake.spawn }, 'git', ['status']);
    assert.equal(result.isError, true);
    assert.match(result.content, /нет в белом списке.*node, npm test, ls, cat/);
    assert.equal(fake.calls.length, 0);
  });
});

describe('Шаг 2 / Step 2. Запуск и код выхода', () => {
  it('spawn без shell, в корне проекта, stdin закрыт', async () => {
    const fake = fakeSpawn((child) => child.finish(0));
    await run({ spawn: fake.spawn }, 'npm', ['test']);
    assert.equal(fake.calls.length, 1);
    const { command, args, options } = fake.calls[0];
    assert.equal(command, 'npm');
    assert.deepEqual(args, ['test']);
    assert.equal(options.cwd, project.root);
    assert.ok(!options.shell, 'shell должен быть выключен');
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  });

  it('node — это process.execPath: тот же Node, что у агента', async () => {
    const fake = fakeSpawn((child) => child.finish(0));
    await run({ spawn: fake.spawn }, 'node', ['-v']);
    assert.equal(fake.calls[0].command, process.execPath);
  });

  it('в результате: команда, код выхода, stdout и stderr', async () => {
    const fake = fakeSpawn((child) => {
      child.stdout.write('✔ сумма корзины\n');
      child.stderr.write('✖ ровно 1000 ₽\n');
      child.finish(1);
    });
    const result = await run({ spawn: fake.spawn }, 'npm', ['test']);
    assert.equal(result.isError, false, 'упавший тест — не сбой инструмента, а ответ для модели');
    assert.equal(result.content, '$ npm test\nкод выхода: 1\n✔ сумма корзины\n✖ ровно 1000 ₽');
  });

  it('нет вывода — так и пишем; программы нет — ошибка', async () => {
    const quiet = fakeSpawn((child) => child.finish(0));
    assert.equal((await run({ spawn: quiet.spawn }, 'ls')).content, '$ ls\nкод выхода: 0\n(вывода нет)');
    const missing = fakeSpawn((child) => child.emit('error', Object.assign(new Error('spawn ls ENOENT'), { code: 'ENOENT' })));
    const result = await run({ spawn: missing.spawn }, 'ls');
    assert.equal(result.isError, true);
    assert.match(result.content, /ENOENT/);
  });
});

describe('Шаг 3 / Step 3. Голова и хвост вывода', () => {
  it('короткий вывод — целиком', () => {
    const buffer = new OutputBuffer(20);
    buffer.push('hello ');
    buffer.push('world');
    assert.equal(buffer.toString(), 'hello world');
  });

  it('длинный — начало, сколько пропущено, конец', () => {
    const buffer = new OutputBuffer(10);
    for (const chunk of ['abc', 'defgh', 'ijklmnop', 'qrstuvwxyz']) buffer.push(chunk);
    assert.equal(buffer.toString(), 'abcde\n…[пропущено 16 символов из 26]…\nvwxyz');
  });

  it('run_command обрезает вывод: первая и последняя строки на месте', async () => {
    const fake = fakeSpawn((child) => {
      for (let i = 1; i <= 5000; i++) child.stdout.write(`строка ${i}\n`);
      child.finish(1);
    });
    const result = await run({ spawn: fake.spawn, maxOutputChars: 1000 }, 'npm', ['test']);
    assert.ok(result.content.length < 1200, `длина ${result.content.length}`);
    assert.match(result.content, /^\$ npm test\nкод выхода: 1\nстрока 1\n/);
    assert.match(result.content, /пропущено \d+ символов/);
    assert.match(result.content, /строка 5000$/);
  });
});

describe('Шаг 4 / Step 4. Таймаут и окружение', () => {
  it('зависшая команда: SIGTERM по таймауту, в результате — что случилось', async () => {
    const fake = fakeSpawn((child) => child.stdout.write('жду…\n'));
    const started = Date.now();
    const result = await run({ spawn: fake.spawn, timeoutMs: 50 }, 'node', ['-e', 'setInterval(() => {}, 1000)']);
    assert.ok(Date.now() - started < 1000);
    assert.deepEqual(fake.children[0].signals, ['SIGTERM']);
    assert.match(result.content, /остановлена по таймауту: работала дольше 0.05 с\nзавершена сигналом SIGTERM\nжду…/);
  });

  it('не послушался SIGTERM — SIGKILL после паузы', async () => {
    const fake = fakeSpawn((child) => {
      child.diesOn = null;
    });
    const result = await run({ spawn: fake.spawn, timeoutMs: 20, killGraceMs: 20 }, 'node', ['-e', '']);
    assert.deepEqual(fake.children[0].signals, ['SIGTERM', 'SIGKILL']);
    assert.match(result.content, /сигналом SIGKILL/);
  });

  it('не умер и от SIGKILL — агент всё равно не висит', async () => {
    const fake = fakeSpawn((child) => {
      child.immortal = true;
    });
    const result = await run({ spawn: fake.spawn, timeoutMs: 20, killGraceMs: 20 }, 'node', ['-e', '']);
    assert.deepEqual(fake.children[0].signals, ['SIGTERM', 'SIGKILL']);
    assert.match(result.content, /таймауту/);
  });

  it('отмена агента останавливает команду', async () => {
    const controller = new AbortController();
    const fake = fakeSpawn(() => setTimeout(() => controller.abort(), 10));
    const result = await run({ spawn: fake.spawn }, 'npm', ['test'], { signal: controller.signal });
    assert.deepEqual(fake.children[0].signals, ['SIGTERM']);
    assert.match(result.content, /агента отменили/);
  });

  it('cleanEnv: только безопасные переменные', () => {
    assert.deepEqual(cleanEnv({ PATH: '/bin', HOME: '/home/me', LLM_API_KEY: 'edt_secret', GITHUB_TOKEN: 'x' }), {
      PATH: '/bin',
      HOME: '/home/me',
    });
  });

  it('ключ из окружения агента не доходит до spawn', async () => {
    const fake = fakeSpawn((child) => child.finish(0));
    await run({ spawn: fake.spawn, env: { PATH: '/bin', LLM_API_KEY: 'edt_secret' } }, 'npm', ['test']);
    assert.deepEqual(fake.calls[0].options.env, { PATH: '/bin' });
  });

  it('настоящий node -e: код выхода и вывод на месте, ключа нет', async () => {
    const env = { ...process.env, LLM_API_KEY: 'edt_secret' };
    const script = "console.log(process.env.LLM_API_KEY ?? 'ключа нет'); process.exitCode = 3";
    const result = await run({ env }, 'node', ['-e', script]);
    assert.equal(result.isError, false, result.content);
    assert.equal(result.content, `$ node -e ${script}\nкод выхода: 3\nключа нет`);
  });
});

describe('Шаг 4 / Step 4. Команды и правки — по очереди', () => {
  it('две команды за шаг не идут одновременно', async () => {
    let active = 0;
    let maxActive = 0;
    const fake = fakeSpawn(async (child) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active--;
      child.finish(0);
    });
    const tool = runCommandTool(project.root, { spawn: fake.spawn });
    const toolbox = new Toolbox().register(tool);
    await Promise.all([
      toolbox.execute({ id: '1', name: 'run_command', arguments: '{"command":"ls"}' }),
      toolbox.execute({ id: '2', name: 'run_command', arguments: '{"command":"ls"}' }),
    ]);
    assert.equal(maxActive, 1);
  });
});
