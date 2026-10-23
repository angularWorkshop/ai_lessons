# Local Models / Модель на своём ПК

## RU

Этот маршрут относится к урокам о роутинге, выборе модели, локальном endpoint и выпуске. Сначала пройдите CPU-маршрут в
TRAINING.md, если пока не знаете, хватит ли памяти для LLM. Ни просмотр курса,
ни npm test не скачивают модель и не включают облачный API.

1. Запишите ОС, CPU, свободную RAM, GPU/VRAM, свободный диск и допустимую задержку.
   RAM и VRAM нельзя просто сложить. Бюджет inference: веса + KV-cache для выбранного
   контекста + память runtime + резерв. Для обучения нужны дополнительные активации,
   градиенты и optimizer state. Оценка — не гарантия: после запуска измерьте пик.
2. Выберите **конкретную ревизию** модели, проверьте источник, лицензию и chat template.
   Не запускайте чужой Python-код из весов. Не соглашайтесь на скачивание десятков
   гигабайт, пока не проверили объём и условия. Модель курса не привязана к бренду.
3. Установите runtime из официального источника. Ollama работает на Windows; его
   API обычно доступен на localhost:11434. Совместимость GPU проверяйте по текущей
   документации. Установка Ollama сама по себе ещё не означает наличие модели.
4. Выполните команды ниже с **уже установленным локальным** тегом из `ollama list`.
   Не используйте cloud-тег. Не устанавливайте OLLAMA_HOST в 0.0.0.0 и не открывайте
   порт в firewall. При отсутствии модели остановитесь и отдельно согласуйте загрузку.

```powershell
ollama --version
ollama list
# Замените installed-local-tag точным локальным именем из списка:
node ai_lessons/local-smoke.mjs --model installed-local-tag
```

Скрипт делает GET /api/tags и настоящий POST /api/chat с stream:false. Он не
выполняет pull, не отправляет секреты, не следует redirect и не переключается в
облако при ошибке. Успешный ответ содержит ready, точный tag и длину ответа;
сам текст не записывается в отчёт. Проверка HTTP не доказывает отсутствие cloud
upstream внутри настроенного runtime: это проверяется отдельно по конфигурации,
типу модели и сетевым наблюдениям. Localhost-proxy может работать через провайдера.

Если процесс недоступен — проверьте, запущен ли runtime и свободен ли порт. Если
модель не найдена — сравните точное имя, включая tag. При нехватке памяти уменьшите
контекст/размер или выберите CPU-маршрут; не отключайте безопасность и не добавляйте
скрытый fallback. Первый ответ может быть медленным из-за загрузки весов.

Для локального выпуска GGUF сначала проверьте совместимость архитектуры, подготовьте
и оцените файл, затем создайте Modelfile: `FROM /absolute/path/model.gguf` и выполните
`ollama create course-local -f Modelfile`. Импорт GGUF сам по себе не квантизует веса.
Повторите holdout после конвертации; храните прежнюю версию для rollback. Не выполняйте
push: в этом курсе публикация весов наружу не нужна.

## EN

Lessons 18–20 and 25 use this route. Use TRAINING.md first if your machine is not
ready for an LLM. Neither the reader nor npm test downloads weights or calls a paid API.

Record available RAM, GPU memory, disk, context length, and latency needs. Estimate
weights + KV cache + runtime overhead + reserve, then measure peak use. Training
has extra memory costs. Do not pool RAM and VRAM into one claimed capacity.

Choose an exact model revision and review its source, license, and template. Install
a runtime from its official source and check current hardware support. With Ollama
running, inspect `ollama list`, then run the smoke command above with an already
installed **local** tag. Do not use cloud tags, expose the port, or download large
weights without reviewing size and terms.

The script checks /api/tags, requests a real non-streaming /api/chat response, and
rejects remote origins, redirects, missing models, incomplete output, and HTTP errors.
It never pulls a model or silently falls back to cloud. An HTTP success alone cannot
prove that a runtime has no cloud upstream: inspect its configuration and network use.

On failure, inspect the process, port, exact tag, and memory. Reduce context or choose
the CPU route rather than relaxing security. For GGUF import, prepare a compatible
file first, reference it with FROM in a Modelfile, and create a local version. Import
is not automatic quantization. Re-evaluate exported weights and keep a rollback version.

## Sources

- [Ollama Windows](https://docs.ollama.com/windows)
- [Chat API](https://docs.ollama.com/api/chat)
- [Model import](https://docs.ollama.com/import)
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)
