import { course, lessons } from './course.mjs';
import { labs } from '../../ai_lessons/labs.mjs';
import { runLab } from '../../ai_lessons/runtime.mjs';
import { renderLesson } from './render-browser.mjs';

let language = 'RU';
let index = 0;
const drafts = new Map();
const passed = new Set();
const byId = id => document.getElementById(id);
const t = (ru, en) => language === 'RU' ? ru : en;
const key = () => lessons[index].id;
const remember = () => { drafts.set(key(), byId('config').value); };

function render() {
  const lesson = lessons[index];
  const lab = labs[index];
  document.documentElement.lang = language.toLowerCase();
  document.title = course.title[language] + ' · Edutec local lab';
  byId('course-title').textContent = course.title[language];
  byId('audience').textContent = course.audience[language];
  byId('prerequisites').textContent = course.prerequisites[language];
  byId('draft-note').textContent = t('Локальная лаборатория · прогресс не отправляется на платформу', 'Local lab · progress is not sent to the platform');
  byId('overview').textContent = t(`${lessons.length} уроков / ${course.sections.length} разделов / без платного API`, `${lessons.length} lessons / ${course.sections.length} sections / no paid API required`);
  updateProgress();
  byId('curriculum').replaceChildren();
  for (const section of course.sections) {
    const heading = document.createElement('h3');
    heading.textContent = section.title[language];
    byId('curriculum').append(heading);
    lessons.forEach((item, i) => {
      if (item.section !== section.id) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${String(i + 1).padStart(2, '0')}  ${item[language].title}`;
      button.setAttribute('aria-current', String(i === index ? 'step' : 'false'));
      button.addEventListener('click', () => { remember(); index = i; render(); byId('theory').focus(); });
      byId('curriculum').append(button);
    });
  }
  const html = renderLesson(lesson, language, lab);
  byId('theory').innerHTML = html.content;
  byId('practice').innerHTML = html.stackBlitzContent;
  byId('file-label').textContent = `src/${lab.file}`;
  byId('config').setAttribute('aria-label', t('Конфигурация упражнения', 'Exercise configuration'));
  byId('config').value = drafts.get(key()) ?? JSON.stringify(lab.starter, null, 2);
  byId('run').textContent = t('Проверить условия', 'Check conditions');
  byId('reset').textContent = t('Вернуть стартовый файл', 'Reset starter');
  byId('solution-title').textContent = t('Посмотреть правильную конфигурацию', 'Inspect the answer configuration');
  byId('answer').textContent = JSON.stringify(lab.answer, null, 2);
  byId('solution').open = false;
  byId('status').textContent = t('Задание ещё не проверено. Измените JSON и запустите проверку.', 'Not checked yet. Edit the JSON, then run the checks.');
  byId('results').replaceChildren();
  byId('next').textContent = t('Следующий урок', 'Next lesson');
  byId('next').disabled = index === lessons.length - 1;
  byId('boundary').textContent = t('Эта среда проверяет конфигурацию на учебных сценариях. Она не подключается к модели, не запускает команды и не выставляет прогресс на Edutec. Перенос в настоящий ассистент проверяется отдельно.', 'This environment checks configuration against educational scenarios. It calls no model, executes no commands, and changes no Edutec progress. Real-assistant transfer requires a separate check.');
}

function updateProgress() {
  byId('progress').textContent = t(`Проверено конфигураций: ${passed.size}/${lessons.length}`, `Configurations checked: ${passed.size}/${lessons.length}`);
}

byId('run').addEventListener('click', () => {
  remember();
  byId('results').replaceChildren();
  const lab = labs[index];
  let config;
  try { config = JSON.parse(byId('config').value); }
  catch { byId('status').textContent = t('Некорректный JSON: проверьте кавычки, запятые и скобки.', 'Invalid JSON: check quotes, commas, and brackets.'); return; }
  let count = 0;
  for (const [name, input, expected] of lab.cases) {
    let actual;
    let ok = false;
    try { actual = runLab(lab.id, config, structuredClone(input)); ok = JSON.stringify(actual) === JSON.stringify(expected); }
    catch (error) { actual = { error: error.message }; }
    count += Number(ok);
    const item = document.createElement('li');
    item.className = ok ? 'pass' : 'fail';
    item.textContent = `${ok ? 'PASS' : 'FAIL'} · ${name}`;
    if (!ok) {
      const code = document.createElement('pre');
      code.textContent = t('Ожидается: ', 'Expected: ') + JSON.stringify(expected) + '\n' + t('Получено: ', 'Received: ') + JSON.stringify(actual);
      item.append(code);
    }
    byId('results').append(item);
  }
  if (count === lab.cases.length) passed.add(key());
  else passed.delete(key());
  byId('status').textContent = count === lab.cases.length ? `SUCCESS · ${count}/${lab.cases.length}` : `NOT COMPLETED · ${count}/${lab.cases.length}`;
  updateProgress();
});
byId('config').addEventListener('input', () => {
  passed.delete(key());
  byId('status').textContent = t('Файл изменён. Запустите проверку снова.', 'File changed. Run the checks again.');
  updateProgress();
});
byId('reset').addEventListener('click', () => { drafts.delete(key()); passed.delete(key()); render(); });
byId('language').addEventListener('click', () => { remember(); language = language === 'RU' ? 'EN' : 'RU'; render(); });
byId('next').addEventListener('click', () => { remember(); if (index < lessons.length - 1) index++; render(); byId('theory').focus(); });
render();
