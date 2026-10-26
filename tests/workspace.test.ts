// Рабочая папка в памяти готова заранее. Эти тесты — чтобы ничего не сломалось, пока ты пишешь план.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRelease, DEMO_PROJECT } from '../src/todo/demo-project.ts';
import { Workspace, workspaceTools } from '../src/todo/workspace.ts';
import { Toolbox } from '../src/tools.ts';

const exec = (toolbox: Toolbox, name: string, args: unknown) =>
  toolbox.execute({ id: 'c', name, arguments: JSON.stringify(args) });

describe('Рабочая папка / Workspace', () => {
  it('list_files, read_file, write_file', async () => {
    const workspace = new Workspace({ 'a.txt': 'привет' });
    const toolbox = new Toolbox();
    workspaceTools(workspace).forEach((tool) => toolbox.register(tool));

    assert.equal((await exec(toolbox, 'list_files', {})).content, 'a.txt (6)');
    assert.equal((await exec(toolbox, 'read_file', { path: 'a.txt' })).content, 'Файл a.txt:\nпривет');
    await exec(toolbox, 'write_file', { path: 'b.txt', content: 'пока' });
    assert.deepEqual(workspace.snapshot(), { 'a.txt': 'привет', 'b.txt': 'пока' });

    const missing = await exec(toolbox, 'read_file', { path: 'c.txt' });
    assert.equal(missing.isError, true);
    assert.match(missing.content, /файла c\.txt нет\. Есть: a\.txt, b\.txt/);
  });

  it('readOnly — без write_file', () => {
    const names = workspaceTools(new Workspace(), { readOnly: true }).map((tool) => tool.name);
    assert.deepEqual(names, ['list_files', 'read_file']);
  });

  it('checkRelease: в исходном проекте ничего не сделано', () => {
    const lines = checkRelease(new Workspace(DEMO_PROJECT));
    assert.ok(lines.length > 0);
    assert.ok(lines.every((line) => line.startsWith('✗')), lines.join('\n'));
  });
});
