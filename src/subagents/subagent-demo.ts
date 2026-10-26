// Ревью трёх модулей: npm run subagent — через субагентов, npm run subagent -- --solo — один агент читает всё сам.
import { Agent } from '../agent.ts';
import type { Usage } from '../llm.ts';
import { printEvent } from '../print-event.ts';
import { DEMO_PROJECT, patientProvider } from '../todo/demo-project.ts';
import { Workspace, workspaceTools } from '../todo/workspace.ts';
import { Toolbox } from '../tools.ts';
import { childPrinter } from './print-child.ts';
import { taskTool } from './task-tool.ts';

const solo = process.argv.includes('--solo');

const TASK = `Найди ошибки в краевых случаях в src/math.ts, src/async.ts и src/colors.ts: пустой ввод, неверные аргументы, \
странные форматы. Запиши отчёт в REVIEW.md — по пункту на проблему: модуль, функция, что не так.`;

const PARENT_SYSTEM = `Ты — ведущий агент для работы с кодом. Файлы проекта: list_files, write_file.
Читать код сам не можешь: каждую часть работы, где нужно читать файлы, отдавай субагенту через task.
Субагент не видит твою задачу — пиши ему в prompt всё, что нужно, и в каком виде вернуть ответ.`;

const SOLO_SYSTEM = `Ты — агент для работы с кодом. Файлы проекта: list_files, read_file, write_file.`;

const CHILD_SYSTEM = `Ты — субагент. Тебе дали одну узкую задачу. Файлы проекта: list_files, read_file.
Сделай задачу и ответь коротко, только выводом: без пересказа кода и без вступлений.`;

const provider = patientProvider();
const workspace = new Workspace(DEMO_PROJECT);
const children: Usage = { input: 0, output: 0 };

const register = (toolbox: Toolbox, names: string[]) => {
  for (const tool of workspaceTools(workspace).filter((tool) => names.includes(tool.name))) {
    toolbox.register(tool);
  }
  return toolbox;
};

const toolbox = solo
  ? register(new Toolbox(), ['list_files', 'read_file', 'write_file'])
  : register(new Toolbox(), ['list_files', 'write_file']).register(
      taskTool({
        provider,
        toolbox: register(new Toolbox(), ['list_files', 'read_file']),
        system: CHILD_SYSTEM,
        onEvent: childPrinter(),
        onRun: (run) => {
          children.input += run.usage.input;
          children.output += run.usage.output;
        },
      }),
    );

console.log(`задача> ${TASK}\n${solo ? 'один агент' : 'с субагентами'}`);

const agent = new Agent({ provider, toolbox, system: solo ? SOLO_SYSTEM : PARENT_SYSTEM, onEvent: printEvent });
const run = await agent.run(TASK);
if (run.stopReason === 'error') {
  console.error(run.answer);
}

const last = run.messages.length;
console.log(`\nродитель: шагов ${run.steps}, токенов ${run.usage.input} → ${run.usage.output}, сообщений в истории ${last}`);
if (!solo) {
  console.log(`субагенты: токенов ${children.input} → ${children.output}`);
}
console.log(`\nREVIEW.md:\n${workspace.read('REVIEW.md') ?? '(нет файла)'}`);
