import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { course, lessons } from './course.mjs';
import { labs } from '../../ai_lessons/labs.mjs';
import { renderLesson } from './lesson-html.mjs';
export { renderLesson } from './lesson-html.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'ai_lessons/generated');
const json = value => JSON.stringify(value, null, 2) + '\n';
const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };


export function build() {
  const manifest = {
    ...course,
    publication: { ready: false, blockers: ['No remote lesson repository assigned', 'AI_ASSISTANTS is not registered in production API', 'Course entitlement and release review pending'], repository: null },
    sections: course.sections.map((section, i) => ({ ...section, order: i + 1, topics: lessons.filter(l => l.section === section.id).map(lesson => ({
      key: lesson.id, order: lessons.indexOf(lesson) + 1, title: { RU: lesson.RU.title, EN: lesson.EN.title },
      requires: lessons.indexOf(lesson) ? [lessons[lessons.indexOf(lesson) - 1].id] : [],
      exercises: [{ key: lesson.id, isPublic: false, translations: ['RU', 'EN'].map(lang => renderLesson(lesson, lang)), exerciseRepositoryUrl: null, solutionUrl: null }],
    })) })),
  };
  write(path.join(root, 'course_authoring/ai/course-manifest.json'), json(manifest));
  for (const lab of labs) {
    const lesson = lessons.find(item => item.id === lab.id);
    for (const mode of ['starter', 'answer']) {
      const dir = path.join(out, lab.id, mode);
      write(path.join(dir, 'package.json'), json({ name: `edutec-ai-${lab.id}`, private: true, type: 'module',
        scripts: { test: 'node --test tests/assignment.test.mjs', 'start:dev': 'node scripts/stackblitz-status.mjs' },
        engines: { node: '>=20' }, stackblitz: { startCommand: 'npm run start:dev' } }));
      write(path.join(dir, '.stackblitzrc'), json({ startCommand: 'npm run start:dev' }));
      write(path.join(dir, `src/${lab.file}`), json(lab[mode]));
      write(path.join(dir, 'tests/cases.json'), json(lab.cases));
      write(path.join(dir, 'tests/assignment.test.mjs'), `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport fs from 'node:fs';\nimport { runLab } from '../runtime.mjs';\nconst config = JSON.parse(fs.readFileSync(new URL('../src/${lab.file}', import.meta.url)));\nconst cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url)));\nfor (const [name, input, expected] of cases) test(name, () => {\n  assert.deepEqual(runLab('${lab.id}', config, input), expected);\n});\n`);
      write(path.join(dir, 'runtime.mjs'), fs.readFileSync(path.join(root, 'ai_lessons/runtime.mjs')));
      write(path.join(dir, 'extension-runtime.mjs'), fs.readFileSync(path.join(root, 'ai_lessons/extension-runtime.mjs')));
      write(path.join(dir, 'scripts/stackblitz-status.mjs'), fs.readFileSync(path.join(root, 'ai_lessons/scripts/stackblitz-status.mjs')));
      for (const resource of ['SETUP.md', 'LOCAL_MODELS.md', 'TRAINING.md', 'FINETUNING.md', 'ADVANCED_ACCEPTANCE.md',
        'local-smoke.mjs', 'extension-runtime.mjs', 'agent-os-example', 'capstone-project', 'capstone-pack', 'local-training']) {
        fs.cpSync(path.join(root, 'ai_lessons', resource), path.join(dir, 'ai_lessons', resource), {
          recursive: true,
          filter: source => !['__pycache__', 'model.json'].includes(path.basename(source)),
        });
      }
      write(path.join(dir, 'README.md'), ['# ' + lesson.EN.title, '', 'Edit `src/' + lab.file + '`. Do not change the tests or runtime.',
        '', '## English', ...lesson.EN.tasks.map(task => '- ' + task), '', '## Русский', ...lesson.RU.tasks.map(task => '- ' + task),
        '', '## Check', '`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).',
        '', 'The runner reports automated configuration status. Real-assistant transfer is a separate manual check.',
        '', 'Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.',
        '', '## Transfer / Перенос', lesson.EN.transfer, '', lesson.RU.transfer, ''].join('\n'));
    }
  }
  console.log(`Built ${lessons.length} bilingual lessons and ${labs.length * 2} standalone practice projects.`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
