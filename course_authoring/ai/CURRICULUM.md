# ИИ на практике: программа после расширения

44 урока, 14 разделов. +18 отдельных занятий вместо объединения больших предметов в один обзор. Стабильные ключи и опубликованные ID прежних 26 упражнений сохранены.

## Начало работы: модель, клиент и задача

1. Ассистент, агент и workflow: кто за что отвечает / Assistant, agent, workflow: who does what? [расширен, политика + отдельный перенос]
2. Почему модель забывает: токены и контекстное окно / Why a model forgets: tokens and the context window [новый, исполняемый JavaScript]
3. Первый запуск: клиент, модель, папка и проверка / First setup: client, model, workspace, and a check [новый, исполняемый JavaScript]
4. Как поставить задачу, которую можно проверить / Write a task you can actually verify [расширен, политика + отдельный перенос]

## Контекст и инструкции

5. Как дать модели нужные файлы и убрать лишнее / Choose the files a model actually needs [расширен, политика + отдельный перенос]
6. Правила проекта: что хранить в AGENTS.md / Project rules: what belongs in AGENTS.md [расширен, политика + отдельный перенос]
7. Показать образец: примеры вместо длинных запретов / Show the format: examples instead of long prohibitions [новый, исполняемый JavaScript]
8. Получить JSON, который можно безопасно обработать / Get JSON that your application can safely handle [новый, исполняемый JavaScript]

## Инструменты и границы доверия

9. Права ассистента: чтение, запись, терминал и сеть / Assistant permissions: files, terminal, and network [расширен, политика + отдельный перенос]
10. Prompt injection: когда данные притворяются командами / Prompt injection: when data pretends to be instructions [расширен, политика + отдельный перенос]

## Рабочий цикл и диагностика

11. До первой правки: ветка, исходный diff и точка возврата / Before editing: a branch, baseline diff, and recovery point [новый, исполняемый JavaScript]
12. Проверка результата: тесты, diff и честный отчёт / Verify the result: tests, diff, and an honest report [расширен, политика + отдельный перенос]
13. Как найти причину ошибки и не переписать всё / Find a failure’s cause without rewriting everything [расширен, политика + отдельный перенос]

## Контракты инструментов и передача работы

14. Контракт инструмента: вход, выход и побочные эффекты / Tool contracts: inputs, outputs, and side effects [расширен, политика + отдельный перенос]
15. MCP без магии: обнаружить инструмент и проверить права / MCP without magic: discover a tool and review access [новый, исполняемый JavaScript]
16. Инструмент упал: повторить, уточнить или остановиться / A tool failed: retry, clarify, or stop? [новый, исполняемый JavaScript]
17. Потоковый ответ и кнопка «Стоп» / Streaming responses and a working Stop button [новый, исполняемый JavaScript]
18. Передача задачи: что должен знать следующий исполнитель / Handoffs: what the next worker needs [расширен, политика + отдельный перенос]

## Качество, стоимость и диагностика запусков

19. Бюджет запуска: деньги, время и число вызовов / Run budgets: money, time, and calls [расширен, политика + отдельный перенос]
20. Набор проверок: обычные, пограничные и опасные случаи / An evaluation set: normal, boundary, and unsafe cases [расширен, политика + отдельный перенос]
21. Не только accuracy: пропуски, ложные тревоги и цена ошибки / Beyond accuracy: misses, false alarms, and error cost [новый, исполняемый JavaScript]
22. Разобрать запуск по следам, а не по последнему ответу / Inspect a run through its trace, not its final answer [новый, исполняемый JavaScript]

## Несколько ролей без хаоса

23. Роли команды: планировщик, исполнитель и ревьюер / Team roles: planner, worker, and reviewer [расширен, политика + отдельный перенос]
24. Параллельная работа без конфликтов файлов / Parallel work without file conflicts [расширен, политика + отдельный перенос]

## Оркестратор: проект базового трека

25. Ревью и доработка: когда повторить, а когда остановиться / Review and repair: when to retry and when to stop [расширен, политика + отдельный перенос]
26. Проект: оркестратор с проверкой и остановкой / Project: an orchestrator with checks and stop conditions [расширен, политика + отдельный перенос]

## Своя агентная ОС на примере .agents

27. Своя .agents: роли, навыки, профили и знания / Your .agents: roles, skills, profiles, and knowledge [расширен, политика + отдельный перенос]
28. Локальный роутер и память: где на самом деле идут данные / Local routing and memory: where data really goes [расширен, политика + отдельный перенос]

