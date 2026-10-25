// Инструменты агента для кода. root — корень проекта: дальше него инструменты не видят.
import type { Tool } from '../tools.ts';
import { grepTool } from './grep.ts';
import { listFilesTool } from './list-files.ts';
import { readFileTool } from './read-file.ts';

export function codeTools(root: string): Tool[] {
  return [listFilesTool(root), readFileTool(root), grepTool(root)];
}
