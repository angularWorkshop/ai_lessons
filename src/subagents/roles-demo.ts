// Планировщик, исполнитель, ревьюер: npm run roles. Та же задача одним агентом: npm run roles -- --solo
import { Agent } from '../agent.ts';
import { printEvent } from '../print-event.ts';
import { DEMO_PROJECT, patientProvider } from '../todo/demo-project.ts';
import { Workspace, workspaceTools } from '../todo/workspace.ts';
import { Toolbox } from '../tools.ts';
import { childPrinter } from './print-child.ts';
import { ROLES, runPipeline } from './roles.ts';

const solo = process.argv.includes('--solo');

const TASK = `В src/colors.ts функция hexToRgb не понимает короткую запись вроде #fff и молча возвращает мусор на неверной строке. \
Почини: поддержи #rgb и #rrggbb, на любой другой строке бросай Error. Добавь тесты в tests/colors.test.ts \
и запиши исправление в CHANGELOG.md.`;

const provider = patientProvider();
const workspace = new Workspace(DEMO_PROJECT);
console.log(`задача> ${TASK}\n${solo ? 'один агент' : 'три роли'}`);

if (solo) {
  const toolbox = new Toolbox({ maxResultChars: 4000 });
  workspaceTools(workspace).forEach((tool) => toolbox.register(tool));
  const run = await new Agent({ provider, toolbox, system: ROLES.executor.system, onEvent: printEvent }).run(TASK);
  console.log(`\n${run.stopReason}, шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
} else {
  const result = await runPipeline(TASK, {
    provider,
    workspace,
    maxRounds: 3,
    limits: { maxSteps: 15 },
    onEvent: childPrinter(),
    onVerdict: (verdict, round) => {
      console.log(`\n■ раунд ${round}: ${verdict.verdict}`);
      verdict.issues.forEach((issue) => console.log(`  - ${issue}`));
    },
  });
  console.log(`\nплан:\n${result.plan}`);
  console.log(`\n${result.status}, раундов: ${result.rounds}, токенов: ${result.usage.input} → ${result.usage.output}`);
  if (result.error) {
    console.error(result.error);
  }
}

console.log(`\nsrc/colors.ts:\n${workspace.read('src/colors.ts')}`);
