# Тема 6.3 — Слэш-команды и headless-режим

Задание — в описании практики на платформе. Коротко:

1. Проверка запускается сама и перезапускается при каждом сохранении (`npm run start:dev`).
2. Допиши команды в `src/commands.ts` и `clear` в `src/conversation.ts`, затем `parseCli`, `exitCode`, `toResult` и `runHeadless` в `src/headless.ts` по шагам 1–4, пока не увидишь `ASSIGNMENT STATUS: COMPLETED`. Тесты прошлых тем должны остаться зелёными.
3. `npm run agent` — разговор с командами `/help`, `/clear`, `/cost`, `/exit`. `npm run -s agent -- -p "Сколько будет 17 * 23?" --json` — одна задача без человека, JSON в stdout.

Модель уже подключена: платформа сама кладёт в проект `.env` с адресом, ключом и моделью.
