import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { lessons, course } from '../../course_authoring/ai/course.mjs';
import { deepenedIds } from '../../course_authoring/ai/deepening.mjs';
import { renderLesson } from '../../course_authoring/ai/lesson-html.mjs';
import { knowledgeQuestions } from '../../course_authoring/ai/knowledge-check.mjs';

const before = (earlier, later) => assert.ok(lessons.findIndex(l => l.id === earlier) < lessons.findIndex(l => l.id === later), `${earlier} must precede ${later}`);
test('new foundations precede dependent practice without changing the first public lesson', () => {
  assert.equal(lessons.length, 50); assert.equal(course.sections.length, 14);
  assert.equal(lessons[0].id, '01-task-boundaries');
  for (const [a, b] of [['28-client-preflight', '45-model-mechanics'], ['45-model-mechanics', '27-context-window'], ['30-structured-results', '46-tool-call-loop'],
    ['09-tool-contract', '46-tool-call-loop'], ['46-tool-call-loop', '32-mcp-discovery'], ['17-agent-os', '48-reviewed-memory'],
    ['38-retrieval-ranking', '47-vector-search'], ['47-vector-search', '39-grounded-answer'], ['22-dataset-splits', '49-sft-labels'],
    ['23-cpu-training', '49-sft-labels'], ['49-sft-labels', '24-lora'], ['25-model-release', '50-serving-rollout'], ['50-serving-rollout', '26-local-capstone']]) before(a, b);
});
test('deepened topics include explanations, worked cases and matching published practice in both languages', () => {
  for (const id of deepenedIds) {
    const lesson = lessons.find(l => l.id === id);
    for (const language of ['RU', 'EN']) {
      assert.ok(lesson[language].walkthrough.length >= 2, `${id}: separate explanations`);
      const html = renderLesson(lesson, language);
      assert.ok((html.content.match(/container__subtitle/g) || []).length >= 3);
      assert.ok(html.stackBlitzContent.includes('src/'));
      if (lesson[language].handsOn) {
        assert.ok(html.stackBlitzContent.includes('node ') || html.stackBlitzContent.includes('npm ci'));
        assert.ok(html.stackBlitzContent.includes(lesson[language].handsOn.title));
      }
      if (language === 'EN') assert.doesNotMatch(html.content + html.stackBlitzContent, /[А-Яа-яЁё]/);
    }
  }
});
test('all real worked systems referenced by the lessons are shipped as source', () => {
  for (const file of ['workbench/agent.mjs', 'workbench/rag.mjs', 'workbench/local-client.mjs', 'workbench/training-math.mjs', 'workbench/demo.mjs',
    'workbench/workbench.test.mjs', 'mcp-demo/server.mjs', 'mcp-demo/client.test.mjs', 'mcp-demo/package-lock.json']) {
    assert.ok(fs.statSync(new URL('../' + file, import.meta.url)).size > 0, file);
  }
});
test('concept bank covers new topics with one correct option and unique stable keys', () => {
  assert.equal(knowledgeQuestions.length, 14);
  assert.equal(new Set(knowledgeQuestions.map(q => q.key)).size, 14);
  assert.deepEqual(knowledgeQuestions.map(q => q.order), Array.from({ length: 14 }, (_, i) => i + 1));
  for (const q of knowledgeQuestions) assert.equal(q.options.filter(o => o.isCorrect).length, 1);
});
