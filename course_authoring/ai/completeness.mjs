const entry = (id, section, RU, EN) => ({ id, section, concepts: [id.slice(3)], RU, EN });
export const completenessLessons = [
  entry('45-model-mechanics', 'foundations', {
    title: 'Как LLM строит ответ и почему может уверенно ошибаться',
    theory: [
      'Языковая модель получает последовательность токенов — частей слов, знаков и служебных элементов — и вычисляет оценки продолжений. Из них выбирается следующий токен, он добавляется к входу, и шаг повторяется. Поэтому ответ появляется постепенно. Модель не ищет готовую фразу в памяти как строку в базе данных и не проверяет автоматически каждое утверждение по источнику.',
      'При предварительном обучении меняются числовые веса: модель учится закономерностям большого корпуса. Во время обычного запроса веса остаются прежними, меняется только контекст. Пример в промпте влияет на текущий ответ, но не дообучает модель. Позже мы отдельно разберём RAG — передачу найденных документов — и SFT, где веса действительно обновляются на примерах задачи.',
      'Правдоподобное продолжение может быть фактически неверным. Вопрос с ложной предпосылкой или неизвестным названием часто провоцирует убедительную выдумку. Частота следующего токена, самооценка confidence и правильность ответа — разные величины. Проверяемый ответ связывают с тестом, вычислением или источником; в остальных случаях оставляют место для «не знаю».',
    ],
    walkthrough: [
      { title: 'Разберём один шаг без нейросетевой библиотеки', paragraphs: ['Представим, что после фразы «ответ:» кандидат yes получил вес 3, а no — 1. После нормировки вероятность yes равна 3/4. Это арифметический макет, а не выход настоящей модели: в LLM логиты обычно превращаются в распределение через softmax. Если заменить yes словом «выдумка», вероятность останется той же — вычисление ничего не знает об истинности слова.'], code: 'weight(yes)=3, weight(no)=1\nP(yes)=3/(3+1)=0.75\nP(no)=1/(3+1)=0.25\nsum(P)=1, but no factual claim has been verified' },
      { title: 'Какая проверка подходит к ответу', paragraphs: ['Для суммы используйте калькулятор, для поведения функции — тест, для правила возврата — актуальный документ. Попросить ту же модель ещё раз подтвердить свою фразу полезно для поиска противоречий, но это не независимое доказательство. Если проверка недоступна, сохраните ответ как гипотезу, не как готовый факт.'] },
    ],
    example: 'Question: Which rule changed in a document you have not supplied?\nUnsafe answer: a plausible invented policy.\nUseful next step: request the document or state that the change is unknown.',
    tasks: ['Нормируйте неотрицательные конечные weight в solve(input), сохраняя порядок token.', 'Возвращайте probability как долю, не проценты. При пустом входе, отрицательном весе или нулевой сумме верните [].', 'Не добавляйте к вероятности утверждение о правильности токена.'],
    transfer: 'Сравните вопрос о неизвестном вымышленном продукте с тем же вопросом и коротким собственным документом. Отметьте неподтверждённые детали, даже если ответ звучит уверенно. Не используйте личные данные.',
    pitfall: 'Высокая вероятность продолжения не является вероятностью истинности всего ответа.',
  }, {
    title: 'How an LLM builds an answer, and why confidence can be wrong',
    theory: [
      'A language model receives tokens, pieces of words, punctuation, and control markers, and computes scores for continuations. It selects a next token, appends it, and repeats. That is why an answer arrives progressively. The model is not looking up a complete sentence as a database row, nor automatically checking every statement against a source.',
      'Pretraining changes numerical weights to learn patterns in a large corpus. An ordinary request leaves those weights unchanged and changes context instead. A prompt example guides this answer without training the model. Later we distinguish RAG, which supplies retrieved documents, from SFT, which really updates weights on task examples.',
      'A plausible continuation can be factually false. A question with a false premise or an unfamiliar invented name can elicit a convincing fabrication. Next-token probability, a self-reported confidence field, and factual correctness are different quantities. Tie a checkable answer to a test, calculation, or source; otherwise leave room for an explicit unknown.',
    ],
    walkthrough: [
      { title: 'One step without a neural-network library', paragraphs: ['Suppose yes has weight 3 and no has weight 1 after “answer:”. Normalization gives yes probability 3/4. This is an arithmetic teaching model, not a real network output: LLMs typically transform logits with softmax. Replace yes with “fabricated” and the arithmetic stays the same; it knows nothing about truth.'], code: 'weight(yes)=3, weight(no)=1\nP(yes)=3/(3+1)=0.75\nP(no)=1/(3+1)=0.25\nsum(P)=1, but no factual claim has been verified' },
      { title: 'Choose a check that matches the claim', paragraphs: ['Use a calculator for a sum, a test for function behavior, and a current document for refund rules. Asking the same model to confirm itself can expose contradictions, but is not independent evidence. When verification is unavailable, preserve the answer as a hypothesis rather than an established fact.'] },
    ],
    example: 'Question: Which rule changed in a document you have not supplied?\nUnsafe answer: a plausible invented policy.\nUseful next step: request the document or state that the change is unknown.',
    tasks: ['Normalize finite nonnegative weight values in solve(input), preserving token order.', 'Return probability as a ratio. Return [] for empty input, negative weights, or zero total mass.', 'Do not claim a probability proves that a token is correct.'],
    transfer: 'Compare a question about a fictional unknown product with the same question plus a short document you wrote. Mark unsupported details even when the answer sounds confident. Use no private data.',
    pitfall: 'A likely continuation is not the probability that the whole answer is true.',
  }),
  entry('46-tool-call-loop', 'integration', {
    title: 'Function calling: от запроса модели до результата инструмента',
    theory: [
      'Модель может вернуть не готовый ответ, а предложение вызвать add с аргументами a и b. Сама строка tool call ничего не складывает. Приложение разбирает предложение, проверяет имя, схему и разрешение, вызывает свою функцию и возвращает результат в следующий запрос модели. Только после этого модель формулирует ответ пользователю.',
      'Схема инструмента объясняет доступные параметры, но не заменяет проверку исполнения. Не превращайте имя функции в eval или shell-команду. В упражнении существует ровно add, разрешение approved задаётся вызывающей стороной, а два аргумента должны быть конечными числами. Строка "2" не приводится к числу автоматически. Результат связывается с исходным id, чтобы не перепутать несколько вызовов.',
      'Цикл останавливается при обычном ответе, отказе или исчерпании бюджета. Если модель снова просит тот же инструмент, это ещё не причина увеличить лимит. Побочные эффекты требуют защиты от повторов; даже для чтения ограничьте размер результата. В браузере вы реализуете один шаг, а в workbench/agent.mjs этот шаг включён в настоящий цикл с исполняемым калькулятором и тестовым поставщиком ответов.',
    ],
    walkthrough: [
      { title: 'Проследим все сообщения', paragraphs: ['Для запроса «сколько будет 2+3» модель предлагает вызов call-1. Host проверяет его и действительно получает число 5. В историю идут исходное предложение и tool-result с тем же id; иначе модель не знает, какой запрос исполнен. Сообщение инструмента остаётся данными, а не новой системной инструкцией.'], code: 'user: add 2 and 3\nassistant: call-1 → add({a:2,b:3})\nhost: validate → approve → execute\ntool: call-1 → 5\nassistant: 5' },
      { title: 'Проверим, что исполнение не выдумано', paragraphs: ['В offline-примере роль модели играет явно названный stub, но add исполняется как обычная JavaScript-функция. Тест проверяет trace и число реальных вызовов. Отказ по имени shell должен завершиться до инструмента. Затем тот же цикл можно подключить к локальному адаптеру: менять правила доступа ради модели не нужно.'] },
    ],
    example: 'approved add + numeric arguments → tool-result\nunknown tool or unapproved call → deny\nused >= limit → stop\nplain text with budget left → answer',
    tasks: ['Сначала проверьте used >= limit. Затем обработайте text как answer.', 'Для tool разрешите только approved add с ровно двумя числовыми полями a и b.', 'Верните tool-result с id и вычисленным value; при нарушении — deny.'],
    transfer: 'Запустите node ai_lessons/workbench/demo.mjs agent в ветке. Проверьте вычисленный результат, trace, отказ неизвестному инструменту и конечный бюджет. Stub не считается реальной LLM; локальная модель подключается отдельно.',
    pitfall: 'Function calling — предложение действия. Ответственность за исполнение и права остаётся у приложения.',
  }, {
    title: 'Function calling: from a model request to a tool result',
    theory: [
      'A model can propose add with arguments a and b instead of returning an answer. The tool-call text performs no arithmetic. Your application parses the proposal, validates the name, schema, and permission, executes its own function, and supplies the result in the next model request. The model can then answer the user.',
      'A tool schema describes parameters without replacing runtime validation. Never turn a function name into eval or a shell command. The lab exposes only add; the caller supplies approved, and both arguments must be finite numbers. The string "2" is not silently coerced. Correlate results with the original id to distinguish multiple calls.',
      'Stop on a final answer, denial, or exhausted budget. Another repeated request is not a reason to raise the limit. Side effects need replay protection; reads still need output limits. You implement one step in the browser. workbench/agent.mjs combines it into an actual loop with an executable calculator and an explicitly scripted response provider.',
    ],
    walkthrough: [
      { title: 'Follow every message', paragraphs: ['For “add 2 and 3”, the model proposes call-1. The host checks it and actually computes 5. Put both the original proposal and a tool result with the same id in history; otherwise the model cannot correlate execution. Tool output remains data rather than a new system instruction.'], code: 'user: add 2 and 3\nassistant: call-1 → add({a:2,b:3})\nhost: validate → approve → execute\ntool: call-1 → 5\nassistant: 5' },
      { title: 'Check that execution was not invented', paragraphs: ['Offline, an explicitly named stub plays the model role, but add really executes as JavaScript. Tests check the trace and actual tool-call count. A shell request must fail before execution. You can later attach a local adapter without changing access rules for the model.'] },
    ],
    example: 'approved add + numeric arguments → tool-result\nunknown tool or unapproved call → deny\nused >= limit → stop\nplain text with budget left → answer',
    tasks: ['Check used >= limit first; then handle text as answer.', 'For tool calls, allow only approved add with exactly two numeric fields a and b.', 'Return tool-result with id and the computed value; otherwise deny.'],
    transfer: 'Run node ai_lessons/workbench/demo.mjs agent in this branch. Inspect the computed result, trace, unknown-tool denial, and finite budget. The stub is not an LLM; actual local inference is a separate connection.',
    pitfall: 'Function calling proposes an action. The application still owns execution and authorization.',
  }),
  entry('47-vector-search', 'retrieval', {
    title: 'Embeddings на числах: cosine similarity и совместимость индекса',
    theory: [
      'Embedding — числовой вектор, который модель строит по тексту. Пригодная для поиска embedding-модель обучена так, чтобы некоторые смысловые связи отражались близостью векторов. Это не сжатый документ, из которого можно точно восстановить исходник. Сохраняйте текст и source рядом с вектором; генератор ответа получает найденный текст, а не одно число similarity.',
      'Cosine similarity сравнивает направления: dot(q,d) / (norm(q) × norm(d)). Для q=[1,0] документ [1,0] даёт 1, а [10,10] — около 0.707, хотя его скалярное произведение больше. Нулевой вектор не имеет направления. Здесь двумерные векторы придуманы для арифметики; они не доказывают семантическое качество какой-либо модели.',
      'Индекс и запрос должны использовать одну embedding-модель и совместимые версии предобработки. Одинаковой размерности недостаточно: две модели с 768 координатами могут задавать разные пространства. После смены модели перестройте индекс, а не ищите новым вектором по старым документам. Tenant-фильтр применяется до ранжирования, затем threshold и top-k. Пустая выдача допустима.',
    ],
    walkthrough: [
      { title: 'Посчитаем один результат вручную', paragraphs: ['Для q=[1,0] и d=[1,1] скалярное произведение равно 1. Норма q равна 1, норма d — sqrt(2), результат около 0.707. Умножение d на 10 не меняет угол. Сравните это с прежним лексическим baseline: он ищет общие слова, а векторный вариант — близость представлений. Проверять пользу нужно на тех же размеченных вопросах.'], code: 'q=[1,0], d=[1,1]\ndot=1, norm(q)=1, norm(d)=sqrt(2)\ncosine=1/sqrt(2)≈0.707\nthreshold=0.8 → no match' },
      { title: 'Переход к настоящему /api/embed', paragraphs: ['В локальном маршруте передайте массив текстов в установленную embedding-модель, проверьте количество и размерность embeddings. Сохраните имя модели, версию корпуса и параметры разбиения вместе с индексом. Укажите truncate:false, чтобы слишком длинный фрагмент не исчез незаметно. Workbench предоставляет проверяемый адаптер, но не скачивает модель и не включает облачный fallback.'] },
    ],
    example: 'tenant filter → model/version check → dimension check\n→ finite nonzero vectors → cosine → threshold → stable top-k\nmodel mismatch → rebuild index, not guess',
    tasks: ['Посчитайте cosine для конечных ненулевых векторов одной размерности.', 'До оценки исключите чужой tenant и другую model. Нулевой или некорректный query возвращает [].', 'Оставьте score >= threshold, сортируйте по score убывающе, затем id; верните первые k id.'],
    transfer: 'Выполните node ai_lessons/workbench/demo.mjs rag. Затем, если embedding-модель установлена, получите настоящие векторы через локальный адаптер и повторите поиск. Не называйте вручную заданные векторы обученными embeddings.',
    pitfall: 'Близость векторов — сигнал поиска, не доказательство факта и не право доступа.',
  }, {
    title: 'Embeddings by the numbers: cosine similarity and index compatibility',
    theory: [
      'An embedding is a numeric vector produced from text. A retrieval embedding model learns representations where some semantic relationships appear as proximity. It is not a compressed document that can be reconstructed exactly. Store text and source alongside the vector; generation uses the retrieved passage rather than a similarity number alone.',
      'Cosine similarity compares direction: dot(q,d) / (norm(q) × norm(d)). With q=[1,0], document [1,0] scores 1, while [10,10] scores about 0.707 despite its larger dot product. A zero vector has no direction. These invented two-dimensional vectors teach arithmetic, not a model’s semantic quality.',
      'Indexing and queries must use the same embedding model and compatible preprocessing versions. Equal dimensions are insufficient: two 768-dimensional models can define different spaces. Rebuild the index after changing models rather than searching old documents with new representations. Filter tenant before ranking, then apply threshold and top-k. No match is a valid result.',
    ],
    walkthrough: [
      { title: 'Calculate one result by hand', paragraphs: ['For q=[1,0] and d=[1,1], the dot product is 1. The norms are 1 and sqrt(2), giving about 0.707. Multiplying d by ten leaves its direction unchanged. Compare this with the lexical baseline: shared words versus representation proximity. Evaluate any benefit on the same labeled questions.'], code: 'q=[1,0], d=[1,1]\ndot=1, norm(q)=1, norm(d)=sqrt(2)\ncosine=1/sqrt(2)≈0.707\nthreshold=0.8 → no match' },
      { title: 'Move to a real /api/embed request', paragraphs: ['Send a text array to an installed local embedding model and check returned count and dimensions. Keep model identity, corpus revision, and chunk settings with the index. Use truncate:false so an oversized passage is not silently cut. The workbench provides a testable adapter without automatic downloads or cloud fallback.'] },
    ],
    example: 'tenant filter → model/version check → dimension check\n→ finite nonzero vectors → cosine → threshold → stable top-k\nmodel mismatch → rebuild index, not guess',
    tasks: ['Compute cosine for finite nonzero vectors of matching dimensions.', 'Exclude other tenants and models before scoring. An invalid or zero query returns [].', 'Keep score >= threshold, sort by descending score then id, and return the first k ids.'],
    transfer: 'Run node ai_lessons/workbench/demo.mjs rag. With an installed embedding model, obtain real vectors using the local adapter and repeat retrieval. Never describe hand-authored vectors as learned embeddings.',
    pitfall: 'Vector proximity is a retrieval signal, not factual evidence or authorization.',
  }),
  entry('48-reviewed-memory', 'agent-os', {
    title: 'Память агента: что сохранять, когда пересматривать и удалять',
    theory: [
      'История текущего диалога, краткое резюме задачи и долговременные знания проекта решают разные задачи. История помогает продолжить разговор. Резюме переносит актуальные условия в новую сессию. Постоянная память хранит проверенные повторно используемые факты: например, команду тестов конкретного пакета. Ни один из этих слоёв не обновляет веса модели.',
      'У записи памяти нужны источник, область действия и срок пересмотра. Фраза «здесь всегда npm test» без пути и revision опасна: в другом пакете команда может не существовать. Ответ ассистента сначала попадает в кандидаты; человек или проверяемая процедура подтверждает факт. Ошибочная запись должна удаляться из выдачи, а не только получать пометку в длинном журнале.',
      'В упражнении выбираются approved, несекретные записи текущего scope с источником и expiresAt строго позже now. Время — условные числовые метки, не часы реального сервера. Поле sensitive уже размечено доверенной стороной; такая метка не заменяет DLP. Память не имеет права отменять действующий запрет, даже если когда-то публикация была разрешена.',
    ],
    walkthrough: [
      { title: 'Один факт от находки до удаления', paragraphs: ['Исполнитель находит в package.json команду test:unit. Он предлагает запись с путём и revision. Ревьюер сверяет файл и запускает команду. После принятия память используется только для этого проекта. Когда package.json меняется, запись возвращается на пересмотр; старый успешный запуск не доказывает актуальность сегодняшней команды.'], code: 'candidate → source check → approval → scoped retrieval\n→ source changed / TTL expired → revalidate or delete' },
      { title: 'Почему не стоит сохранять всё', paragraphs: ['Сырые логи часто содержат персональные данные, временные ошибки и неверные гипотезы. Храните минимальный вывод, а исходный артефакт — в подходящем защищённом месте с ограниченным сроком. Не добавляйте реальный ключ в память, чтобы агенту было «удобнее». В .agents используйте отдельный KNOWLEDGE-файл, не дописывайте каждый результат в AGENTS.md.'] },
    ],
    example: '{id:"tests", scope:"demo", fact:"npm run test:unit",\n source:"package.json@revision-7", approved:true, sensitive:false, expiresAt:20}\nnow=20 → expired, not current',
    tasks: ['Оставьте только текущий scope, approved: true, sensitive: false и непустой source.', 'expiresAt должен быть конечным числом строго больше now.', 'Возвращайте только id, fact и source; не переносите весь журнал в контекст.'],
    transfer: 'В своей учебной копии agent-os-example добавьте один проверенный факт с источником. Измените источник и убедитесь, что устаревшая запись больше не используется. Не меняйте рабочую .agents пользователя.',
    pitfall: 'Память — проверяемая подборка фактов, а не ещё один источник полномочий.',
  }, {
    title: 'Agent memory: what to keep, revalidate, and delete',
    theory: [
      'Conversation history, a task summary, and durable project knowledge serve different purposes. History continues a conversation. A summary carries current constraints into a fresh session. Durable memory holds reviewed reusable facts, such as one package’s test command. None of these updates model weights.',
      'A memory record needs provenance, scope, and a review deadline. “Always use npm test” without a path or revision is risky; another package may not have that command. A model suggestion starts as a candidate. A person or verifiable procedure confirms it. Remove invalid records from retrieval rather than merely noting their failure in a long log.',
      'Select approved, nonsensitive records for the current scope with a source and expiresAt strictly after now. Times are fictional numeric timestamps, not a server clock. A trusted caller supplies the sensitive label; it is not a DLP system. Memory must not override a current restriction because a past task once allowed publication.',
    ],
    walkthrough: [
      { title: 'One fact from discovery to retirement', paragraphs: ['A worker finds test:unit in package.json and proposes a record with path and revision. A reviewer checks the file and executes the command. Once accepted, use it only for that project. A changed package.json triggers revalidation; an older successful run does not establish today’s command.'], code: 'candidate → source check → approval → scoped retrieval\n→ source changed / TTL expired → revalidate or delete' },
      { title: 'Why saving everything is a poor default', paragraphs: ['Raw logs often contain private data, temporary failures, and false hypotheses. Keep a minimal conclusion and store original evidence in an appropriate protected location with retention limits. Never memorize a real key for convenience. In .agents, use a scoped KNOWLEDGE file rather than appending every run to AGENTS.md.'] },
    ],
    example: '{id:"tests", scope:"demo", fact:"npm run test:unit",\n source:"package.json@revision-7", approved:true, sensitive:false, expiresAt:20}\nnow=20 → expired, not current',
    tasks: ['Keep current scope, approved: true, sensitive: false, and a nonblank source.', 'Require finite expiresAt strictly greater than now.', 'Return only id, fact, and source, not the entire log.'],
    transfer: 'Add one reviewed sourced fact to your disposable agent-os-example. Change its source and check that the stale record is no longer used. Do not edit the user’s working .agents.',
    pitfall: 'Memory is reviewed knowledge, not an additional authority channel.',
  }),
  entry('49-sft-labels', 'model-training', {
    title: 'Подготовить SFT-пример: роли, padding и маска loss',
    theory: [
      'SFT обучает модель на парах контекста и желаемого продолжения. В conversational-датасете храните роли и содержимое сообщений, а не случайно склеенную строку. Chat template конкретного токенизатора добавляет границы ролей и окончания. Одинаковое человеческое чтение не означает одинаковую последовательность token id. Проверьте результат на одном примере до запуска всей выборки.',
      'В causal language modeling модель предсказывает следующий токен. Метки labels обычно совпадают с input_ids по позиции, а сдвиг выполняется внутри соответствующего model/trainer. Не сдвигайте второй раз. Если обучаем только ответ ассистента, позиции пользователя и padding получают ignore index -100. Attention mask и маска loss различаются: первую модель использует при обработке последовательности, вторая определяет вклад в ошибку.',
      'В упражнении токенизация уже дана: ids, assistantMask и attentionMask — массивы одной длины. Сохраните id только там, где обе маски равны 1; остальные замените -100. Если не осталось ни одной обучаемой позиции, пример отклоняется. Это помогает поймать обрезанный ответ, но не доказывает корректность chat template: маску нужно дополнительно сверить с декодированным текстом и окончанием реплики.',
    ],
    walkthrough: [
      { title: 'Разбор шести позиций', paragraphs: ['Первые два id представляют ввод пользователя, следующие два — ответ, 99 — условное окончание ответа, 0 — padding. Имена вымышлены: настоящий EOS/end-of-turn возьмите из своего токенизатора. Нельзя маскировать окончание только потому, что это не обычное слово: иначе модель может плохо учиться завершать реплику.'], code: 'ids:           [11, 12, 21, 22, 99, 0]\nassistantMask: [ 0,  0,  1,  1,  1, 0]\nattentionMask: [ 1,  1,  1,  1,  1, 0]\nlabels:       [-100,-100,21,22,99,-100]' },
      { title: 'Что проверить перед первым batch', paragraphs: ['Выведите декодированные input_ids и только немаскированные labels. Сверьте, что нет пользовательских секретов, границы ролей корректны, ответ не обрезан и есть хотя бы одна метка. Для assistant_only_loss используйте поддерживающий маску chat template и проверьте её фактически. API и поддержка зависят от версии TRL: сохраните версии окружения и не угадывайте по названию параметра.'] },
    ],
    example: 'assistant-only loss ≠ attention mask\npadding is never a target\nno unmasked target → reject sample\ninspect one decoded sample before training',
    tasks: ['Проверьте массивы и одинаковую длину; ids целочисленные, маски состоят строго из 0 и 1.', 'Постройте labels без дополнительного causal shift: id при двух единицах, иначе -100.', 'Верните { valid: true, labels } только при наличии обучаемых позиций; иначе { valid: false }.'],
    transfer: 'Запустите node ai_lessons/workbench/demo.mjs training для расчёта ошибки и шага обновления. Затем по FINETUNING.md отдельно подготовьте и декодируйте один SFT-пример своим токенизатором. CPU-арифметика не является дообученной LLM.',
    pitfall: 'Низкий loss ничего не значит, если оптимизатор учится не на тех позициях.',
  }, {
    title: 'Build an SFT example: roles, padding, and the loss mask',
    theory: [
      'SFT trains on context paired with a desired continuation. Store conversational roles and message content instead of arbitrarily joining strings. A tokenizer-specific chat template adds role and turn boundaries. Human-readable similarity does not imply identical token ids. Inspect one transformed sample before processing the dataset.',
      'Causal language modeling predicts the next token. Labels commonly align with input_ids, with shifting handled by the corresponding model or trainer. Do not shift twice. For assistant-only supervision, user positions and padding use the ignore index -100. Attention masks and loss masks differ: one controls sequence processing; the other determines contribution to error.',
      'The lab supplies tokenized ids, assistantMask, and attentionMask of equal length. Keep an id only where both masks are 1; use -100 elsewhere. Reject a sample with no supervised positions. This catches a truncated-away answer, but does not verify the template: compare masks with decoded text and the response ending separately.',
    ],
    walkthrough: [
      { title: 'Inspect all six positions', paragraphs: ['The first two ids represent user input, the next two the answer, 99 a fictional response terminator, and zero padding. Actual EOS or end-of-turn tokens come from your tokenizer. Do not mask the terminator merely because it is not an ordinary word; the model needs to learn when to finish.'], code: 'ids:           [11, 12, 21, 22, 99, 0]\nassistantMask: [ 0,  0,  1,  1,  1, 0]\nattentionMask: [ 1,  1,  1,  1,  1, 0]\nlabels:       [-100,-100,21,22,99,-100]' },
      { title: 'Check before the first batch', paragraphs: ['Decode input_ids and the unmasked targets. Verify privacy, role boundaries, a nontruncated answer, and at least one target. assistant_only_loss needs a template that actually provides the mask. TRL support depends on the installed version: preserve environment versions and inspect behavior rather than trusting a parameter name.'] },
    ],
    example: 'assistant-only loss ≠ attention mask\npadding is never a target\nno unmasked target → reject sample\ninspect one decoded sample before training',
    tasks: ['Validate arrays and equal lengths; ids are integers and masks contain strictly 0 or 1.', 'Build labels without an extra causal shift: keep id where both masks are one, otherwise -100.', 'Return { valid: true, labels } only with supervised positions, otherwise { valid: false }.'],
    transfer: 'Run node ai_lessons/workbench/demo.mjs training to calculate loss and a weight update. Separately use FINETUNING.md to prepare and decode one SFT sample with your tokenizer. CPU arithmetic is not a fine-tuned LLM.',
    pitfall: 'Low loss is meaningless if the optimizer learns the wrong positions.',
  }),
  entry('50-serving-rollout', 'model-release', {
    title: 'Локальный сервис модели: очередь, совместимость и безопасное переключение',
    theory: [
      'Запуск модели из терминала и сервис для приложения — разные результаты. Сервису нужны контракт запроса, лимиты размера и времени, обработка недоступности и понятная версия ответа. Не принимайте произвольный путь к модели от клиента. В учебном маршруте сервер остаётся на loopback; подключение к интернету требует отдельного решения по аутентификации и эксплуатации.',
      'При нескольких запросах ограничьте конкурентность. Очередь тоже должна иметь предел: иначе процесс жив, а пользователь ждёт бесконечно. Отмена прекращает ожидание и, где runtime позволяет, вычисление; timeout не гарантирует остановку на сервере. Различайте health процесса, readiness конкретной модели и успешный тестовый inference. После холодной загрузки задержка может существенно отличаться.',
      'Новая версия выпускается отдельно от активной. Перед переключением нужны совместимые схема и embedding-пространство, проверки качества, отказов и доступный откат. Смена embedding-модели требует согласованного нового индекса; простой переключатель из этого упражнения намеренно блокирует такую миграцию. Он выбирает версию в объекте, а не меняет production-сервер.',
    ],
    walkthrough: [
      { title: 'Что входит в одну версию', paragraphs: ['Для RAG храните вместе модель генерации, embedding-модель, revision документов, chunk-настройки, индекс и шаблон запроса. Для классификатора — веса, словарь, предобработку и порог. Возврат только файла весов может оставить несовместимый словарь и тихо испортить ответы.'], code: 'release-v2/\n  manifest.json\n  model artifact\n  preprocessing + vocabulary OR embedding index\n  evaluation report\nactive pointer → release-v1 until v2 passes' },
      { title: 'Приёмка не заканчивается healthcheck', paragraphs: ['Выполните обычный запрос, недопустимый вход, timeout и запрос неизвестной версии. Сравните качество с baseline на тех же данных. Затем в учебной копии переключите указатель на кандидата и верните прежний пакет. Сохраните причины отказа в выпуске. Установка «готово» в JSON не заменяет эту процедуру.'] },
    ],
    example: 'health=true, quality=false → keep v1\nnew embedding model with old index → keep v1\ncompatible + evaluated + failure checks + rollback → v2',
    tasks: ['Проверьте совпадение schema и embeddingModel с active.', 'Требуйте строго true для health, qualityPassed, failureChecksPassed и rollbackAvailable.', 'Верните выбранную version и switched; при любом отказе оставьте active.'],
    transfer: 'В CPU-маршруте проверьте /health и /predict по ADVANCED_ACCEPTANCE.md, затем повторите ошибочный запрос и reload артефакта. Для LLM отдельно измерьте прогретый inference и проверьте конфигурацию клиента без публичного открытия порта.',
    pitfall: 'Живой процесс не обязательно готов обслуживать нужную модель с нужным качеством.',
  }, {
    title: 'Serve a local model: queues, compatibility, and safe switching',
    theory: [
      'Running a model in a terminal differs from serving an application. A service needs request contracts, size and time limits, unavailable states, and a response version. Never accept arbitrary model paths from clients. Keep the learning service on loopback; public exposure needs a separate authentication and operations decision.',
      'Bound concurrency for multiple requests. Bound the queue too; a process can stay alive while a user waits indefinitely. Cancellation stops waiting and, where supported, computation; a timeout does not prove the server stopped. Distinguish process health, readiness of the requested model, and a successful inference. Cold loading can substantially change latency.',
      'Prepare a candidate independently from the active version. Switching requires compatible schemas and embedding spaces, quality and failure checks, and a recovery version. Changing the embedding model needs a coordinated index migration; this simple gate deliberately blocks it. The exercise selects a version in an object rather than operating a production server.',
    ],
    walkthrough: [
      { title: 'What belongs in one release?', paragraphs: ['For RAG, keep the generation model, embedding model, document revision, chunk settings, index, and prompt template together. For a classifier, keep weights, vocabulary, preprocessing, and threshold. Restoring weights alone can leave an incompatible vocabulary and silently corrupt predictions.'], code: 'release-v2/\n  manifest.json\n  model artifact\n  preprocessing + vocabulary OR embedding index\n  evaluation report\nactive pointer → release-v1 until v2 passes' },
      { title: 'Acceptance goes beyond a healthcheck', paragraphs: ['Test an ordinary request, invalid input, timeout, and unknown version. Compare quality on the same baseline set. In a disposable setup, switch to the candidate and back to the previous package. Preserve release rejection reasons. Marking JSON “ready” cannot replace this procedure.'] },
    ],
    example: 'health=true, quality=false → keep v1\nnew embedding model with old index → keep v1\ncompatible + evaluated + failure checks + rollback → v2',
    tasks: ['Require schema and embeddingModel to match active.', 'Require strict true for health, qualityPassed, failureChecksPassed, and rollbackAvailable.', 'Return the selected version and switched; preserve active on any failure.'],
    transfer: 'On the CPU path, check /health and /predict using ADVANCED_ACCEPTANCE.md, then reproduce an invalid request and artifact reload. For an LLM, separately measure warm inference and verify client settings without exposing a public port.',
    pitfall: 'A living process may not be ready to serve the right model at acceptable quality.',
  }),
];
