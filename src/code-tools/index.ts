// Инструменты агента для кода. root — корень проекта: дальше него инструменты не видят.
import type { Tool } from '../tools.ts';
import { editFileTool } from './edit-file.ts';
import { grepTool } from './grep.ts';
import { listFilesTool } from './list-files.ts';
import { Mutex } from './mutex.ts';
import { readFileTool } from './read-file.ts';
import { runCommandTool, type RunCommandOptions } from './run-command.ts';

export function codeTools(root: string, options: RunCommandOptions = {}): Tool[] {
  // Один замок на правки и команды: тесты не запустятся посреди правки, правка — посреди тестов. Чтение идёт параллельно.
  const lock = options.lock ?? new Mutex();
  return [listFilesTool(root), readFileTool(root), grepTool(root), editFileTool(root, lock), runCommandTool(root, { ...options, lock })];
}
