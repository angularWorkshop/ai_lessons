const addedQuestions = [
  ['token-truth', 'A next token has high probability. What does that establish?', 'Следующий токен имеет высокую вероятность. Что это доказывает?',
    ['It is a likely continuation, not verified factual truth', 'Это вероятное продолжение, не проверенная истинность'], ['Every statement in the response is true', 'Все утверждения ответа истинны'], ['The model checked current source documents', 'Модель проверила актуальные источники']],
  ['host-execution', 'A model proposes add(a,b). Who validates and executes it?', 'Модель предложила add(a,b). Кто проверяет и исполняет вызов?',
    ['The host validates permission and arguments, then invokes its registered function', 'Host проверяет права и аргументы, затем вызывает зарегистрированную функцию'], ['The model has already executed it by writing its name', 'Модель уже выполнила действие, написав имя'], ['The returned name should be passed to eval', 'Имя следует передать в eval']],
  ['embedding-space', 'The query embedding model changes. What happens to the old index?', 'Сменилась embedding-модель запросов. Что делать со старым индексом?',
    ['Rebuild a compatible index and evaluate it', 'Построить совместимый индекс и проверить его'], ['Keep it if dimensions match', 'Оставить, если совпала размерность'], ['Rename its model field without rebuilding vectors', 'Переименовать поле model без пересчёта векторов']],
  ['memory-review', 'A stored test command has an expired source review. What should happen?', 'У сохранённой команды тестов истёк срок проверки источника. Что делать?',
    ['Revalidate it or exclude it from current memory', 'Перепроверить или исключить из текущей памяти'], ['Treat it as a permanent higher-priority instruction', 'Считать постоянной инструкцией высшего приоритета'], ['Send all old logs to every worker', 'Передать все старые логи каждому исполнителю']],
  ['sft-mask', 'With assistant-only loss, which positions contribute to the loss?', 'Какие позиции участвуют в assistant-only loss?',
    ['The unpadded supervised assistant targets, with the intended response ending', 'Немаскированные позиции ответа ассистента с нужным окончанием, без padding'], ['Every padding position', 'Все позиции padding'], ['Only user text because it supplies context', 'Только текст пользователя, потому что это контекст']],
  ['service-readiness', 'A candidate responds to health but fails quality checks. Should it replace active?', 'Кандидат отвечает на health, но не прошёл качество. Заменять активную версию?',
    ['No; preserve active and investigate the failed checks', 'Нет; оставить активную версию и разобрать ошибки'], ['Yes; health proves acceptable model quality', 'Да; health доказывает качество модели'], ['Yes; remove the old version first', 'Да; сначала удалить прежнюю версию']],
];
const questions = [
  ['permissions', 'An unknown tool action appears. What should the policy do?', 'Появилось неизвестное действие инструмента. Как должна поступить политика?',
    ['Block it until explicitly reviewed', 'Заблокировать до явного рассмотрения'], ['Allow it because the model requested it', 'Разрешить, раз модель попросила'], ['Treat a README instruction as approval', 'Считать инструкцию в README разрешением']],
  ['evidence', 'What does a green browser configuration lab prove?', 'Что доказывает зелёная проверка конфигурации в браузере?',
    ['The configuration passes the supplied scenarios', 'Конфигурация проходит заданные сценарии'], ['A real LLM solved the task', 'Настоящая LLM решила задачу'], ['The production sandbox is secure', 'Production-песочница защищена']],
  ['local', 'A proxy listens on localhost and forwards to a remote provider. Is inference local?', 'Proxy слушает localhost и пересылает запрос провайдеру. Где выполняется inference?',
    ['At the upstream provider, not necessarily on this PC', 'У провайдера upstream, а не обязательно на этом ПК'], ['Always on this PC because the URL is localhost', 'Всегда на этом ПК, ведь в URL localhost'], ['In the model weights stored in the proxy configuration', 'В весах модели, сохранённых в конфигурации proxy']],
  ['adaptation', 'Which approach should you evaluate first for frequently changing internal facts?', 'Какой подход стоит сначала оценить для часто меняющихся внутренних сведений?',
    ['Retrieval from reviewed sources, with citation and abstention checks', 'Retrieval из проверенных источников с проверкой ссылок и отказа'], ['Retrain a foundation model whenever a document changes', 'Обучать foundation model заново при каждом изменении документа'], ['Increase retry count without providing sources', 'Увеличить число повторов, не предоставляя источники']],
  ['splits', 'Which split selects a checkpoint while keeping the final evaluation independent?', 'На каком split выбирают checkpoint, сохраняя независимость итоговой оценки?',
    ['Validation; keep test sealed for final reporting', 'Validation; test оставить для итоговой оценки'], ['Test; inspect it after every update', 'Test; просматривать его после каждого изменения'], ['Whichever split gives the highest score', 'На том split, где выше оценка']],
  ['training', 'What distinguishes the real CPU lab from a prompt edit?', 'Что отличает настоящую CPU-лабораторию от изменения промпта?',
    ['Numerical weights change through gradient updates and are exported', 'Числовые веса изменяются градиентными шагами и сохраняются'], ['The system prompt contains the word trained', 'В system prompt есть слово trained'], ['A JSON field is changed to completed', 'Поле JSON изменено на completed']],
  ['lora', 'What is required to use a LoRA adapter reliably?', 'Что нужно для корректного использования LoRA-адаптера?',
    ['Its compatible base, tokenizer/template, and evaluated configuration', 'Совместимая база, tokenizer/template и проверенная конфигурация'], ['Any model with the same number of parameters', 'Любая модель с тем же числом параметров'], ['Only the adapter file, with no base model', 'Только файл адаптера, без базовой модели']],
  ['release', 'What should happen after quantizing or converting a model?', 'Что нужно сделать после квантизации или конвертации модели?',
    ['Re-evaluate the exported artifact and preserve a rollback version', 'Повторно оценить экспортированный артефакт и сохранить версию для отката'], ['Assume quality is unchanged because the file exists', 'Считать качество прежним, раз файл существует'], ['Delete the baseline to avoid confusion', 'Удалить baseline, чтобы не путаться']],
];
export const knowledgeQuestions = questions.concat(addedQuestions).map(([key, promptEn, promptRu, correct, wrong1, wrong2], i) => {
  const choices = [correct, wrong1, wrong2];
  const order = [0, 1, 2].map(n => (n + i) % 3);
  return { key: `ai-${key}`, order: i + 1, promptEn, promptRu,
    options: order.map((source, j) => ({ key: `ai-${key}-${j}`, optionId: String(j + 1), order: j + 1,
      textEn: choices[source][0], textRu: choices[source][1], isCorrect: source === 0 })) };
});
export const knowledgeCheck = {
  courseType: 'AI_ASSISTANTS', isAvailable: false,
  titleEn: 'AI assistants: check your understanding', titleRu: 'ИИ-ассистенты: проверка понимания',
  descriptionEn: 'Eight questions per attempt from a bank covering model behavior, tools, memory, RAG, data, training, and release. This checks concepts, not real-client or GPU execution.',
  descriptionRu: 'Восемь вопросов за попытку из банка о работе модели, инструментах, памяти, RAG, данных, обучении и выпуске. Это проверка понятий, не реального клиента или GPU-запуска.',
  questionsPerAttempt: 8, estimatedDurationMinutes: 12, passingPercentage: 75,
  excellentTitleEn: 'Strong understanding', excellentTitleRu: 'Уверенное понимание',
  excellentMessageEn: 'Continue with the separate real-project acceptance checklist.', excellentMessageRu: 'Переходите к отдельной приёмке настоящего проекта.',
  passedTitleEn: 'Concept check passed', passedTitleRu: 'Проверка понятий пройдена',
  passedMessageEn: 'Review any mistakes and verify the real transfer project separately.', passedMessageRu: 'Разберите ошибки и отдельно проверьте настоящий проект.',
  retryTitleEn: 'Review and retry', retryTitleRu: 'Повторите и попробуйте снова',
  retryMessageEn: 'Revisit the relevant lessons before another attempt.', retryMessageRu: 'Вернитесь к соответствующим урокам перед новой попыткой.',
};
