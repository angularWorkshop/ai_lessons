// Stable keys are independent of display order and published branch numbers.
export const depthSections = [
  { id: 'retrieval', title: { RU: 'RAG: ответы по своим документам', EN: 'RAG: answers from your documents' } },
];
const lesson = (id, section, ru, en) => ({ id, section, concepts: [id.slice(3)], RU: ru, EN: en });
export const depthLessons = [
  lesson('27-context-window', 'foundations', {
    title: 'Почему модель забывает: токены и контекстное окно',
    theory: [
      'Модель не читает бесконечную историю. В один запрос помещается ограниченное число токенов: частей слов, знаков и служебных элементов. Страница русского текста и страница кода могут занимать разное число токенов. Оценка по символам годится для грубого ограничения файла, но не для точного расчёта запроса.',
      'Из окна нужно заранее вычесть инструкции, историю, описания инструментов и место для ответа. Допустим, учебное окно равно 100 единицам. Инструкции занимают 10, история 20, инструменты 10, ответу оставляем 30. Документу остаётся 30, а не 60. В упражнении числа уже выражены в условных токенах: токенизатор мы здесь не пишем.',
      'Когда места не хватает, сначала уберите нерелевантные логи и старые попытки. Сохраните исходную цель, ограничения, подтверждённые факты и открытые вопросы. Краткое резюме тоже может потерять важное условие: сравните его с исходной задачей перед новой сессией. Увеличение окна не исправляет противоречивые инструкции и не гарантирует, что модель использует каждый фрагмент.',
    ],
    example: 'window = instructions + history + tools + documents + reserved_output\n100 = 10 + 20 + 10 + 30 + 30\n// document=31 no longer fits',
    tasks: ['В solve(input) вычислите remaining после всех резервов.', 'Возвращайте fits по исходному остатку, не по обрезанному до нуля.', 'Проверьте точную границу и случай, когда одна история уже переполняет окно.'],
    transfer: 'В своём клиенте найдите счётчик контекста или usage запроса. Сравните короткую задачу с той же задачей и большим логом. Не используйте вымышленные числа из упражнения как лимит реальной модели.',
    pitfall: 'Обрезать историю молча — значит рисковать потерей запрета или критерия приёмки.',
  }, {
    title: 'Why a model forgets: tokens and the context window',
    theory: [
      'A model cannot read an unlimited conversation. Each request has a token budget covering pieces of words, punctuation, and control text. A page of prose and a page of code need not have the same token count. Character counts can limit a file roughly; they cannot price or size a request precisely.',
      'Reserve space for instructions, history, tool descriptions, and the answer before adding documents. In a toy window of 100 units, instructions use 10, history 20, tools 10, and the answer needs 30. Documents get 30, not 60. The exercise receives counts in fictional token units; you are not implementing a tokenizer.',
      'When space runs out, remove irrelevant logs and obsolete attempts first. Keep the original goal, constraints, established facts, and open questions. A summary can lose a critical condition too: compare it with the task before opening a fresh session. A larger window neither resolves contradictory instructions nor guarantees attention to every passage.',
    ],
    example: 'window = instructions + history + tools + documents + reserved_output\n100 = 10 + 20 + 10 + 30 + 30\n// document=31 no longer fits',
    tasks: ['Compute remaining in solve(input) after all reservations.', 'Compute fits from the original remainder, not the clamped value.', 'Check the exact boundary and history that already exceeds the window.'],
    transfer: 'Find context or usage information in your client. Compare a short task with the same task plus a large log. Do not treat the exercise numbers as a real model limit.',
    pitfall: 'Silently trimming history can remove an access restriction or acceptance criterion.',
  }),
  lesson('28-client-preflight', 'foundations', {
    title: 'Первый запуск: клиент, модель, папка и проверка',
    theory: [
      'Клиент — приложение, в котором вы общаетесь с моделью и подключаете инструменты. Модель может работать у провайдера или на вашем ПК; это не одно и то же приложение. Для заданий с кодом прочитайте CODING_PRIMER.md: нужны функции, объекты и массивы JavaScript. Сначала выберите учебную папку без рабочих данных. Не открывайте весь диск и не вводите ключ провайдера в файл, который попадёт в Git.',
      'Перед задачей зафиксируйте четыре решения: workspace, model, permissions и testCommand. Начните с чтения. Попросите назвать файл и объяснить, что делает ближайший тест; затем сами выполните указанную команду. Если клиент не видит файл, проверьте рабочую папку и доступ, а не меняйте модель наугад. Если команда не найдена, установите требуемую среду по README.',
      'Упражнение проверяет полноту записи этих решений, но не подключается к клиенту. Его ready означает только заполненный чеклист. Настоящая приёмка — открытая папка, видимая выбранная модель, проверенный отказ на запись и результат команды. Названия меню отличаются между клиентами: ориентируйтесь на смысл настройки и документацию выбранной версии.',
    ], example: 'workspace: ./learning-demo\nmodel: a model available in your client\npermissions: read-only\ntestCommand: npm test\nfirst request: explain one file, do not edit',
    tasks: ['Верните ready и missing для четырёх полей в указанном порядке.', 'Отсутствующая строка и строка из пробелов считаются пропуском.', 'Не заменяйте неизвестную настройку значением по умолчанию.'],
    transfer: 'Создайте копию generated/01-task-boundaries/starter, выполните npm test и сохраните исходный ожидаемый отказ. Подключите выбранный клиент только к этой копии. Отдельно запишите, где исполняется модель.',
    pitfall: 'Выбранная модель не означает, что клиент получил правильную папку или безопасные права.',
  }, {
    title: 'First setup: client, model, workspace, and a check',
    theory: [
      'The client is the application where you talk to a model and attach tools. The model can run at a provider or on your PC; it is not the client itself. Read CODING_PRIMER.md before code exercises: you need basic JavaScript functions, objects, and arrays. Choose a disposable folder without work data. Do not grant access to an entire disk or put a provider key in a tracked file.',
      'Record four choices before starting: workspace, model, permissions, and testCommand. Begin with reading. Ask the assistant to name one file and explain its nearest test, then run the command yourself. If it cannot see a file, inspect the folder and permissions rather than swapping models at random. If a command is missing, follow the README environment requirements.',
      'The exercise validates this record, not a client connection. Its ready result means a complete checklist. Real acceptance needs the opened folder, selected model, an observed write denial, and actual command output. Menu names vary across clients: follow the setting’s purpose and your version’s documentation.',
    ], example: 'workspace: ./learning-demo\nmodel: a model available in your client\npermissions: read-only\ntestCommand: npm test\nfirst request: explain one file, do not edit',
    tasks: ['Return ready and missing for the four fields in the specified order.', 'A missing string or whitespace-only string counts as absent.', 'Do not invent defaults for unknown settings.'],
    transfer: 'Copy generated/01-task-boundaries/starter and run npm test to record the expected initial failure. Connect your chosen client only to this copy. Separately record where inference happens.',
    pitfall: 'Selecting a model does not select the right folder or establish safe permissions.',
  }),
  lesson('29-example-selection', 'context', {
    title: 'Показать образец: примеры вместо длинных запретов',
    theory: [
      'Иногда нужный формат проще показать. Для сортировки обращений дайте два коротких примера с входом, категорией и объяснением границы: ошибка входа относится к bug, вопрос о тарифе — к question. Добавьте пограничный случай, а не десять почти одинаковых обращений. Пример учит форме ответа в текущем запросе; веса модели не меняются.',
      'Train здесь означает примеры, которые можно показывать модели; test — отложенные вопросы для независимой проверки. Используйте только разрешённые и проверенные примеры той же задачи. Неправильная разметка даёт убедительный образец ошибки. Учебная функция отбирает train-примеры с approved: true, совпадающей task и наибольшим score. Score здесь уже дан автором; алгоритм не умеет определять качество текста. При равенстве используется id для воспроизводимости.',
      'Не показывайте ответы из итогового теста. Иначе улучшение результата может означать копирование примеров, а не перенос навыка. Сохраните версию промпта и сравните на новых обращениях: без примеров, с одним и с несколькими. Если типичные ответы стали лучше, а пограничные хуже, измените набор, а не объявляйте победу по одному удачному диалогу.',
    ], example: 'Input: Cannot sign in after password reset\nOutput: {"category":"bug"}\n\nInput: Which plan includes this course?\nOutput: {"category":"question"}',
    tasks: ['Отберите только train, approved: true и совпадающую task.', 'Сортируйте по score убывающе, затем id; примените limit.', 'Верните список id. Набор test и непроверенные примеры не должны попасть в ответ.'],
    transfer: 'Напишите два вымышленных образца для своей задачи и один новый проверочный запрос. Сравните ответы с примерами и без них, не меняя одновременно формулировку задачи.',
    pitfall: 'Пример из финального теста превращает проверку в подсказку.',
  }, {
    title: 'Show the format: examples instead of long prohibitions',
    theory: [
      'A concrete example can explain a format faster than a paragraph of rules. For ticket triage, show a short input, category, and boundary: a failed login is a bug; a plan question is a question. Include a borderline case rather than ten near-duplicates. Examples guide the current request; they do not update model weights.',
      'Here train means examples you may show the model; test means questions held aside for an independent check. Use approved, reviewed examples for the same task. A mislabeled record becomes a convincing demonstration of a mistake. The lab selects train examples with approved: true, matching task, and the highest score. That score is supplied by the author; the function does not judge writing quality. Ties use id for repeatable ordering.',
      'Keep final test answers out of demonstrations. Otherwise a higher score may mean copying rather than transfer. Version the prompt and compare no examples, one example, and several on fresh tickets. If common answers improve but boundary cases regress, revise the set rather than declaring success from one good conversation.',
    ], example: 'Input: Cannot sign in after password reset\nOutput: {"category":"bug"}\n\nInput: Which plan includes this course?\nOutput: {"category":"question"}',
    tasks: ['Keep only train records with approved: true and matching task.', 'Sort by descending score, then id, and apply limit.', 'Return ids. Exclude held-out and unreviewed examples.'],
    transfer: 'Write two invented demonstrations and one new evaluation request. Compare outputs with and without examples, keeping the rest of the task unchanged.',
    pitfall: 'An example copied from the final test turns evaluation into a hint.',
  }),
  lesson('30-structured-results', 'context', {
    title: 'Получить JSON, который можно безопасно обработать',
    theory: [
      '«Верни JSON» не задаёт контракт. Модель может вернуть корректный JSON с неправильными полями, строкой вместо числа или незнакомой категорией. Сначала опишите, какие значения принимает следующий шаг. В нашем примере нужны ровно category и confidence; допустимы bug или question, а число лежит от 0 до 1.',
      'Разделите три проверки: текст удалось разобрать, структура подходит схеме, содержание достаточно надёжно для действия. JSON.parse решает только первую. Даже ответ с confidence: 0.99 не доказывает правильность категории: уверенность заявлена моделью и отдельно требует оценки. Результат разбора не должен сам разрешать оплату, удаление или публикацию.',
      'В упражнении верните { ok: false } при любом нарушении, включая дополнительные поля и null. Не исправляйте неверную категорию догадкой. В настоящем клиенте используйте поддержку схем, если она есть, и проверяйте ответ на своей стороне. Текст ошибки можно передать на ограниченное исправление формата; исходное невалидное значение нельзя незаметно принять.',
    ], example: '{"category":"bug","confidence":0.7}  // accepted\n{"category":"bug","confidence":"0.7"}  // rejected: string\n{"category":"bug","confidence":0.7,"deploy":true}  // rejected',
    tasks: ['Разберите входную строку через JSON.parse с обработкой исключения.', 'Проверьте два поля, типы, категорию и диапазон; массивы и null отклоняются.', 'При успехе верните { ok: true, value }, иначе { ok: false }.'],
    transfer: 'Проверьте выбранный клиент на неверном типе, лишнем поле и отказе модели. Запишите, где проверяется схема и что пользователь увидит при ошибке.',
    pitfall: 'Правильная структура не делает утверждение истинным.',
  }, {
    title: 'Get JSON that your application can safely handle',
    theory: [
      '“Return JSON” is not a contract. A response can be valid JSON with wrong fields, a string instead of a number, or an unknown category. Define what the next step accepts first. This example requires exactly category and confidence: bug or question, plus a number between zero and one.',
      'Separate parsing, schema validation, and deciding whether content justifies an action. JSON.parse handles only parsing. Even confidence: 0.99 does not prove the category is correct: a model’s confidence needs evaluation too. A parsed answer must not grant permission to pay, delete, or publish.',
      'Return { ok: false } for every contract violation, including extra fields and null. Do not guess a replacement category. In a real client, use schema support where available and validate on your side. You may send a formatting error through a bounded repair attempt; never silently accept the original invalid value.',
    ], example: '{"category":"bug","confidence":0.7}  // accepted\n{"category":"bug","confidence":"0.7"}  // rejected: string\n{"category":"bug","confidence":0.7,"deploy":true}  // rejected',
    tasks: ['Parse the input string with JSON.parse and handle exceptions.', 'Validate exactly two fields, types, category, and range; reject arrays and null.', 'Return { ok: true, value } on success, otherwise { ok: false }.'],
    transfer: 'Test your client with a wrong type, an extra field, and a model refusal. Record where schema validation occurs and what the user sees on failure.',
    pitfall: 'A valid structure does not make a claim true.',
  }),
  lesson('31-git-checkpoint', 'workflow', {
    title: 'До первой правки: ветка, исходный diff и точка возврата',
    theory: [
      'Ассистент должен начинать не с редактирования, а с понимания текущего состояния. Выполните git status и посмотрите существующий diff. Если там чужая работа, не очищайте её ради удобного старта. Для обучения сделайте отдельную копию или ветку от согласованной версии. Имя ветки само по себе не изолирует файлы от других процессов.',
      'Сохраните точку возврата и проверьте, что она содержит нужные файлы, но не ключи, дампы или личную конфигурацию. Не используйте git add . не глядя. После правки сравните diff с исходным: ассистент мог изменить форматирование всего файла или соседнюю функцию. Пройдите тест до изменения, чтобы отличить старую ошибку от новой.',
      'Упражнение принимает запись подготовленной песочницы: clean, отдельную branch, backupVerified и отсутствие secretsTracked. Проверка не создаёт backup и не смотрит реальный Git. В рабочем проекте чистая ветка — удобный вариант, а не требование удалить незакоммиченные изменения пользователя. При конфликте остановитесь и согласуйте способ изоляции.',
    ], example: 'git status --short\ngit diff --stat\ngit diff -- src tests\n# choose a disposable copy or agreed branch\n# run the baseline test before asking for a change',
    tasks: ['Верните { ready: true } только для чистой учебной ветки не main.', 'Требуйте backupVerified: true и secretsTracked: false.', 'Не вызывайте Git и не удаляйте файлы из solve: упражнение проверяет запись, не диск.'],
    transfer: 'Сохраните исходный diff маленького проекта и сделайте одну обратимую правку. Покажите только свой diff и вручную восстановите один свой изменённый файл, не затрагивая чужую работу.',
    pitfall: 'git reset --hard не является безопасной кнопкой отмены в общем рабочем каталоге.',
  }, {
    title: 'Before editing: a branch, baseline diff, and recovery point',
    theory: [
      'Start by understanding the working tree, not by editing. Run git status and inspect the existing diff. Do not clear another person’s work to obtain a clean start. Use a disposable copy or an agreed branch for learning. A branch name alone does not isolate files from other running processes.',
      'Save a recovery point and verify that it includes the files you need, not keys, dumps, or personal configuration. Avoid an unreviewed git add . . Compare the final diff with the baseline: an assistant may reformat a whole file or touch a neighboring function. Run a test before changing code so an existing failure is not blamed on the patch.',
      'The exercise checks a sandbox record: clean, a separate branch, backupVerified, and no secretsTracked. It neither creates a backup nor reads Git. In real work, a clean branch is convenient, not a reason to remove user changes. Stop and agree on isolation when existing work conflicts with the task.',
    ], example: 'git status --short\ngit diff --stat\ngit diff -- src tests\n# choose a disposable copy or agreed branch\n# run the baseline test before asking for a change',
    tasks: ['Return { ready: true } only for a clean learning branch other than main.', 'Require backupVerified: true and secretsTracked: false.', 'Do not invoke Git or delete files from solve; the lab checks a record, not your disk.'],
    transfer: 'Capture a small project’s baseline diff and make one reversible edit. Identify your own diff and restore one of your edited files manually without touching someone else’s work.',
    pitfall: 'git reset --hard is not a safe undo button in a shared working tree.',
  }),
  lesson('32-mcp-discovery', 'integration', {
    title: 'MCP без магии: обнаружить инструмент и проверить права',
    theory: [
      'MCP связывает приложение-хост, клиент и сервер, который предоставляет возможности. Это способ описать и вызвать инструменты, а не новая модель и не система прав сама по себе. Сервер документации может дать чтение, а сервер задач — создание записей. Подключение каждого меняет поверхность доступа.',
      'Разберите одну операцию по шагам: клиент получает список инструментов, показывает имя и схему, отправляет аргументы, сервер проверяет доступ и возвращает результат. Пользователь должен понимать, к какому сервису уйдут данные. Не подключайте неизвестный сервер с рабочими ключами и не считайте описание readOnly техническим доказательством отсутствия записи.',
      'В упражнении доступен вымышленный список discovered и отдельный approved. Отберите пересечение, где readOnly равно true. Это проверка согласования каталога, не реализация MCP-транспорта. При изменении возможностей сервера повторите review: прежнее согласие читать документ не означает согласия удалить его. Реальное подключение проверяется отдельно на тестовом сервере без рабочих данных.',
    ], example: 'host → client → server\ndiscovery: read-doc, delete-doc\napproved: read-doc\nallowed catalog: read-doc\n// discovered does not mean authorized',
    tasks: ['Оставьте только approved-имена с readOnly: true.', 'Верните имена в алфавитном порядке.', 'Незнакомый инструмент и изменившаяся возможность записи должны исчезнуть из результата.'],
    transfer: 'Нарисуйте цепочку выбранной интеграции: клиент, сервер, данные, учётная запись. Перед подключением прочитайте схему одного инструмента и опишите его побочные эффекты. Не вводите рабочие ключи для этой проверки.',
    pitfall: 'MCP не отменяет авторизацию сервера и не делает сторонний инструмент доверенным.',
  }, {
    title: 'MCP without magic: discover a tool and review access',
    theory: [
      'MCP connects a host application, a client, and a server exposing capabilities. It describes tool discovery and invocation; it is not a new model or an access-control system on its own. A documentation server may provide reading, while a task server may create records. Each connection changes the access surface.',
      'Trace one operation: the client discovers tools, displays a name and schema, sends arguments, and the server validates access and returns a result. Know which service receives the data. Do not attach an unknown server using work credentials, or treat a readOnly description as proof that writing is impossible.',
      'The exercise supplies fictional discovered and approved lists. Select their intersection with readOnly: true. This validates a reviewed catalog; it does not implement MCP transport. Review capability changes again: permission to read a document does not authorize deletion. Verify an actual connection separately against a test server without work data.',
    ], example: 'host → client → server\ndiscovery: read-doc, delete-doc\napproved: read-doc\nallowed catalog: read-doc\n// discovered does not mean authorized',
    tasks: ['Keep approved names with readOnly: true.', 'Return names in alphabetical order.', 'Exclude unfamiliar tools and a previously approved tool that now writes.'],
    transfer: 'Draw the client, server, data, and account for one integration. Read a tool schema and describe its side effects before connecting. No work credentials are needed for this review.',
    pitfall: 'MCP does not replace server authorization or make third-party tools trustworthy.',
  }),
  lesson('33-tool-retries', 'integration', {
    title: 'Инструмент упал: повторить, уточнить или остановиться',
    theory: [
      'Ошибка доступа, неверные аргументы и временная недоступность требуют разных действий. При 400 сначала проверьте вход. При 401 или 403 остановитесь и разберитесь с учётной записью и правами. Повторять запрещённый запрос с другими формулировками — не исправление. 429 и часть 5xx могут быть временными, но это ещё не разрешение на бесконечный повтор.',
      'Особенно опасна неоднозначная запись: сервер мог создать заказ, а ответ потерялся. Повтор создаст второй заказ, если операция не защищена идемпотентностью. Для чтения повтор обычно проще; для записи нужны подтверждение результата, ключ идемпотентности или ручная сверка. Учебное поле idempotent заявляет уже проверенное свойство операции.',
      'Функция выбирает действие, но не ждёт и не отправляет запросы. Для идемпотентной операции с 429 или 5xx возвращайте retry-with-backoff, пока attempt меньше трёх. В реальной системе учитывайте Retry-After, общий deadline и случайную добавку к задержке. Сохраняйте причину остановки, чтобы следующий исполнитель не начинал тот же цикл с нуля.',
    ], example: '400 → fix input\n403 → human\n503 + idempotent read + attempts left → backoff\n503 + ambiguous write → stop and reconcile',
    tasks: ['Сначала остановите attempt >= 3.', '401/403 направляйте человеку; успешные 2xx принимайте.', 'Повтор разрешён только для идемпотентного 429/5xx. Остальное — stop.'],
    transfer: 'На тестовом stub-сервере воспроизведите 403 и 503. Проверьте ограничение повторов и отсутствие второго вызова для операции записи. Не создавайте реальные заказы.',
    pitfall: 'Timeout не доказывает, что сервер ничего не сделал.',
  }, {
    title: 'A tool failed: retry, clarify, or stop?',
    theory: [
      'Bad arguments, denied access, and temporary outages need different responses. Inspect input after 400. Stop after 401 or 403 and resolve the account or permission issue. Rewording a forbidden request is not a fix. A 429 or some 5xx errors may be temporary, but they do not authorize unlimited retries.',
      'An ambiguous write is particularly risky: the server may have created an order before its response was lost. Retrying can create a second order without idempotency protection. Reads are often easier to repeat; writes need result reconciliation, an idempotency key, or human review. The lab’s idempotent flag represents a property already established by the caller.',
      'The function selects an action without waiting or making requests. For idempotent 429 or 5xx failures, return retry-with-backoff while attempt is below three. Real systems also need Retry-After handling, an overall deadline, and jitter. Preserve the stop reason so a handoff does not restart the same loop from zero.',
    ], example: '400 → fix input\n403 → human\n503 + idempotent read + attempts left → backoff\n503 + ambiguous write → stop and reconcile',
    tasks: ['Stop first when attempt >= 3.', 'Send 401/403 to human and accept successful 2xx responses.', 'Retry only idempotent 429/5xx requests; otherwise stop.'],
    transfer: 'Use a stub server to reproduce 403 and 503. Check retry limits and the absence of a second write call. Do not create real orders.',
    pitfall: 'A timeout does not prove that the server did nothing.',
  }),
  lesson('34-cancellation', 'integration', {
    title: 'Потоковый ответ и кнопка «Стоп»',
    theory: [
      'Потоковый ответ приходит частями. Пользователь уже видит текст, хотя запрос ещё не завершён. Не путайте непустой экран с успешным результатом: соединение может оборваться после первого предложения. Для интерфейса нужны отдельные состояния получения, завершения, отмены и ошибки.',
      'В упражнении delta добавляет текст, done завершает ответ, cancel и error останавливают обработку. После остановки игнорируйте поздние события. Частичный текст можно оставить пользователю, но пометьте его как незавершённый. Не передавайте оборванный JSON следующему инструменту и не сохраняйте черновик как принятый результат задачи.',
      'В настоящем HTTP-клиенте отмена обычно включает AbortController и снятие обработчиков. Провайдер может учитывать уже выполненную работу; кнопка «Стоп» не обещает нулевую стоимость. Наш список событий не является wire-форматом конкретного SDK. Сначала преобразуйте события клиента к внутренней модели, а затем тестируйте её независимо от сети.',
    ], example: 'delta("A") → delta("B") → done = complete("AB")\ndelta("A") → cancel → delta("B") = cancelled("A")\ndelta("A") → connection lost = incomplete("A")',
    tasks: ['Собирайте delta.text в порядке прихода.', 'Остановитесь на первом done, cancel или error.', 'Без завершающего события верните incomplete, не complete.'],
    transfer: 'Отмените длинный запрос в тестовом клиенте. Убедитесь, что интерфейс перестал ждать и поздний фрагмент не дописался в ответ следующего запроса.',
    pitfall: 'Первый токен измеряет отзывчивость, а не время до готового ответа.',
  }, {
    title: 'Streaming responses and a working Stop button',
    theory: [
      'A streamed answer arrives in pieces. A user can see text before the request finishes. A nonempty screen is not proof of success: the connection can fail after the first sentence. Represent receiving, completed, cancelled, and failed states separately.',
      'In the exercise, delta appends text, done finishes the response, and cancel or error stops consumption. Ignore late events after termination. You can preserve partial text, but label it unfinished. Never feed truncated JSON into the next tool or store a draft as an accepted task result.',
      'A real HTTP client typically needs cancellation through AbortController and listener cleanup. Providers may charge for work already performed; Stop cannot promise zero cost. The exercise event list is not any SDK’s wire format. Adapt client events to an internal representation, then test that representation independently of the network.',
    ], example: 'delta("A") → delta("B") → done = complete("AB")\ndelta("A") → cancel → delta("B") = cancelled("A")\ndelta("A") → connection lost = incomplete("A")',
    tasks: ['Append delta.text in arrival order.', 'Stop at the first done, cancel, or error.', 'Without a terminal event, return incomplete, not complete.'],
    transfer: 'Cancel a long request in a test client. Confirm that the UI stops waiting and a late event cannot enter the next request’s answer.',
    pitfall: 'Time to first token measures responsiveness, not time to a usable answer.',
  }),
  lesson('35-evaluation-metrics', 'quality', {
    title: 'Не только accuracy: пропуски, ложные тревоги и цена ошибки',
    theory: [
      'Если 95 из 100 обращений обычные, ответ «обычное» для всех даст 95% accuracy и пропустит каждую серьёзную проблему. Сначала выберите, какая ошибка важнее: лишняя ручная проверка или пропуск опасного случая. Метрика должна отражать это решение, а не украшать отчёт.',
      'Для положительного класса посчитайте TP — верно найденные случаи, FP — ложные тревоги, FN — пропуски. Precision = TP / (TP + FP), recall = TP / (TP + FN). Если найдены все две проблемы, но ещё две обычные заявки названы проблемами, recall равен 1, а precision — 0.5. Это разные свойства системы.',
      'В упражнении actual — ручная разметка, predicted — решение модели, true означает целевой класс. Для пустого знаменателя договоримся возвращать 0; в отчёте обязательно покажите число примеров. Для выпуска дополнительно проверьте критические ошибки и разные группы запросов. Среднее значение не оправдывает утечку данных или действие без разрешения.',
    ], example: 'TP=2, FP=2, FN=0\nprecision=2/(2+2)=0.5\nrecall=2/(2+0)=1\n// always-negative baseline can hide rare failures',
    tasks: ['Посчитайте TP, FP, FN по boolean-полям.', 'Верните precision и recall, не проценты.', 'При пустом знаменателе верните 0; не делите на ноль.'],
    transfer: 'Разметьте небольшой разрешённый набор: обычные и критичные случаи. Покажите матрицу ошибок и baseline. Не используйте этот учебный размер как доказательство качества на всём рынке.',
    pitfall: 'Высокая accuracy может скрывать нулевую способность находить редкий важный класс.',
  }, {
    title: 'Beyond accuracy: misses, false alarms, and error cost',
    theory: [
      'If 95 out of 100 tickets are routine, predicting routine every time earns 95% accuracy and misses every serious issue. Decide which mistake matters more: unnecessary manual review or an undetected dangerous case. Choose a metric for that tradeoff, not for an attractive report.',
      'For the positive class, count TP, correctly detected cases; FP, false alarms; and FN, missed cases. Precision = TP / (TP + FP), while recall = TP / (TP + FN). Finding both real issues while flagging two routine tickets gives recall 1 and precision 0.5. These measure different properties.',
      'In the exercise, actual is human labeling, predicted is the model decision, and true means the target class. We define an empty denominator as zero; a report must also show sample counts. A release needs checks for critical failures and meaningful request groups. Averages cannot justify a data leak or an unauthorized action.',
    ], example: 'TP=2, FP=2, FN=0\nprecision=2/(2+2)=0.5\nrecall=2/(2+0)=1\n// always-negative baseline can hide rare failures',
    tasks: ['Count TP, FP, and FN from boolean fields.', 'Return precision and recall as ratios, not percentages.', 'Return zero for an empty denominator.'],
    transfer: 'Label a small approved set with routine and critical cases. Show a confusion matrix and baseline. Do not present a tiny learning set as proof of market-wide quality.',
    pitfall: 'High accuracy can hide an inability to detect the rare class that matters.',
  }),
  lesson('36-trace-summary', 'quality', {
    title: 'Разобрать запуск по следам, а не по последнему ответу',
    theory: [
      'Ответ «готово» не объясняет, почему задача заняла минуту и пять обращений к инструменту. Записывайте события запуска: идентификатор, этап, длительность, исход и ссылку на безопасный артефакт. Один trace связывает события одной задачи; отдельные spans помогают найти медленный поиск или повторяющийся отказ.',
      'Не складывайте в логи все промпты, персональные данные и ответы инструментов «на всякий случай». Для начала достаточно метаданных и короткой категории ошибки. В упражнении input содержит последовательные вызовы: суммируйте длительность всех, включая неуспешные, и верните id ошибок. Поле prompt не должно попасть в итоговую сводку.',
      'Сумма длительностей совпадает с затраченным временем только для неперекрывающихся шагов. При параллельной работе нужны временные интервалы: две задачи по секунде могут закончиться за одну секунду, а не за две. Сводка упражнения считает суммарное время вызовов, не wall-clock. Для сравнения версий сохраняйте одинаковую нагрузку и отмечайте, что именно измеряли.',
    ], example: 'task-17\n  read: 50 ms, ok\n  search: 100 ms, failed\nsummary: calls=2, durationMs=150, failed=[search]\n// no prompt body in the summary',
    tasks: ['Верните calls, сумму durationMs и failed id в исходном порядке.', 'Пустой запуск должен дать нули и пустой массив.', 'Не переносите prompt и другие лишние поля в сводку.'],
    transfer: 'Сохраните безопасный журнал одной учебной задачи. Найдите самый дорогой шаг и повтор, который не помог. Удалите содержимое запросов, если оно не нужно для диагностики.',
    pitfall: 'Наблюдаемость не оправдывает бессрочное хранение пользовательских данных.',
  }, {
    title: 'Inspect a run through its trace, not its final answer',
    theory: [
      '“Done” does not explain why a task needed a minute and five tool calls. Record event id, stage, duration, outcome, and a safe artifact reference. A trace links one task’s events; individual spans help locate a slow search or repeated denial.',
      'Do not log full prompts, personal data, and tool outputs just in case. Start with metadata and short error categories. The exercise receives sequential calls: include failed calls in the duration and return their ids. A prompt field must not leak into the summary.',
      'Summed durations equal elapsed time only for nonoverlapping work. Parallel tasks need intervals: two one-second calls can finish in one second rather than two. The exercise reports total call duration, not wall-clock latency. Keep workloads comparable when evaluating versions and name exactly what was measured.',
    ], example: 'task-17\n  read: 50 ms, ok\n  search: 100 ms, failed\nsummary: calls=2, durationMs=150, failed=[search]\n// no prompt body in the summary',
    tasks: ['Return calls, total durationMs, and failed ids in input order.', 'An empty run gives zero counts and an empty array.', 'Exclude prompt and all other extra fields from the summary.'],
    transfer: 'Capture a safe event log for one learning task. Find its most expensive step and one ineffective retry. Remove request contents that diagnosis does not need.',
    pitfall: 'Observability does not justify keeping user data indefinitely.',
  }),
  lesson('37-document-chunks', 'retrieval', {
    title: 'Подготовить документы для RAG: фрагменты и источники',
    theory: [
      'RAG сначала находит подходящие фрагменты, затем передаёт их модели вместе с вопросом. Веса не меняются. Если правила тарифа обновились вчера, исправлять индекс обычно проще, чем переобучать модель. Однако сначала нужен пригодный корпус: разрешённые документы, версия, владелец и понятный способ удалить устаревший материал.',
      'Не режьте текст произвольно в рабочем поиске: заголовок может оторваться от условия, а таблица — от пояснения. Обычно начинают с границ разделов и ограничивают размер. Небольшое перекрытие сохраняет смысл на стыках, но увеличивает индекс и может вернуть дубликаты. Универсального размера для всех документов нет: его выбирают по проверочным вопросам.',
      'Здесь реализуется прозрачный baseline по символам: size, overlap и шаг size-overlap. Сохраняйте source и start каждого фрагмента, чтобы затем показать источник. Это не токенизатор и не умный разбор PDF. После последнего фрагмента остановитесь, не создавая лишний кусок из одного перекрытия. Пустой документ не должен создавать фиктивное свидетельство.',
    ], example: 'text: abcdefgh, size: 5, overlap: 2\nchunk 1: abcde, start: 0\nchunk 2: defgh, start: 3\nsource: manual-v2 for both',
    tasks: ['Верните фрагменты со source, start и text.', 'Переходите на size-overlap, остановитесь после покрытия конца.', 'Пустой текст даёт []; size должен быть больше overlap, overlap неотрицательный.'],
    transfer: 'Возьмите два собственных коротких документа. Разрежьте по разделам, затем сравните с символьным baseline. Найдите вопрос, которому нужен текст по обе стороны границы.',
    pitfall: 'Фрагмент без источника сложно проверить, обновить и удалить.',
  }, {
    title: 'Prepare RAG documents: chunks and source references',
    theory: [
      'RAG retrieves useful passages before giving them to a model with the question. It does not update weights. When a plan rule changed yesterday, updating an index is usually simpler than retraining. First build an approved corpus with versions, owners, and a way to remove stale material.',
      'Avoid arbitrary cuts in a working search system: a heading can become separated from its condition, or a table from its explanation. Start with section boundaries and a size limit. Some overlap preserves boundary context, but enlarges the index and can return duplicates. Choose chunk size through evaluation questions, not a universal magic number.',
      'Implement a transparent character baseline here: size, overlap, and a size-overlap stride. Preserve source and start so a response can identify evidence. This is neither a tokenizer nor a PDF parser. Stop when the last chunk covers the end instead of emitting another overlap-only fragment. Empty text must not become imaginary evidence.',
    ], example: 'text: abcdefgh, size: 5, overlap: 2\nchunk 1: abcde, start: 0\nchunk 2: defgh, start: 3\nsource: manual-v2 for both',
    tasks: ['Return chunks with source, start, and text.', 'Advance by size-overlap and stop after covering the end.', 'Empty text returns []; require size > overlap and nonnegative overlap.'],
    transfer: 'Split two short documents you own by section, then compare with the character baseline. Find a question that requires text on both sides of a boundary.',
    pitfall: 'A chunk without a source is difficult to verify, update, or delete.',
  }),
  lesson('38-retrieval-ranking', 'retrieval', {
    title: 'Найти нужное: baseline поиска, embeddings и права доступа',
    theory: [
      'Начните с простого поиска, чтобы понять, что именно улучшает сложная система. В упражнении запрос и документ превращаются в множества слов, а score равен числу общих слов. Повторы не добавляют баллов. Это слабый лексический baseline: синонимы и перефразирования он часто пропускает, зато его результат легко объяснить.',
      'Embeddings представляют текст векторами, по близости которых можно искать смысловые совпадения. Но близость не равна истинности и не задаёт права доступа. Сначала исключите документы другого пользователя или организации, затем ранжируйте разрешённые. Фильтрация после генерации уже поздно: закрытый текст мог попасть в контекст.',
      'Сравнивайте top-k на размеченных вопросах: находится ли нужный источник, сколько мусора попадает рядом, как меняется время. Реранкер может переставить найденные кандидаты, но не вернёт документ, которого не было в исходной выдаче. В учебном baseline нет векторной базы и модели embeddings; тесты проверяют фильтр tenant и воспроизводимый порядок.',
    ], example: 'query: reset password\nA: password password → score 1\nB: Reset password → score 2\nC: reset password, another tenant → excluded before ranking',
    tasks: ['Разбейте английский текст на уникальные lowercase-слова [a-z0-9]+.', 'До подсчёта score отфильтруйте tenant, затем оставьте score > 0.', 'Сортируйте по score убывающе, затем id; верните первые k id.'],
    transfer: 'Составьте пять вопросов с известным источником. Сравните лексический поиск и доступный локальный embeddings-поиск на тех же документах. Отдельно проверьте чужой tenant.',
    pitfall: 'Высокий similarity score не разрешает читать чужой документ.',
  }, {
    title: 'Find the passage: search baselines, embeddings, and access',
    theory: [
      'Start with a simple search to see what a more complex system improves. The lab turns a query and document into word sets and scores their intersection. Repeated words earn no extra points. This weak lexical baseline misses many synonyms and paraphrases, but its behavior is easy to explain.',
      'Embeddings represent text as vectors whose proximity can retrieve related meaning. Similarity is neither truth nor authorization. Exclude other users’ or organizations’ documents before ranking. Filtering after generation is too late: private text may already have entered the context.',
      'Compare top-k on labeled questions: was the right source retrieved, how much irrelevant text accompanied it, and at what latency? A reranker can reorder candidates, not recover a document absent from retrieval. This lab has no vector database or embedding model; tests cover tenant filtering and repeatable ranking.',
    ], example: 'query: reset password\nA: password password → score 1\nB: Reset password → score 2\nC: reset password, another tenant → excluded before ranking',
    tasks: ['Tokenize English text into unique lowercase [a-z0-9]+ words.', 'Filter tenant before scoring and keep score > 0.', 'Sort by descending score, then id, and return the first k ids.'],
    transfer: 'Write five questions with known source passages. Compare lexical search and an available local embedding search on the same corpus. Test another tenant separately.',
    pitfall: 'A high similarity score never grants access to another tenant’s document.',
  }),
  lesson('39-grounded-answer', 'retrieval', {
    title: 'Ответить по источникам — или честно отказаться',
    theory: [
      'Хорошая выдача поиска ещё не гарантирует хороший ответ. Модель может добавить правдоподобное условие, которого нет в документе, или сослаться на несуществующий источник. Просите связывать каждое проверяемое утверждение с найденным фрагментом. Если данных недостаточно, лучше назвать пробел и задать уточнение, чем дописать правило из общих знаний.',
      'В упражнении claims содержит текст утверждения и sources. Проверяйте, что у каждого утверждения есть хотя бы один источник и все его id присутствуют в retrieved. Пустой список утверждений не считается проверенным ответом. Это только проверка ссылочной целостности: существующая ссылка может не подтверждать написанное. Семантическую опору нужно оценивать отдельно.',
      'Разделите оценку RAG на поиск и генерацию. Сначала выясните, найден ли правильный фрагмент. Затем проверьте, не искажён ли он и не пропущены ли оговорки. Добавьте вопрос без ответа в корпусе и конфликт версий. Полезный отказ не должен выглядеть как ошибка приложения; покажите, какой информации не хватает и где её можно получить.',
    ], example: 'retrieved: [refund-v2]\nclaim: "Refunds require a receipt", sources: [refund-v2]\nmissing evidence → ask or abstain\nexisting citation ≠ proof that its text supports the claim',
    tasks: ['Верните accepted только для непустого claims.', 'У каждого claim.sources должен быть хотя бы один id.', 'Каждый id должен существовать в retrieved; не оценивайте смысл текста регулярным выражением.'],
    transfer: 'Проверьте ответ на известный факт, отсутствующий факт и устаревшее правило. Для каждого утверждения вручную откройте источник. Отметьте ссылочную и смысловую проверку отдельно.',
    pitfall: 'Красивая цитата может существовать, но не подтверждать вывод.',
  }, {
    title: 'Answer from evidence, or say what is missing',
    theory: [
      'Good retrieval does not guarantee a good answer. A model may invent a plausible condition or cite a nonexistent source. Connect each checkable claim to a retrieved passage. When evidence is insufficient, describe the gap or ask a question rather than filling in a policy from general knowledge.',
      'In the exercise, claims contains text and sources. Require at least one source for every claim and verify all ids against retrieved. Empty claims do not count as a verified answer. This is reference integrity only: a real source may still fail to support a statement. Evaluate semantic support separately.',
      'Assess retrieval and generation independently. First ask whether the correct passage was found; then check distortion and omitted qualifications. Include an unanswerable question and conflicting document versions. Useful abstention should not look like an application failure: explain what information is missing and where to obtain it.',
    ], example: 'retrieved: [refund-v2]\nclaim: "Refunds require a receipt", sources: [refund-v2]\nmissing evidence → ask or abstain\nexisting citation ≠ proof that its text supports the claim',
    tasks: ['Return accepted only for nonempty claims.', 'Require at least one source id per claim.', 'Every id must exist in retrieved; do not pretend a regex proves semantic support.'],
    transfer: 'Test a known fact, an absent fact, and an outdated rule. Open every cited source manually. Report reference integrity separately from semantic grounding.',
    pitfall: 'A real citation can still fail to support the conclusion.',
  }),
  lesson('40-generation-request', 'local-models', {
    title: 'Управлять генерацией: длина, temperature и формат запроса',
    theory: [
      'После проверки локального сервера задайте условия генерации. Имя модели должно совпадать с установленным; идентификатор из чужого примера не гарантирует наличие весов. Ограничьте длину ответа. Короткая классификация не нуждается в том же бюджете, что объяснение diff. Большой предел — верхняя граница, а не обещание полезного длинного ответа.',
      'Temperature влияет на выбор следующего токена. Для повторяемого сравнения начните с 0, но не обещайте побитовую идентичность: результат зависит от runtime, железа, шаблона чата и версии модели. Меняйте один параметр за эксперимент. Если ответ неверен, снижение temperature не добавит недостающий факт.',
      'Упражнение строит тело локального Ollama /api/chat: model, messages, stream: false и options. num_predict ограничивает генерацию, но не заменяет бюджет всего контекста. Функция не делает HTTP-запрос и не загружает веса. После тестов передайте такое тело только уже проверенному loopback-runtime и отдельно обработайте отказ, timeout и пустой ответ.',
    ], example: 'POST /api/chat\n{ "model": "your-installed-model", "messages": [{"role":"user","content":"Classify"}],\n  "stream": false, "options": { "temperature": 0, "num_predict": 80 } }',
    tasks: ['Соберите объект запроса из input.model, question и maxOutput.', 'Задайте stream: false, temperature: 0 и num_predict из maxOutput.', 'Не хардкодьте имя модели и не отправляйте запрос из solve.'],
    transfer: 'Используйте установленную модель и один вымышленный запрос. Сравните два лимита ответа и проверьте причину завершения. Не запускайте автоматическое скачивание неизвестных весов.',
    pitfall: 'Temperature 0 не доказывает правильность или абсолютную воспроизводимость.',
  }, {
    title: 'Control generation: length, temperature, and request shape',
    theory: [
      'After checking the local server, define generation settings. A model name must match an installed model; a name copied from an example does not prove weights are available. Bound output length. Short classification does not need the same budget as explaining a diff. A large limit is a ceiling, not a promise of useful text.',
      'Temperature affects next-token selection. Start at zero for comparisons, but do not promise bitwise repeatability: runtime, hardware, chat template, and model revision also matter. Change one parameter per experiment. Lower temperature cannot supply a missing fact.',
      'The exercise builds a local Ollama /api/chat body: model, messages, stream: false, and options. num_predict limits generation rather than the whole context budget. No HTTP call or weight download occurs. After tests, send such a request only to an already reviewed loopback runtime and handle denial, timeout, and empty responses separately.',
    ], example: 'POST /api/chat\n{ "model": "your-installed-model", "messages": [{"role":"user","content":"Classify"}],\n  "stream": false, "options": { "temperature": 0, "num_predict": 80 } }',
    tasks: ['Build the request from input.model, question, and maxOutput.', 'Set stream: false, temperature: 0, and num_predict from maxOutput.', 'Do not hard-code the model or make a request from solve.'],
    transfer: 'Use an installed model and one invented request. Compare two output limits and inspect the finish reason. Do not automatically download unfamiliar weights.',
    pitfall: 'Temperature zero proves neither correctness nor absolute repeatability.',
  }),
  lesson('41-inference-speed', 'local-models', {
    title: 'Почему локальная модель тормозит: память и замеры',
    theory: [
      'Время загрузки весов, обработка входа и генерация ответа — разные задержки. Первый запрос часто включает холодный старт. Сравнивать его с уже прогретой моделью нечестно. Зафиксируйте модель, квантизацию, длину входа, предел ответа и число одновременных запросов; иначе быстрый результат может оказаться просто более коротким.',
      'Часть памяти занята весами, часть — контекстом и рабочими буферами. Квантизация уменьшает размер весов, но не отменяет расходы KV-cache и может менять качество. Если не хватает памяти, уменьшите контекст или параллелизм и повторите тот же тест. Не покупайте GPU по одной оценке «параметры × биты»: runtime и задача тоже влияют.',
      'В упражнении считаются только успешные прогретые запросы с положительной длительностью. Скорость равна сумме выходных токенов, делённой на сумму секунд. Среднее отдельных скоростей даёт иной ответ при разных длительностях. При отсутствии валидных замеров верните null, а не бесконечную скорость или выдуманный ноль. Это throughput генерации, не время до первого токена.',
    ], example: 'request A: 10 tokens / 1 s\nrequest B: 10 tokens / 3 s\ncombined: 20 / 4 = 5 tokens/s\nnot (10 + 3.33) / 2',
    tasks: ['Отфильтруйте warm: true, ok: true и seconds > 0.', 'Верните samples и tokensPerSecond по суммарным токенам и времени.', 'Если валидных запросов нет, tokensPerSecond равен null.'],
    transfer: 'Запишите отдельно холодный и три прогретых запуска одной модели. Сравните задержку и качество при одном изменённом параметре. Укажите оборудование, а не только красивую скорость.',
    pitfall: 'Более быстрая квантизация не считается улучшением, пока не проверено качество на той же задаче.',
  }, {
    title: 'Why local inference is slow: memory and fair measurements',
    theory: [
      'Loading weights, processing input, and generating output are separate delays. A first request often includes a cold start. Comparing it with a warm model is unfair. Fix the model, quantization, input length, output ceiling, and concurrency; a faster result may merely be shorter.',
      'Weights occupy only part of memory; context and runtime buffers use more. Quantization reduces weight storage without eliminating KV-cache costs and may affect quality. If memory runs out, reduce context or concurrency and repeat the same test. Do not buy a GPU from a parameter-count-times-bits estimate alone.',
      'The lab uses successful warm requests with positive duration. Throughput is total output tokens divided by total seconds. Averaging individual rates gives a different answer when durations differ. With no valid measurements, return null rather than infinite speed or an invented zero. This measures generation throughput, not time to first token.',
    ], example: 'request A: 10 tokens / 1 s\nrequest B: 10 tokens / 3 s\ncombined: 20 / 4 = 5 tokens/s\nnot (10 + 3.33) / 2',
    tasks: ['Keep warm: true, ok: true, and seconds > 0.', 'Return samples and tokensPerSecond using totals.', 'With no valid requests, tokensPerSecond is null.'],
    transfer: 'Record a cold start and three warm runs of one model. Change one setting and compare both latency and quality. Report hardware alongside speed.',
    pitfall: 'Faster quantization is not an improvement until quality survives the same task evaluation.',
  }),
  lesson('42-learning-curves', 'model-training', {
    title: 'Модель учится или запоминает: читаем loss и validation',
    theory: [
      'В CPU-проекте веса меняются, чтобы уменьшить ошибку на train. Loss показывает величину этой ошибки, а не долю правильных ответов. Validation нужен для другого вопроса: переносится ли улучшение на примеры, которых оптимизатор не видел? Уменьшение train loss само по себе не повод выпускать модель.',
      'Если train loss падает, а validation растёт, возможно переобучение. Проверьте также размер и разметку выборки, распределение классов и одинаковую предобработку. По двум точкам нельзя установить причину наверняка. Не лечите любой разрыв увеличением эпох: можно ещё сильнее подогнать train. Сохраните график, baseline и условия запуска.',
      'Упражнение сравнивает первую и последнюю точки, возвращая подсказку для диагностики, не медицински точный диагноз модели. Нечисловой loss блокирует вывод; одной точки недостаточно. В реальном эксперименте смотрите всю кривую и ошибки по классам. Финальный test не используют для выбора числа эпох.',
    ], example: 'epoch 1: train=1.0, validation=1.0\nepoch 2: train=0.1, validation=2.0\n→ possible-overfit, not "train longer"',
    tasks: ['Отклоните нечисловые и бесконечные train/validation как invalid.', 'Для менее двух точек верните more-evidence.', 'Падающий train и растущий validation → possible-overfit; падающий validation → improving; иначе investigate.'],
    transfer: 'Запустите CPU-проект с двумя значениями числа эпох. Сохраните train/validation loss и несколько ошибок. Не трогайте test до выбора режима.',
    pitfall: 'Низкий train loss может означать запоминание, а не полезное обобщение.',
  }, {
    title: 'Learning or memorizing? Read loss and validation curves',
    theory: [
      'The CPU project changes weights to reduce error on train. Loss measures that error, not the fraction of correct predictions. Validation asks a different question: does improvement transfer to examples the optimizer has not seen? Falling training loss alone is not a release criterion.',
      'If training loss falls while validation loss rises, overfitting is possible. Also inspect sample size, labeling, class balance, and consistent preprocessing. Two points cannot establish the cause. More epochs are not a universal cure; they may fit train even harder. Keep the curve, baseline, and run conditions.',
      'The exercise compares first and last measurements and returns a diagnostic hint, not a definitive explanation. Invalid loss blocks interpretation; one point cannot show a trend. A real experiment needs the whole curve and per-class errors. Do not choose epoch count on the final test set.',
    ], example: 'epoch 1: train=1.0, validation=1.0\nepoch 2: train=0.1, validation=2.0\n→ possible-overfit, not "train longer"',
    tasks: ['Return invalid for nonnumeric or nonfinite train/validation loss.', 'Return more-evidence for fewer than two measurements.', 'Falling train with rising validation means possible-overfit; falling validation means improving; otherwise investigate.'],
    transfer: 'Run the CPU project with two epoch counts. Preserve train/validation loss and several errors. Leave test untouched until choosing the configuration.',
    pitfall: 'Low training loss can reflect memorization instead of useful generalization.',
  }),
  lesson('43-experiment-selection', 'model-training', {
    title: 'Выбрать эксперимент и не подсмотреть в итоговый тест',
    theory: [
      'Эксперимент должен быть сравнимым: одна задача, зафиксированные данные и понятное изменение. Запишите revision кода и данных, seed, настройки и путь к артефакту. Seed помогает повторению, но не гарантирует одинаковое поведение на другом оборудовании. Файл model-final-final.json без этих сведений почти невозможно проверить.',
      'Обучение использует train, выбор настроек — validation, итоговая оценка выбранной версии — test. Если каждый раз выбирать победителя по test, он превращается в ещё одну validation-выборку. Не выбирайте удачный seed после десятков попыток и не показывайте только лучший результат без числа запусков.',
      'В упражнении выбирается минимальный конечный loss только среди записей validation. Это фиксированная учебная цель; для другой задачи может быть важнее recall или число критических отказов. Равенство разрешается по id. Отсутствующая validation — блокер, а не повод подставить train. После выбора заморозьте конфигурацию, оцените test один раз и сохраните неудачные примеры для следующего цикла, не переписывая текущий отчёт.',
    ], example: 'run-a: train loss 0.01, validation loss 0.9\nrun-b: train loss 0.2, validation loss 0.6\nselect run-b on validation\nthen evaluate the frozen run-b on test',
    tasks: ['Оставьте split: validation и конечные числовые loss.', 'Выберите минимальный loss, при равенстве — id по алфавиту.', 'Верните id или null, если подходящих измерений нет.'],
    transfer: 'Создайте experiments.json для двух CPU-запусков. Выберите один по validation и объясните выбор до просмотра итогового test.',
    pitfall: 'Многократный подбор по test делает финальную оценку оптимистичной.',
  }, {
    title: 'Choose an experiment without peeking at the final test',
    theory: [
      'Make experiments comparable: one task, fixed data, and an explicit change. Record code and data revisions, seed, settings, and artifact location. A seed helps repeatability without guaranteeing identical results on other hardware. A file named model-final-final.json without this record is hard to review.',
      'Train fits weights, validation selects settings, and test assesses the selected version. Picking a winner on test repeatedly turns it into another validation set. Do not choose a lucky seed after dozens of trials and report only the winner without the number of attempts.',
      'The exercise minimizes finite loss on validation records only. That is a fixed learning objective; another task may prioritize recall or critical failures. Break ties by id. Missing validation blocks selection rather than falling back to train. Freeze the chosen settings, evaluate test once, and preserve failures for a later cycle without rewriting the current report.',
    ], example: 'run-a: train loss 0.01, validation loss 0.9\nrun-b: train loss 0.2, validation loss 0.6\nselect run-b on validation\nthen evaluate the frozen run-b on test',
    tasks: ['Keep split: validation with finite numeric loss.', 'Choose the lowest loss, breaking ties alphabetically by id.', 'Return the id or null if no valid measurements exist.'],
    transfer: 'Create experiments.json for two CPU runs. Choose one on validation and explain the decision before inspecting final test results.',
    pitfall: 'Repeated tuning on test makes the final estimate optimistic.',
  }),
  lesson('44-adapter-preflight', 'model-training', {
    title: 'Перед LoRA-запуском: данные, chat template и пробный batch',
    theory: [
      'LoRA добавляет обучаемые адаптеры к базовой модели; это не обучение большой языковой модели с нуля. QLoRA сочетает адаптеры с квантизованной базой. Совместимость зависит от архитектуры, runtime, библиотек и железа. Поэтому первый шаг — проверенная среда и маленький пробный запуск, а не ночное обучение на случайном ноутбуке.',
      'Зафиксируйте revision базы и токенизатора, право использования данных и модели, раздельные выборки и chat template. Шаблон определяет границы ролей и окончания ответа. Если loss должен считаться только по ответу ассистента, проверьте реальную маску на одном примере: названия параметра недостаточно. Обрезание последовательности может удалить нужный ответ или завершающий токен.',
      'До длинного запуска прочитайте один batch: декодированный вход, метки, ненулевые обучаемые параметры, конечный loss, запись и повторная загрузка адаптера. Упражнение проверяет журнал этих шести допусков, а не тренирует LLM. Реальный GPU-маршрут дополнительный: используйте FINETUNING.md, сверьте текущие официальные инструкции для своей среды и не принимайте зелёный чеклист за выполненное обучение.',
    ], example: 'license → pinned base/tokenizer → disjoint splits\n→ chat template → loss mask → one-batch smoke\n→ save/reload adapter → bounded training → held-out comparison',
    tasks: ['Проверьте licensed, basePinned, splitChecked, templateChecked, maskChecked, smokePassed.', 'Только строгое true считается пройденной проверкой.', 'Верните ready и missing в указанном порядке; никаких скачиваний из solve.'],
    transfer: 'На совместимом оборудовании выполните только preflight и один batch по FINETUNING.md. Сохраните версии и выводы. Если GPU нет, завершите CPU-маршрут и явно отметьте LoRA как не выполненный.',
    pitfall: 'Низкий loss при неверной маске может выглядеть как обучение и не учить модель нужному ответу.',
  }, {
    title: 'Before a LoRA run: data, chat templates, and one batch',
    theory: [
      'LoRA trains adapters attached to a base model rather than a large language model from scratch. QLoRA combines adapters with a quantized base. Compatibility depends on architecture, runtime, libraries, and hardware. Begin with a reviewed environment and a tiny smoke run, not overnight training on an arbitrary laptop.',
      'Pin the base and tokenizer revisions, review model and data rights, keep splits disjoint, and inspect the chat template. The template marks roles and response endings. If loss should cover assistant responses only, inspect the actual mask on one example; setting a parameter is insufficient. Truncation can remove the answer or its terminating token.',
      'Before a long run, inspect one batch: decoded input, labels, nonzero trainable parameters, finite loss, and adapter save/reload. This exercise checks six recorded prerequisites, not LLM training. The real GPU path is optional: follow FINETUNING.md, check current official instructions for your environment, and do not present a green checklist as completed training.',
    ], example: 'license → pinned base/tokenizer → disjoint splits\n→ chat template → loss mask → one-batch smoke\n→ save/reload adapter → bounded training → held-out comparison',
    tasks: ['Check licensed, basePinned, splitChecked, templateChecked, maskChecked, and smokePassed.', 'Only strict true counts as a completed check.', 'Return ready and missing in that order; solve must not download anything.'],
    transfer: 'On compatible hardware, complete preflight and a single batch using FINETUNING.md. Preserve versions and evidence. Without a GPU, complete the CPU path and explicitly mark LoRA as not run.',
    pitfall: 'A wrong loss mask can produce reassuring loss while failing to train the intended response.',
  }),
];

export const lessonOrder = [
  '01-task-boundaries', '27-context-window', '28-client-preflight', '02-task-brief',
  '03-context-packet', '04-project-instructions', '29-example-selection', '30-structured-results',
  '05-tool-permissions', '06-untrusted-context',
  '31-git-checkpoint', '07-verification-evidence', '08-debugging',
  '09-tool-contract', '32-mcp-discovery', '33-tool-retries', '34-cancellation', '10-handoff',
  '11-budget', '12-evaluation', '35-evaluation-metrics', '36-trace-summary',
  '13-role-routing', '14-parallel-work', '15-review-loop', '16-orchestrator',
  '17-agent-os', '18-local-routing', '19-model-capacity', '20-local-endpoint',
  '40-generation-request', '41-inference-speed', '21-adaptation-choice', '22-dataset-splits',
  '37-document-chunks', '38-retrieval-ranking', '39-grounded-answer',
  '23-cpu-training', '42-learning-curves', '43-experiment-selection', '24-lora', '44-adapter-preflight',
  '25-model-release', '26-local-capstone',
];
