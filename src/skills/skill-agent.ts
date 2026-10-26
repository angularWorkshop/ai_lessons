// Агент со скиллами в терминале: npm run skill-agent "задача" [@файл]
// Аргумент вида @examples/retry-after.diff заменяется содержимым файла.
import { readFile } from 'node:fs/promises';
import { Agent } from '../agent.ts';
import { loadConfig } from '../llm.ts';
import { printEvent } from '../print-event.ts';
import { llmProvider } from '../provider.ts';
import { skillAgentSystem, skillAgentToolbox } from './agent-setup.ts';
import { discoverSkills } from './loader.ts';

const DEFAULT_TASK = ['Напиши сообщение коммита для этого diff:', '@examples/retry-after.diff'];

async function readTask(args: string[]): Promise<string> {
  const parts = await Promise.all(
    (args.length > 0 ? args : DEFAULT_TASK).map((arg) => (arg.startsWith('@') ? readFile(arg.slice(1), 'utf8') : arg)),
  );
  return parts.join('\n\n').trim();
}

const { skills, errors } = await discoverSkills('skills');
for (const error of errors) {
  console.error(`⚠ скилл пропущен — ${error.message}`);
}
console.log(`скиллы: ${skills.map((skill) => skill.name).join(', ') || 'нет'}`);

const task = await readTask(process.argv.slice(2));
console.log(`задача> ${task}`);

const controller = new AbortController();
process.once('SIGINT', () => {
  console.log('\nCtrl+C — останавливаю агента...');
  controller.abort();
});

const agent = new Agent({
  provider: llmProvider(loadConfig()),
  toolbox: skillAgentToolbox(skills),
  system: skillAgentSystem(skills),
  signal: controller.signal,
  onEvent: printEvent,
});

const run = await agent.run(task);
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
