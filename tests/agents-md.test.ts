import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  AGENTS_RULE,
  agentsSections,
  buildAgentSystem,
  findAgentsFiles,
  findProjectRoot,
  loadAgentsLayers,
} from '../src/context/agents-md.ts';
import { buildSystemPrompt } from '../src/prompt.ts';

// Временный проект:
//   repo/.git/                  ← корень
//   repo/AGENTS.md
//   repo/packages/api/package.json
//   repo/packages/api/AGENTS.md
//   repo/packages/api/src/      ← рабочая папка, своего AGENTS.md нет
//   loose/app/package.json      ← проект без git
//   loose/app/lib/
//   outside/AGENTS.md           ← рядом с проектом, не внутри
let base: string;
const p = (...parts: string[]) => path.join(base, ...parts);

const ROOT_RULES = '# Репозиторий\n\n- Тесты — npm test.';
const API_RULES = '# API\n\n- Ответы API — только JSON.';

before(async () => {
  // realpath: на macOS tmpdir — ссылка /var → /private/var, а сравниваем пути строками.
  base = await realpath(await mkdtemp(path.join(tmpdir(), 'agents-md-')));
  await mkdir(p('repo', '.git'), { recursive: true });
  await mkdir(p('repo', 'packages', 'api', 'src'), { recursive: true });
  await writeFile(p('repo', 'AGENTS.md'), `\n${ROOT_RULES}\n\n`);
  await writeFile(p('repo', 'packages', 'api', 'package.json'), '{}');
  await writeFile(p('repo', 'packages', 'api', 'AGENTS.md'), API_RULES);
  await mkdir(p('loose', 'app', 'lib'), { recursive: true });
  await writeFile(p('loose', 'app', 'package.json'), '{}');
  await mkdir(p('outside'), { recursive: true });
  await writeFile(p('outside', 'AGENTS.md'), '- Чужое правило.');
});

after(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('Шаг 1 / Step 1. Корень проекта', () => {
  it('ближайшая папка с .git, даже если по пути есть package.json', async () => {
    assert.equal(await findProjectRoot(p('repo', 'packages', 'api', 'src')), p('repo'));
    assert.equal(await findProjectRoot(p('repo')), p('repo'));
  });

  it('без git — ближайшая папка с package.json', async () => {
    assert.equal(await findProjectRoot(p('loose', 'app', 'lib')), p('loose', 'app'));
  });

  it('ни git, ни package.json — сама рабочая папка', async () => {
    assert.equal(await findProjectRoot(p('outside')), p('outside'));
  });
});

describe('Шаг 2 / Step 2. AGENTS.md от корня до рабочей папки', () => {
  it('сначала корень, потом вложенные папки; папки без AGENTS.md пропускаются', async () => {
    assert.deepEqual(await findAgentsFiles(p('repo', 'packages', 'api', 'src'), p('repo')), [
      p('repo', 'AGENTS.md'),
      p('repo', 'packages', 'api', 'AGENTS.md'),
    ]);
  });

  it('рабочая папка — сам корень: только его файл', async () => {
    assert.deepEqual(await findAgentsFiles(p('repo'), p('repo')), [p('repo', 'AGENTS.md')]);
  });

  it('выше корня не поднимается', async () => {
    assert.deepEqual(await findAgentsFiles(p('repo', 'packages', 'api'), p('repo', 'packages')), [
      p('repo', 'packages', 'api', 'AGENTS.md'),
    ]);
  });

  it('относительные пути тоже работают', async () => {
    const cwd = path.relative(process.cwd(), p('repo', 'packages', 'api', 'src'));
    const root = path.relative(process.cwd(), p('repo'));
    assert.equal((await findAgentsFiles(cwd, root)).length, 2);
  });

  it('рабочая папка вне проекта — ошибка', async () => {
    await assert.rejects(findAgentsFiles(p('outside'), p('repo')), /не внутри проекта/);
  });
});

describe('Шаг 3 / Step 3. Чтение и лимит', () => {
  it('содержимое без пробелов по краям, путь от корня через /', async () => {
    const layers = await loadAgentsLayers([p('repo', 'AGENTS.md'), p('repo', 'packages', 'api', 'AGENTS.md')], p('repo'));
    assert.deepEqual(layers, [
      { file: 'AGENTS.md', content: ROOT_RULES, chars: ROOT_RULES.length },
      { file: 'packages/api/AGENTS.md', content: API_RULES, chars: API_RULES.length },
    ]);
  });

  it('лимит общий: второй файл обрезается с пометкой, третьему места не остаётся', async () => {
    const files = [p('repo', 'AGENTS.md'), p('repo', 'packages', 'api', 'AGENTS.md'), p('outside', 'AGENTS.md')];
    const limit = ROOT_RULES.length + 10;
    const layers = await loadAgentsLayers(files, base, limit);

    assert.equal(layers[0].content, ROOT_RULES);
    assert.equal(
      layers[1].content,
      `${API_RULES.slice(0, 10)}\n…[обрезано: показано 10 из ${API_RULES.length} символов]`,
    );
    assert.equal(layers[1].chars, API_RULES.length);
    assert.deepEqual(layers[2], { file: 'outside/AGENTS.md', content: '', chars: '- Чужое правило.'.length });
  });
});

describe('Шаг 4 / Step 4. Сборка system prompt', () => {
  const BASE = { role: 'Ты — агент для работы с кодом.', rules: ['Отвечай коротко.'] };

  it('слои — разделы с путём в заголовке, после базового промпта, сначала корень', async () => {
    const result = await buildAgentSystem(BASE, { cwd: p('repo', 'packages', 'api', 'src') });

    assert.equal(result.root, p('repo'));
    assert.equal(
      result.system,
      buildSystemPrompt({
        role: BASE.role,
        rules: ['Отвечай коротко.', AGENTS_RULE],
        sections: [
          { title: 'AGENTS.md', body: ROOT_RULES },
          { title: 'packages/api/AGENTS.md', body: API_RULES },
        ],
      }),
    );
    assert.ok(result.system.indexOf('# Репозиторий') < result.system.indexOf('# API'));
  });

  it('agentsSections: заголовок — путь, текст — содержимое', () => {
    assert.deepEqual(agentsSections([{ file: 'a/AGENTS.md', content: 'x', chars: 1 }]), [{ title: 'a/AGENTS.md', body: 'x' }]);
  });

  it('свои разделы базового промпта идут раньше AGENTS.md', async () => {
    const result = await buildAgentSystem(
      { ...BASE, sections: [{ title: 'Окружение', body: 'Node 20' }] },
      { cwd: p('repo'), root: p('repo') },
    );
    assert.ok(result.system.indexOf('## Окружение') < result.system.indexOf('## AGENTS.md'));
  });

  it('нет ни одного AGENTS.md — промпт тот же, что без слоёв, и без лишнего правила', async () => {
    const result = await buildAgentSystem(BASE, { cwd: p('loose', 'app', 'lib') });
    assert.equal(result.root, p('loose', 'app'));
    assert.deepEqual(result.layers, []);
    assert.equal(result.system, buildSystemPrompt(BASE));
  });

  it('файл, которому не хватило лимита, в промпт не попадает', async () => {
    const result = await buildAgentSystem(BASE, { cwd: p('repo', 'packages', 'api'), maxChars: ROOT_RULES.length });
    assert.equal(result.layers.length, 2);
    assert.ok(!result.system.includes('packages/api/AGENTS.md'));
  });
});
