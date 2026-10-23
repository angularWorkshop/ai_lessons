# AI assistants: from setup to orchestration

Курс Edutec: 13 разделов, 26 уроков на RU/EN и 26 пар starter/answer. Браузер проверяет конфигурации; отдельный CPU-проект действительно обучает модель и обслуживает локальный inference.

Платформа: [курс ИИ-ассистентов](https://courses.edutec.it.com/ai/home). Учебные ветки: [angularWorkshop/ai_lessons](https://github.com/angularWorkshop/ai_lessons). Статус конкретного релиза и границы проверки описаны в [RELEASE.md](../course_authoring/ai/RELEASE.md).

## Preview / Просмотр

Из `D:/Workspace/workshop`:

```powershell
node course_authoring/ai/preview-server.mjs
```

Откройте `http://127.0.0.1:4313`. В просмотре есть теория, условия, редактирование JSON, проверка сценариев, разбор и переключение RU/EN. Конфигурация остаётся в памяти вкладки. Ничего не отправляется внешнему API; прогресс на Edutec не меняется.

## Onboarding / Если терминал и Git незнакомы

1. Установите Node.js 20+ из официального источника; убедитесь, что `node --version` работает.
2. Откройте терминал в каталоге выбранного проекта. Команда `pwd` показывает текущий путь.
3. JSON состоит из объектов `{}`, массивов `[]`, строк в двойных кавычках, чисел и `true`/`false`. Комментарии и завершающие запятые не допускаются.
4. В каталоге starter откройте файл `src/*.json`. Изменяйте только его; затем выполните `npm test`.
5. Ошибка assertion означает несовпадение поведения с условием. Ошибка JSON означает неправильный синтаксис. Исправляйте причину, не тест.
6. Для автоматической перепроверки после сохранения запустите `npm run start:dev`; остановка: Ctrl+C. Установка зависимостей не нужна.
7. Перед работой с настоящим ассистентом используйте отдельную копию проекта. `git status --short` показывает изменения, `git diff` показывает разницу. Не применяйте команды сброса или удаления для получения чистого статуса.

Подробный первый запуск в клиенте: `SETUP.md`. Для итогового переноса есть настоящий небольшой проект `capstone-project`, а не только JSON-симуляция.

English: install Node 20+, open a terminal in a generated starter folder, edit its `src/*.json`, and run `npm test`. JSON uses double-quoted keys and strings, arrays, numbers, and booleans; no comments or trailing commas. Use `npm run start:dev` for checks after saving. Never edit tests to make an assignment pass. Use a disposable project and inspect `git diff` before real assistant work.

## Commands

```powershell
npm test --prefix ai_lessons
node course_authoring/ai/verify.mjs
cd ai_lessons/generated/01-task-boundaries/starter
npm run start:dev
```

`verify.mjs` пересобирает артефакты из исходников курса, проверяет локализацию и порядок, запускает тесты всех starter и answer. Не храните пользовательские решения внутри `generated`: пересборка восстанавливает учебные файлы. Для собственных решений сделайте отдельную копию.

## Structure

- `agent-os-example/README.md`: изолированный пример архитектуры `.agents`, без изменения настоящей ОС пользователя.
- `LOCAL_MODELS.md`: память, лицензии, Ollama, настоящий loopback smoke и выпуск модели.
- `TRAINING.md`: обучение CPU-классификатора без сторонних зависимостей, экспорт и локальный HTTP.
- `FINETUNING.md`: дополнительный LoRA/QLoRA-маршрут; GPU-пример здесь не запускался.
- `ADVANCED_ACCEPTANCE.md`: раздельная приёмка симулятора, CPU- и LLM-проектов.

- `../course_authoring/ai/course.mjs`: оригинальная теория, примеры, практика и перенос RU/EN.
- `../course_authoring/ai/course-manifest.json`: структурированный курс; `content` и `stackBlitzContent` заполнены отдельно.
- `labs.mjs`: конфигурации и поведенческие сценарии (точное число в verification.json).
- `runtime.mjs`: детерминированный учебный симулятор, без выполнения команд и сетевых запросов.
- `generated/<lesson>/{starter,answer}`: самостоятельные проекты с одинаковыми тестами и runner.
- `capstone-pack`: инструкции для переноса в реальный клиент и отдельная ручная приёмка.

## What success means

`COMPLETED` подтверждает учебные сценарии конфигурации. Это не подтверждение качества ответов LLM, защищённости production-среды, подключения MCP или готовности ученика к самостоятельному production-доступу. Ручной перенос оценивается отдельно по `capstone-pack/ACCEPTANCE.md`.

## Publication boundary

Тип курса в API: `AI_ASSISTANTS`; маршрут приложения: `/ai`. В `publication.json` сохранены реальные идентификаторы опубликованных уроков и проверенные ссылки на starter/answer. Первый урок открыт гостям; полный курс входит в PRO/LIFETIME и доступен ADMIN. Выбор фреймворков Base/Standard не изменён. Локальная лаборатория не отправляет прогресс на платформу.
