// Ревью всех модулей параллельными субагентами: npm run parallel
// npm run parallel -- --shared          дети сами дописывают REVIEW.md — и теряют чужие разделы
// npm run parallel -- --shared --check  то же с проверкой устаревшей записи
// npm run parallel -- --budget 15000    маленький общий бюджет: дерево останавливается целиком
import { Agent, type AgentEvent } from '../agent.ts';
import { printEvent } from '../print-event.ts';
import { DEMO_PROJECT, MODULE_FUNCTIONS, patientProvider } from '../todo/demo-project.ts';
import { Workspace, workspaceTools } from '../todo/workspace.ts';
import { Toolbox } from '../tools.ts';
import { TokenBudget, withBudget } from './budget.ts';
import { childPrinter } from './print-child.ts';
import { taskTool } from './task-tool.ts';

const args = process.argv.slice(2);
const shared = args.includes('--shared');
const checkStale = args.includes('--check');
const budgetFlag = args.indexOf('--budget');
const budget = new TokenBudget(budgetFlag >= 0 ? Number(args[budgetFlag + 1]) : 100_000);

const TASK = `Найди ошибки в краевых случаях во всех модулях src/: пустой ввод, неверные аргументы, странные форматы. \
Собери отчёт в REVIEW.md: раздел «## src/<модуль>.ts» на каждый модуль, в нём по пункту на проблему.${
  shared ? ' Каждый субагент сам дописывает свой раздел в конец REVIEW.md.' : ''
}`;

const PARENT_SYSTEM = `Ты — ведущий агент для работы с кодом. Файлы проекта: ${shared ? 'list_files' : 'list_files, write_file'}.
Читать код сам не можешь: работу, где нужно читать файлы, отдавай субагентам через task.
Независимые подзадачи запускай параллельно — несколько вызовов task в одном ответе.
Субагент не видит твою задачу: пиши ему в prompt всё, что нужно, и в каком виде вернуть ответ.
${shared ? 'Писать файлы ты не можешь. Скажи каждому субагенту в prompt самому дописать свой раздел в REVIEW.md.' : 'Субагенты только читают. Отчёт из их ответов пишешь ты.'}`;

const CHILD_SYSTEM = `Ты — субагент. Тебе дали одну узкую задачу. Ответь коротко, только выводом.
${shared ? `Находки обязательно запиши сам в REVIEW.md — родитель писать файлы не может.
Прочитай REVIEW.md, если он есть, и запиши его целиком: старое содержимое плюс твой раздел в конце. Родителю ответь одной строкой.` : 'Файлы только читаешь.'}`;

const provider = withBudget(patientProvider(), budget);
const workspace = new Workspace(DEMO_PROJECT);

// Каждому ребёнку — свой набор инструментов: у каждого своя память о том, что он прочитал.
const childTools = () => {
  const toolbox = new Toolbox({ maxResultChars: 4000 });
  for (const tool of workspaceTools(workspace, { readOnly: !shared, checkStale })) {
    toolbox.register(tool);
  }
  return toolbox;
};

// Сколько каждый ребёнок работал: сумма против общего времени показывает, что они шли одновременно.
const print = childPrinter();
const startedAt = new Map<string, number>();
let childSeconds = 0;
let firstStart = 0;
let lastStop = 0;
const onChildEvent = (event: AgentEvent, description: string) => {
  const now = Date.now();
  if (!startedAt.has(description)) {
    startedAt.set(description, now);
    firstStart ||= now;
  }
  if (event.type === 'stop') {
    childSeconds += (now - startedAt.get(description)!) / 1000;
    lastStop = now;
  }
  print(event, description);
};

const parentTools = new Toolbox().register(
  taskTool({ provider, toolbox: childTools, system: CHILD_SYSTEM, timeoutMs: 120_000, onEvent: onChildEvent }),
);
// В режиме --shared пишут только дети: у родителя нет write_file.
const parentNames = shared ? ['list_files'] : ['list_files', 'write_file'];
for (const tool of workspaceTools(workspace).filter((tool) => parentNames.includes(tool.name))) {
  parentTools.register(tool);
}

// Ctrl+C останавливает всё дерево: сигнал родителя приходит детям через ToolContext.
const controller = new AbortController();
process.once('SIGINT', () => {
  console.log('\nCtrl+C — останавливаю всё дерево...');
  controller.abort();
});

console.log(`задача> ${TASK}\nобщий бюджет: ${budget.limit} токенов${shared ? `, дети пишут сами${checkStale ? ', с проверкой' : ''}` : ''}`);
const started = Date.now();
const run = await new Agent({ provider, toolbox: parentTools, system: PARENT_SYSTEM, signal: controller.signal, onEvent: printEvent }).run(TASK);
if (run.stopReason === 'error') {
  console.error(run.answer);
}

const review = workspace.read('REVIEW.md') ?? '';
const covered = Object.keys(MODULE_FUNCTIONS).filter((module) => review.includes(`src/${module}.ts`));
console.log(`\n${run.stopReason} за ${((Date.now() - started) / 1000).toFixed(1)} с`);
console.log(`дети: суммарно ${childSeconds.toFixed(1)} с работы, от первого старта до последнего финиша ${((lastStop - firstStart) / 1000).toFixed(1)} с`);
console.log(`бюджет: ${budget.used} из ${budget.limit}`);
console.log(`модулей в REVIEW.md: ${covered.length} из ${Object.keys(MODULE_FUNCTIONS).length}`);
