import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, root } from './build.mjs';
import { lessons } from './course.mjs';
import { labs } from '../../ai_lessons/labs.mjs';

const manifest = build();
for (const file of ['LOCAL_MODELS.md', 'TRAINING.md', 'FINETUNING.md', 'ADVANCED_ACCEPTANCE.md',
  'local-smoke.mjs', 'agent-os-example/doctor.mjs', 'agent-os-example/README.md',
  'local-training/train.py', 'local-training/serve.py', 'local-training/dataset.json', 'local-training/test_training.py']) {
  assert.ok(fs.statSync(path.join(root, 'ai_lessons', file)).size > 0, `Missing real-transfer material: ${file}`);
}
assert.equal(new Set(lessons.map(l => l.id)).size, lessons.length);
assert.deepEqual(lessons.map(l => l.id), labs.map(l => l.id));
assert.deepEqual(manifest.sections.flatMap(s => s.topics.map(t => t.key)), lessons.map(l => l.id), 'Sections must not scramble the learning sequence');
assert.equal(labs.filter(l => l.executable).length, 18);
for (const lesson of lessons) for (const lang of ['RU', 'EN']) {
  assert.ok([...lesson[lang].theory, ...(lesson[lang].walkthrough ?? []).flatMap(b => b.paragraphs)].join(' ').length >= 800, `${lesson.id} ${lang}: insufficient explanation`);
  assert.ok(lesson[lang].example.length > 50);
  assert.ok(lesson[lang].transfer.length > 80);
}
const report = { course: manifest.type, lessons: lessons.length, sections: manifest.sections.length, scenarios: 0, pairs: [], publicationReady: manifest.publication.ready };
for (const section of manifest.sections) {
  assert.ok(section.topics.length > 0);
  for (const topic of section.topics) {
    const lesson = lessons.find(l => l.id === topic.key);
    assert.equal(topic.exercises[0].isPublic, lessons.indexOf(lesson) === 0);
    if (manifest.publication.repository) {
      const { exerciseRepositoryUrl, solutionUrl } = topic.exercises[0];
      assert.match(exerciseRepositoryUrl, /^https:\/\/github\.com\/angularWorkshop\/ai_lessons\/tree\/lesson-topic-/);
      assert.match(solutionUrl, /^https:\/\/github\.com\/angularWorkshop\/ai_lessons\/tree\/answer-topic-/);
      assert.notEqual(exerciseRepositoryUrl, solutionUrl);
    }
    assert.ok(topic.requires.every(id => lessons.findIndex(l => l.id === id) < lessons.indexOf(lesson)));
    for (const translation of topic.exercises[0].translations) {
      assert.ok(translation.content.startsWith('<div class="container">'));
      assert.ok(translation.content.includes('container__text'));
      assert.ok(translation.stackBlitzContent.includes('src/'));
      assert.ok(!/<script|data-lang="text"|TODO|NgrxExerciseResult/i.test(translation.content));
      if (translation.language === 'EN') assert.ok(!/[А-Яа-яЁё]/.test(translation.content + translation.stackBlitzContent));
      assert.ok(lesson[translation.language].theory.length >= 3);
      assert.ok(lesson[translation.language].tasks.length >= 3);
    }
  }
}
for (const lab of labs) {
  const dir = path.join(root, 'ai_lessons/generated', lab.id);
  for (const file of ['tests/assignment.test.mjs', 'tests/cases.json', 'runtime.mjs', 'extension-runtime.mjs', 'scripts/stackblitz-status.mjs']) {
    assert.deepEqual(fs.readFileSync(path.join(dir, 'starter', file)), fs.readFileSync(path.join(dir, 'answer', file)), `${lab.id}: identical ${file}`);
  }
  const starter = spawnSync(process.execPath, ['--test', 'tests/assignment.test.mjs'], { cwd: path.join(dir, 'starter'), encoding: 'utf8', timeout: 15000 });
  const answer = spawnSync(process.execPath, ['--test', 'tests/assignment.test.mjs'], { cwd: path.join(dir, 'answer'), encoding: 'utf8', timeout: 15000 });
  assert.ok(!starter.error && !answer.error, `${lab.id}: runner launch`);
  assert.equal(starter.status, 1, `${lab.id}: starter must fail on assertions`);
  assert.match(starter.stdout, /AssertionError/);
  assert.equal(answer.status, 0, `${lab.id}: answer must pass\n${answer.stdout}\n${answer.stderr}`);
  const starterConfig = path.join(dir, 'starter/src', lab.file);
  const original = fs.readFileSync(starterConfig);
  try {
    fs.copyFileSync(path.join(dir, 'answer/src', lab.file), starterConfig);
    const copied = spawnSync(process.execPath, ['--test', 'tests/assignment.test.mjs'], { cwd: path.join(dir, 'starter'), encoding: 'utf8', timeout: 15000 });
    assert.equal(copied.status, 0, `${lab.id}: copying the answer into the starter must pass`);
  } finally { fs.writeFileSync(starterConfig, original); }
  report.scenarios += lab.cases.length;
  report.pairs.push({ id: lab.id, starterFails: true, answerPasses: true, copiedAnswerPasses: true, identicalTests: true, scenarios: lab.cases.length });
}
fs.writeFileSync(path.join(root, 'course_authoring/ai/verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
