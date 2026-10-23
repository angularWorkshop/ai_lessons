# LLM Specialization / Дообучение под задачу

## RU: Preflight

Урок «LoRA и QLoRA» — дополнительный GPU-маршрут. JSON-проверка выявляет ошибки плана, но не
обучает LLM. Если нет подходящего железа, выполните TRAINING.md и отметьте LoRA
как NOT EXECUTED. Ни пакеты, ни веса в рамках проверки курса не устанавливаются.

Сначала решите, нужно ли обучение: формат ответа часто исправляется prompt;
актуальные внутренние сведения — retrieval с проверкой источника; устойчивое поведение
можно сравнить с SFT. RAG не меняет веса и не гарантирует достоверность сам по себе.
Обучение foundation model с нуля — отдельный дорогой исследовательский проект.

Для эксперимента подготовьте:

- точную базу/revision, разрешённую лицензию, tokenizer и согласованный chat template;
- размеченные данные с provenance и удалёнными секретами/PII;
- group-disjoint train/validation и закрытый test, baseline до обучения;
- проверенный PyTorch backend/драйвер и запас памяти; небольшой sequence length/batch;
- отдельное venv, версии torch/transformers/datasets/peft/trl/accelerate и pip freeze;
- бюджет времени, stop rule и неизменяемый каталог исходной базы.

Пример **плана кода**, который требует адаптации и проверки на выбранной архитектуре.
MODEL_DIR — локальный каталог уже полученной и проверенной базы, не repo ID.
Локальные train.jsonl и validation.jsonl содержат поле text с текстом, заранее
сформированным через **тот же** chat template; шаблон не применяется второй раз.
В этой короткой демонстрации loss считается на всём тексте, а не только ответе.

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

MODEL_DIR = "./reviewed-base"
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True,
                                         trust_remote_code=False)
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, local_files_only=True,
                                           trust_remote_code=False)
data = load_dataset("json", data_files={"train": "train.jsonl",
                                       "validation": "validation.jsonl"})
config = SFTConfig(output_dir="./adapter-run", max_length=256,
    num_train_epochs=1, per_device_train_batch_size=1,
    per_device_eval_batch_size=1, gradient_accumulation_steps=4,
    learning_rate=1e-4, eval_strategy="epoch", save_strategy="epoch",
    load_best_model_at_end=True, metric_for_best_model="eval_loss",
    greater_is_better=False, report_to="none", push_to_hub=False)
trainer = SFTTrainer(model=model, args=config, processing_class=tokenizer,
    train_dataset=data["train"], eval_dataset=data["validation"],
    peft_config=LoraConfig(r=8, lora_alpha=16, target_modules="all-linear",
                           task_type="CAUSAL_LM"))
trainer.model.print_trainable_parameters()
trainer.train()
trainer.save_model("./reviewed-adapter")
tokenizer.save_pretrained("./reviewed-adapter")
```

До запуска убедитесь, что pad/EOS и template корректны, target_modules существуют,
есть ненулевые trainable параметры и база заморожена. Это пример обычной LoRA,
не QLoRA и не обещание, что модель поместится на любой GPU. Проверьте API по
документации **установленной** версии; этот GPU-пример здесь не запускался.

QLoRA дополнительно требует поддерживаемого 4-bit backend: сначала загрузка
квантизированной базы, затем prepare_model_for_kbit_training, потом LoRA. Не
приписывайте 4-bit optimizer/активациям и не обучайте случайно всю базу. Сравните
base и base+adapter на одинаковом закрытом наборе, включая отказы и формат ответа.

Сохраните base revision, tokenizer hash/template, data fingerprint, версии,
параметры, seed, validation checkpoint, метрики, latency и peak memory. Адаптер
не является полной моделью: для inference нужна совместимая база. Перед GGUF
конвертацией/merge проверьте поддержку архитектуры и повторите оценку после
квантизации. Никогда не объявляйте «готово» только потому, что файл сохранился.

## EN

This optional GPU route is separate from the verified standard-library CPU lab.
It has not been executed here. If hardware is unavailable, complete TRAINING.md
and label LoRA NOT EXECUTED rather than claiming success from a JSON check.

Choose prompt, retrieval, or weight adaptation based on the actual need. Review
model/data rights, remove private data, separate source groups, and record a baseline.
Prepare a compatible backend, isolated environment, exact versions, and memory/time
budget. The example uses a reviewed local base and local text datasets, not an
automatic model download; review its template, padding/EOS, and target modules first.

The example is ordinary LoRA. QLoRA additionally needs a supported quantization
backend and k-bit preparation before adapters. Check nonzero trainable parameters
and a frozen base. Select using validation, evaluate once on sealed holdout, and
compare behavior and resource costs with the baseline. Preserve exact base/tokenizer,
data fingerprint, training settings, checkpoint, and rollback. Re-evaluate after export.

## Sources

- [TRL SFTTrainer and SFTConfig](https://huggingface.co/docs/trl/sft_trainer)
- [PEFT quantization and k-bit preparation](https://huggingface.co/docs/peft/developer_guides/quantization)
