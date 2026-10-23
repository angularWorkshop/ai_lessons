# ИИ на практике: программа курса

50 уроков в 14 разделах. В этой редакции добавлены 6 уроков, углублён 21 существующий. Прежние ID сохранены. Номер в названии Git-ветки — стабильный ключ, а не позиция урока в программе.

Практика: 26 заданий на политику/конфигурацию и 24 задания с исполняемой функцией. Для реальной системы есть отдельные сквозные проекты: CPU-обучение, агентный цикл, поиск источников и MCP-клиент/сервер. SUCCESS основного задания не означает, что на ПК ученика уже проверены GPU или локальная LLM.

## Начало работы: модель, клиент и задача

1. Ассистент, агент и workflow: кто за что отвечает / Assistant, agent, workflow: who does what? [сохранён после проверки; политика/конфигурация]
2. Первый запуск: клиент, модель, папка и проверка / First setup: client, model, workspace, and a check [углублён; код]
3. Как LLM строит ответ и почему может уверенно ошибаться / How an LLM builds an answer, and why confidence can be wrong [новый урок; код]
4. Почему модель забывает: токены и контекстное окно / Why a model forgets: tokens and the context window [углублён; код]
5. Как поставить задачу, которую можно проверить / Write a task you can actually verify [сохранён после проверки; политика/конфигурация]

## Контекст и инструкции

6. Как дать модели нужные файлы и убрать лишнее / Choose the files a model actually needs [сохранён после проверки; политика/конфигурация]
7. Правила проекта: что хранить в AGENTS.md / Project rules: what belongs in AGENTS.md [углублён; политика/конфигурация]
8. Показать образец: примеры вместо длинных запретов / Show the format: examples instead of long prohibitions [сохранён после проверки; код]
9. Получить JSON, который можно безопасно обработать / Get JSON that your application can safely handle [сохранён после проверки; код]

## Инструменты и границы доверия

10. Права ассистента: чтение, запись, терминал и сеть / Assistant permissions: files, terminal, and network [сохранён после проверки; политика/конфигурация]
11. Prompt injection: когда данные притворяются командами / Prompt injection: when data pretends to be instructions [сохранён после проверки; политика/конфигурация]

## Рабочий цикл и диагностика

12. До первой правки: ветка, исходный diff и точка возврата / Before editing: a branch, baseline diff, and recovery point [сохранён после проверки; код]
13. Проверка результата: тесты, diff и честный отчёт / Verify the result: tests, diff, and an honest report [сохранён после проверки; политика/конфигурация]
14. Как найти причину ошибки и не переписать всё / Find a failure’s cause without rewriting everything [сохранён после проверки; политика/конфигурация]

## Контракты инструментов и передача работы

15. Контракт инструмента: вход, выход и побочные эффекты / Tool contracts: inputs, outputs, and side effects [углублён; политика/конфигурация]
16. Function calling: от запроса модели до результата инструмента / Function calling: from a model request to a tool result [новый урок; код]
17. MCP на практике: сервер, клиент и вызов инструмента / MCP in practice: server, client, and tool execution [углублён; код]
18. Инструмент упал: повторить, уточнить или остановиться / A tool failed: retry, clarify, or stop? [сохранён после проверки; код]
19. Потоковый ответ и кнопка «Стоп» / Streaming responses and a working Stop button [сохранён после проверки; код]
20. Передача задачи: что должен знать следующий исполнитель / Handoffs: what the next worker needs [сохранён после проверки; политика/конфигурация]

## Качество, стоимость и диагностика запусков

21. Бюджет запуска: деньги, время и число вызовов / Run budgets: money, time, and calls [сохранён после проверки; политика/конфигурация]
22. Набор проверок: обычные, пограничные и опасные случаи / An evaluation set: normal, boundary, and unsafe cases [сохранён после проверки; политика/конфигурация]
23. Не только accuracy: пропуски, ложные тревоги и цена ошибки / Beyond accuracy: misses, false alarms, and error cost [сохранён после проверки; код]
24. Разобрать запуск по следам, а не по последнему ответу / Inspect a run through its trace, not its final answer [сохранён после проверки; код]

## Несколько ролей без хаоса