## Модели на собственном ПК

29. Выбор локальной модели под задачу и железо / Choose a local model for the task and hardware [расширен, политика + отдельный перенос]
30. Запуск на ПК: healthcheck и первый настоящий ответ / Run on your PC: healthcheck and a real first answer [расширен, политика + отдельный перенос]
31. Управлять генерацией: длина, temperature и формат запроса / Control generation: length, temperature, and request shape [новый, исполняемый JavaScript]
32. Почему локальная модель тормозит: память и замеры / Why local inference is slow: memory and fair measurements [новый, исполняемый JavaScript]

## Адаптация под задачу и данные

33. Промпт, RAG или дообучение: выбрать по причине ошибки / Prompt, RAG, or fine-tuning: choose by the failure [расширен, политика + отдельный перенос]
34. Данные для обучения: разметка, права и независимый тест / Training data: labeling, rights, and an independent test [расширен, политика + отдельный перенос]

## RAG: ответы по своим документам

35. Подготовить документы для RAG: фрагменты и источники / Prepare RAG documents: chunks and source references [новый, исполняемый JavaScript]
36. Найти нужное: baseline поиска, embeddings и права доступа / Find the passage: search baselines, embeddings, and access [новый, исполняемый JavaScript]
37. Ответить по источникам — или честно отказаться / Answer from evidence, or say what is missing [новый, исполняемый JavaScript]

## Обучение и дообучение

38. Обучить классификатор на CPU и сохранить веса / Train a CPU classifier and save its weights [расширен, политика + отдельный перенос]
39. Модель учится или запоминает: читаем loss и validation / Learning or memorizing? Read loss and validation curves [новый, исполняемый JavaScript]
40. Выбрать эксперимент и не подсмотреть в итоговый тест / Choose an experiment without peeking at the final test [новый, исполняемый JavaScript]
41. LoRA и QLoRA: что дообучается и сколько это стоит / LoRA and QLoRA: what changes and what it costs [расширен, политика + отдельный перенос]
42. Перед LoRA-запуском: данные, chat template и пробный batch / Before a LoRA run: data, chat templates, and one batch [новый, исполняемый JavaScript]

## Локальный выпуск и итоговый проект

43. Выпуск модели: экспорт, квантизация и откат / Release a model: export, quantization, and rollback [расширен, политика + отдельный перенос]
44. Итоговый проект: локальная модель в рабочем процессе / Final project: a local model in a working process [расширен, политика + отдельный перенос]

## Зачем эти изменения

- Первый запуск вынесен из общих советов в проверяемую последовательность: клиент, модель, workspace, права, baseline.
- Контекстное окно объясняется до сборки контекста; формат JSON и ошибки типов — до инструментов.
- До первой правки появились Git-песочница и точка возврата. До оркестратора изучаются ошибки инструментов, отмена, метрики и трассы.
- RAG разложен на подготовку корпуса, поиск с фильтрацией доступа и ссылочную проверку ответа. Лексический baseline не выдаётся за embeddings или семантическую гарантию.
- Локальный runtime дополнен настройками генерации и честным замером скорости.
- CPU-обучение дополнено чтением loss, выбором эксперимента на validation и отдельным LoRA-preflight.
- В старых уроках добавлены разные разобранные случаи: поиск, фокус кнопки, iframe, документы, handoff, права. Названия описывают действие и результат, а не абстрактную «магическую» возможность.
- RU и EN прошли редакторский проход: конкретные ситуации, короткие объяснения причин, без обещаний гарантированной продуктивности и без одинаковых рекламных вступлений. Стороннему сервису тексты не отправлялись.

## Требования

Терминал, JSON и простой Git diff; для 18 заданий с кодом — основы JavaScript. CODING_PRIMER.md даёт мост к функциям, объектам, массивам и тестам. React/Angular не требуются. Python 3.10+ нужен для CPU-проекта. GPU-маршрут дополнительный.

## Что не выдаётся за завершённое

Это прикладной курс по ассистентам и адаптации, не полный ML-degree. Нет проверки GPU-обучения на реальном оборудовании, live-MCP сертификации и настоящей генерации локальной LLM в рамках этого релиза. Автопроверка RAG проверяет алгоритм и ссылки, но не истинность произвольного текста.

## Первичные технические источники

- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [TRL SFT Trainer](https://huggingface.co/docs/trl/sft_trainer)
- [PEFT quantization](https://huggingface.co/docs/peft/developer_guides/quantization)
