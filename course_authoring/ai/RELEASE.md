# Practical AI release

Published on 2026-10-23: 44 RU/EN lessons in 14 sections. Release: 20261023-ai-depth-03. Course: https://courses.edutec.it.com/ai/home

- 26 existing exercise IDs retained; progress identity preserved. No deletion or recreation of old exercises.
- 18 new executable JavaScript labs, alongside 26 existing policy labs. All 88 starter/answer branches are public. Existing branches were fast-forwarded, never force-pushed.
- 185 supplied scenarios: starter fails, answer passes, copied answer passes identical tests for every pair.
- 237 source/runner tests and 4 real CPU training/inference tests pass.
- Frontend f8a152a and landing 9234d79 published by direct SSH. Backend, database container, subscriptions, and progress were not changed.
- Production API theory, practice, titles, links, and order match all 88 RU/EN lesson renderings. Public assets match the local builds.

## Honest boundaries

Browser policies are educational simulations. JavaScript labs execute real algorithms but do not call an LLM. The local CPU classifier really updates numerical weights; it is not a text-generating LLM. Local LLM and GPU LoRA/QLoRA transfer require separate hardware-dependent acceptance. No live GPU training, paid API call, or weight download was performed in this release.

See CODING_PRIMER.md before code labs. See LOCAL_MODELS.md, TRAINING.md, FINETUNING.md, and ADVANCED_ACCEPTANCE.md for actual local transfer. The private workspace .agents was not copied; the course includes only its sanitized architectural example.

Validation evidence is stored in the workspace reports/ai-course-depth-2026-10-23 directory, not in application assets.
