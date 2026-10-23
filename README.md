# Parallel work without file conflicts

Edit `src/scheduler.json`. Do not change the tests or runtime.

## English
- Set onConflict: serialize and maxWorkers: 2.
- Check equal files and directory/file overlap.
- Three independent tasks must queue; a traversal path must return invalid.

## Русский
- Установите onConflict: serialize и maxWorkers: 2.
- Проверьте одинаковые файлы и пересечение каталога с файлом.
- Три независимые задачи должны попасть в queue; путь с обходом каталога должен дать invalid.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Plan two independent tasks with explicit file owners. If using worktrees, create them only in a learning repository and run combined checks after integration.

Нарисуйте план двух независимых задач с владельцами файлов. Если используете worktree, создавайте отдельные копии только в учебном репозитории; после слияния повторите общую проверку.
