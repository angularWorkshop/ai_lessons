// PostToolUse для edit_file: после каждой правки в src/ — npm test. Итог уходит модели вместе с результатом правки,
// и она узнаёт о сломанном тесте сразу, а не когда вспомнит запустить тесты.
import { spawn } from 'node:child_process';

function npmTest(root) {
  return new Promise((resolve) => {
    // Окружение — только PATH и HOME: ключу к модели в тестах делать нечего.
    const child = spawn('npm', ['test'], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolve({ code: 1, output: error.message }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

export default async function checkEdit({ args, root, result }) {
  if (result.isError || !String(args.path).startsWith('src/')) return;
  const { code, output } = await npmTest(root);
  if (code === 0) return { feedback: 'npm test после правки: все тесты зелёные.' };
  const failing = output.split('\n').filter((line) => /✖|AssertionError|expected|actual/.test(line)).slice(0, 8);
  return { feedback: `npm test после правки упал (код ${code}):\n${failing.join('\n')}` };
}
