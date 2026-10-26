// Длинная задача с планом и без: npm run todo и npm run todo -- --no-plan
import { Agent } from '../agent.ts';
import { printEvent } from '../print-event.ts';
import { Toolbox } from '../tools.ts';
import { checkRelease, DEMO_PROJECT, patientProvider, RELEASE_TASK } from './demo-project.ts';
import { TODO_RULES, TodoList, todoPrinter, todoWriteTool } from './todo.ts';
import { Workspace, workspaceTools } from './workspace.ts';

const withPlan = !process.argv.includes('--no-plan');

const BASE_SYSTEM = `Ты — агент для работы с кодом. Проект лежит в файлах: list_files, read_file, write_file.
Делай всё сам через инструменты, ничего не спрашивай. В конце коротко перечисли, что сделано.`;

const workspace = new Workspace(DEMO_PROJECT);
const todos = new TodoList();
const toolbox = new Toolbox({ maxResultChars: 4000 });
for (const tool of workspaceTools(workspace)) {
  toolbox.register(tool);
}
if (withPlan) {
  toolbox.register(todoWriteTool(todos));
}

console.log(`задача> ${RELEASE_TASK}\n${withPlan ? 'с планом (todo_write)' : 'без плана'}`);

const agent = new Agent({
  provider: patientProvider(),
  toolbox,
  system: withPlan ? `${BASE_SYSTEM}\n\n${TODO_RULES}` : BASE_SYSTEM,
  limits: { maxSteps: 60 },
  onEvent: todoPrinter(printEvent),
});

const run = await agent.run(RELEASE_TASK);
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`\nшагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
if (withPlan && todos.unfinished.length > 0) {
  console.log(`незакрытые пункты плана: ${todos.unfinished.map((todo) => todo.title).join('; ')}`);
}
console.log('\nПроверка результата:');
for (const line of checkRelease(workspace)) {
  console.log(line);
}