25. Роли команды: планировщик, исполнитель и ревьюер / Team roles: planner, worker, and reviewer [сохранён после проверки; политика/конфигурация]
26. Параллельная работа без конфликтов файлов / Parallel work without file conflicts [сохранён после проверки; политика/конфигурация]

## Оркестратор: проект базового трека

27. Ревью и доработка: когда повторить, а когда остановиться / Review and repair: when to retry and when to stop [сохранён после проверки; политика/конфигурация]
28. Проект: оркестратор с проверкой и остановкой / Project: an orchestrator with checks and stop conditions [углублён; политика/конфигурация]

## Своя агентная ОС на примере .agents

29. Своя .agents: роли, навыки, профили и знания / Your .agents: roles, skills, profiles, and knowledge [углублён; политика/конфигурация]
30. Память агента: что сохранять, когда пересматривать и удалять / Agent memory: what to keep, revalidate, and delete [новый урок; код]
31. Локальный роутер и память: где на самом деле идут данные / Local routing and memory: where data really goes [углублён; политика/конфигурация]

## Модели на собственном ПК

32. Выбор локальной модели под задачу и железо / Choose a local model for the task and hardware [углублён; политика/конфигурация]
33. Запуск на ПК: healthcheck и первый настоящий ответ / Run on your PC: healthcheck and a real first answer [углублён; политика/конфигурация]
34. Управлять генерацией: длина, temperature и формат запроса / Control generation: length, temperature, and request shape [сохранён после проверки; код]
35. Почему локальная модель тормозит: память и замеры / Why local inference is slow: memory and fair measurements [сохранён после проверки; код]

## Адаптация под задачу и данные

36. Промпт, RAG или дообучение: выбрать по причине ошибки / Prompt, RAG, or fine-tuning: choose by the failure [углублён; политика/конфигурация]
37. Данные для обучения: разметка, права и независимый тест / Training data: labeling, rights, and an independent test [углублён; политика/конфигурация]

## RAG: ответы по своим документам

38. Подготовить документы для RAG: фрагменты и источники / Prepare RAG documents: chunks and source references [углублён; код]
39. Найти нужное: baseline поиска, embeddings и права доступа / Find the passage: search baselines, embeddings, and access [углублён; код]
40. Embeddings на числах: cosine similarity и совместимость индекса / Embeddings by the numbers: cosine similarity and index compatibility [новый урок; код]
41. Ответить по источникам — или честно отказаться / Answer from evidence, or say what is missing [углублён; код]

## Обучение и дообучение

42. Обучить классификатор на CPU и сохранить веса / Train a CPU classifier and save its weights [углублён; политика/конфигурация]
43. Модель учится или запоминает: читаем loss и validation / Learning or memorizing? Read loss and validation curves [углублён; код]
44. Выбрать эксперимент и не подсмотреть в итоговый тест / Choose an experiment without peeking at the final test [сохранён после проверки; код]
45. Подготовить SFT-пример: роли, padding и маска loss / Build an SFT example: roles, padding, and the loss mask [новый урок; код]
46. LoRA и QLoRA: что дообучается и сколько это стоит / LoRA and QLoRA: what changes and what it costs [углублён; политика/конфигурация]
47. Перед LoRA-запуском: данные, chat template и пробный batch / Before a LoRA run: data, chat templates, and one batch [углублён; код]

## Локальный выпуск и итоговый проект

48. Выпуск модели: экспорт, квантизация и откат / Release a model: export, quantization, and rollback [углублён; политика/конфигурация]
49. Локальный сервис модели: очередь, совместимость и безопасное переключение / Serve a local model: queues, compatibility, and safe switching [новый урок; код]
50. Итоговый проект: локальная модель в рабочем процессе / Final project: a local model in a working process [углублён; политика/конфигурация]

## Границы курса

Это прикладной курс по ассистентам, агентам и адаптации моделей под задачу, а не замена полноценной программе ML. Обучение LLM с нуля, распределённое обучение и production-кластер Kubernetes не заявлены как освоенные. GPU/LoRA, конкретный GUI-клиент и локальная LLM требуют отдельной проверки на подходящем оборудовании.
