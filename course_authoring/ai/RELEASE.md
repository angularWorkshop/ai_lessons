# Practical AI: published completeness revision

Production release: 20261023-ai-complete-04, verified 2026-10-23.

50 bilingual lessons in 14 sections: 26 policy/configuration labs and 24 executable JavaScript labs. Six new lessons and substantive additions to 21 existing topics. All 44 previous exercise/topic IDs are preserved; 100 starter/answer branches are published without force pushes.

Validation: all 50 starter/answer pairs, 215 exercise scenarios, identical tests, and copying the answer into the starter; 290/290 source tests; 1/1 real MCP SDK stdio integration; 4/4 real CPU-training/export/HTTP tests; frontend 59/59 and landing 5/5 tests; production builds and lint. The landing lint retains one existing max-lines warning.

API verification compared RU/EN theory and practice for all 50 lessons, ordering in all 14 sections, and the 14-question bank. Public site markers and translation chunks match the deployed build; private lessons still deny guest access. Frontend a563bbc and landing 13216aa were deployed directly over SSH with rollback backups; backend and database containers were not redeployed.

Worked systems include an actual bounded tool dispatcher, evidence retrieval and abstention, numerical gradient/LoRA matrix calculations, and an optional real MCP server/client package. Default exercises remain dependency-free; the MCP package requires its own npm ci. No personal .agents, credentials, or model weights are shipped.

Limits: the workbench's default model provider and hand-authored vectors are explicitly educational fixtures. Live local LLM inference, GUI-client compatibility, GPU/QLoRA training, and hardware capacity remain separate learner-side acceptance. Passing the browser exercise is not proof of those hardware-dependent outcomes. This is an applied assistant/adaptation course, not a complete ML degree.
