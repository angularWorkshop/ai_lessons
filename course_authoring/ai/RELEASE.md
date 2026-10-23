# AI course release boundary

Release: `20261023-ai-course-01`. Course type: `AI_ASSISTANTS`; path: `/ai` in the existing application, not a new subdomain. The production API contains 13 sections, 26 topics/exercises, and an eight-question bilingual knowledge check. All 52 practice branches are published in the public [course repository](https://github.com/angularWorkshop/ai_lessons).

The machine-readable `publication.json` records the exact API IDs, URLs, and readiness state. Frontend/landing deployment and real browser verification must pass before `ready` is set to `true`.

## Prepared

- 13 sections, 26 ordered topics, one configuration assignment per topic, plus real transfer projects.
- Original RU/EN theory, examples, practice requirements, and transfer exercises.
- Separate nonempty `content` and `stackBlitzContent` fields using the existing HTML classes.
- 52 standalone starter/answer projects; identical tests; no dependency installation or API key needed for configuration checks.
- Local interactive preview, bounded educational orchestrator, real-client acceptance pack.
- Sanitized agent-OS example, real standard-library CPU training/export/HTTP inference, loopback-only Ollama smoke, and optional unexecuted GPU LoRA guide. No model weights were downloaded.

## Before a platform release

1. Assign a real lesson repository. Materialize the generated projects into matching starter/answer branches. Verify each remote branch before writing exercise URLs. Do not use invented GitHub URLs or replace another course's links.
2. Register the type through an additive Prisma enum migration. Back up the database, preserve existing migrations, and restart only the API, not PostgreSQL.
3. Add `/ai` to the frontend enum/slug/theme/catalog maps, profile labels, translations, and SSR routes. Use a distinct teal accent within the existing design language. Add landing promotion only once the course can actually be opened.
4. Preserve Base/Standard framework selection. Active PRO/LIFETIME includes the complete course, including future all-course releases; ADMIN is not constrained by historical selectedCourses. The first lesson is a public preview. Do not rewrite users' stored grants, roles, dates, or progress.
5. Import sections/topics/exercises in curriculum order with explicit RU/EN verification and backups. API create DTOs do not expose order in the inspected code, so verify the returned order and use the existing reorder operation rather than assuming the authoring manifest is a POST payload.
6. Verify guest previews, denied private access, ordinary subscribed USERs, and ADMIN. Verify assistant access before content reads/model calls. Do not use ADMIN alone to claim subscription coverage.
7. Open starter and answer in StackBlitz in a real embedded session. The Node checks here prove local projects, not WebContainer/browser availability. Verify initial load, checks after save, and completed status without weakening tests.
8. Review course content and publish with a rollback. Do not claim real-assistant transfer, real local LLM inference, or GPU training solely because configuration checks pass. These have separate manual acceptance criteria.

## Assistant changes prepared in app repositories

The existing tutor now receives both theory and practice with a bounded context allocation. Reference content and old summaries are not inserted into system instructions. The tutor policy asks for one hint, preserves response language, avoids unsupported test/editor claims, and never grants tools. A third RU/EN quick prompt requests one small hint. Course authorization and subscription enforcement are unchanged.

The API tutor changes are included in backend commit `aab83ad`. No external tutor-model call was made during release verification; prompt-policy tests are not evidence of model quality.

## Verification Boundaries

- All 26 starters fail the intended assertions; all answers and copied answers pass identical tests across 122 scenarios.
- The real standard-library CPU classifier was trained, exported, reloaded, and served over loopback HTTP in tests. Its tiny synthetic holdout is not a real-world quality benchmark.
- Local LLM smoke checks were tested against a stub, not an installed model. No weights, paid API calls, or GPU LoRA/QLoRA jobs were run.
- Production GET-only checks confirm public lesson 1, private guest denial, and access to lessons 2 and 26 for the supplied ordinary PRO account and ADMIN.
- Base/Standard, expired subscriptions, PRO, and LIFETIME have isolated backend matrix coverage. No live Base/Standard USER credentials were supplied.
- Full release evidence and rollback locations remain in the private workspace report `reports/ai-production-release-2026-10-23`; database backups stay private on the server, outside this repository.
