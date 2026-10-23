import { labs } from '../../ai_lessons/labs.mjs';
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function renderLesson(lesson, language) {
  const text = lesson[language];
  const lab = labs.find(item => item.id === lesson.id);
  const heading = language === 'RU' ? ['Пример', 'Частая ошибка', 'Практика', 'Что изменить', 'Как проверить', 'Перенос в настоящий ассистент'] :
    ['Example', 'Common mistake', 'Practice', 'What to change', 'How to verify', 'Transfer to a real assistant'];
  return {
    language, title: text.title,
    content: `<div class="container"><h2 class="container__title">${escape(text.title)}</h2>\n` +
      text.theory.map(p => `<p class="container__text">${escape(p)}</p>`).join('\n') +
      (text.walkthrough ?? []).map(block => `<h3 class="container__subtitle">${escape(block.title)}</h3>` +
        block.paragraphs.map(p => `<p class="container__text">${escape(p)}</p>`).join('\n') +
        (block.code ? `<div class="code-block"><pre class="code-block__pre" data-lang="plaintext">${escape(block.code)}</pre></div>` : '')).join('\n') +
      `<h3 class="container__subtitle">${heading[0]}</h3><div class="code-block"><pre class="code-block__pre" data-lang="plaintext">${escape(text.example)}</pre></div>` +
      `<p class="container__highlight">${escape(text.pitfall)}</p></div>`,
    stackBlitzContent: `<div class="container"><h2 class="container__title">${heading[2]}: ${escape(text.title)}</h2>` +
      `<p class="container__text">${language === 'RU' ? 'Измените только' : 'Edit only'} <code>src/${lab.file}</code>.</p>` +
      `<h3 class="container__subtitle">${heading[3]}</h3><ul class="container__list">` +
      text.tasks.map(task => `<li class="container__list-item">${escape(task)}</li>`).join('') + '</ul>' +
      `<h3 class="container__subtitle">${heading[4]}</h3><p class="container__text">` +
      (language === 'RU' ? 'Запустите npm test или npm run start:dev. После сохранения runner повторяет все сценарии. COMPLETED означает успех автоматической проверки задания, не проверку настоящей модели. Не меняйте тесты ради зелёного статуса.' :
        'Run npm test or npm run start:dev. Saving reruns every scenario. COMPLETED means this exercise passes automated checks, not that a real model was verified. Do not edit tests to obtain a green result.') +
      `</p><h3 class="container__subtitle">${heading[5]}</h3><p class="container__text">${escape(text.transfer)}</p></div>`,
  };
}

