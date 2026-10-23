# Real CPU Training / Настоящее обучение на CPU

## RU

Урок 23 не требует GPU, PyTorch, ключей или облака. Нужен Python 3.10+ из
официального источника. Это **маленький классификатор**, не языковая модель и не
замена ассистенту. Задача: по тексту определить bugfix или docs. Все примеры вымышлены.

Из корня workshop:

```powershell
python --version
python -m unittest discover -s ai_lessons/local-training -v
python ai_lessons/local-training/train.py --output ai_lessons/local-training/model.json
python ai_lessons/local-training/serve.py --model ai_lessons/local-training/model.json
```

Если `python` не найден, выберите установленный интерпретатор. Не меняйте системный
PATH и не устанавливайте пакеты автоматически ради этой команды. Зависимостей нет.
Оставьте последний процесс работающим; во втором терминале:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://127.0.0.1:8765/predict -Method Post -ContentType application/json -Body '{"text":"fix crash in login"}'
```

Остановка сервера: Ctrl+C. Он слушает только 127.0.0.1, не имеет облачного fallback
и не предназначен для production. Не проксируйте его наружу. Он ограничивает длину
запроса и отклоняет браузерный Origin; это не полноценная система авторизации.

Разберите процесс по исходнику train.py:

1. load_dataset требует разрешённый источник и непустые train/validation/test.
   Одинаковые группы и нормализованный текст не должны пересекать границы split.
   При настоящих данных группируйте по пользователю/документу/времени, а не строке.
2. Словарь строится только по train. Текст превращается в бинарный bag-of-words.
   Неизвестные слова не получают весов. Нет понимания смысла, порядка слов и отрицаний.
3. Веса начинаются с нуля. Logistic regression вычисляет вероятность; cross-entropy
   измеряет ошибку, gradient descent обновляет веса и bias. Это реальное обучение.
4. Checkpoint выбирается по validation loss. Test используется для итоговой оценки,
   не для подбора параметров. Сравните с majority baseline, а не с обещанием «ИИ работает».
5. model.json содержит словарь, веса, bias, историю, выбранную эпоху, fingerprint данных
   и метрики. serve.py загружает этот же артефакт: переобучение для каждого запроса не нужно.

После запуска сравните первую и последнюю trainLoss, убедитесь, что веса не нулевые,
и воспроизведите prediction после загрузки JSON. Метрика на восьми простых тестовых
примерах может быть идеальной: она **не оценивает качество на реальных тикетах**.
Проверьте неоднозначный текст, пустой запрос, неверный JSON и неизвестные слова.
Добавляйте новые проверенные источники без загрязнения замороженного test.

Практический перенос: возьмите отдельную копию данных, улучшите признаки или данные,
выберите модель на validation и один раз оцените на заранее отложенном holdout.
Сохраните baseline и candidate под разными именами. Верните прежний артефакт и
повторите тот же запрос — это воспроизводимая проверка rollback.

## EN

Lesson 23 trains a small binary text classifier, **not an LLM**. It uses Python 3.10+
and the standard library only. Run the commands above from the workspace root.
The dataset is invented, with no customer or private data. No API or GPU is needed.

Inspect dataset validation, the train-only vocabulary, binary features, sigmoid,
cross-entropy, and gradient updates. Weights start at zero and actually change.
Select the checkpoint using validation loss; use the sealed test only for reporting.
The artifact stores weights, vocabulary, bias, history, fingerprint, and metrics.

The tests verify real learning, deterministic training, split leakage rejection,
absence of test data in the vocabulary/checkpoint choice, export/reload parity,
and actual loopback HTTP prediction. Stop the local server with Ctrl+C. Do not
expose this teaching server or mistake request limits for production authorization.

Tiny synthetic test accuracy is not evidence of real-world quality. Try ambiguous
inputs, unknown words, empty requests, and malformed JSON. In a disposable copy,
compare a candidate with a majority baseline, preserve both artifacts, and demonstrate
rollback. Change training data or features using validation feedback, not test tuning.
