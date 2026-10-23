# AI course release boundary

Status: local draft, not published. Proposed course type: `AI_ASSISTANTS`; proposed path: `/ai` in the existing course application, not a new subdomain.

## Prepared

- 13 sections, 26 ordered topics, one configuration assignment per topic, plus real transfer projects.
- Original RU/EN theory, examples, practice requirements, and transfer exercises.
- Separate nonempty `content` and `stackBlitzContent` fields using the existing HTML classes.
- 52 standalone starter/answer projects; identical tests; no dependency installation or API key needed for configuration checks.
- Local interactive preview, bounded educational orchestrator, real-client acceptance pack.
- Sanitized agent-OS example, real standard-library CPU training/export/HTTP inference, loopback-only Ollama smoke, and optional unexecuted GPU LoRA guide. No model weights were downloaded.

## Before a platform release

1. Assign a real lesson repository. Materialize the generated projects into matching starter/answer branches. Verify each remote branch before writing exercise URLs. Do not use invented GitHub URLs or replace another course's links.
2. Add the proposed type to the backend Prisma enum with an additive migration; generate the client and test DTOs, filtering, progress, and AI access. This authoring package deliberately does not change the production schema.
3. Add `/ai` to the frontend enum/slug/theme/catalog maps, profile labels, translations, and SSR routes. Use a distinct teal accent within the existing design language. Add landing promotion only once the course can actually be opened.
4. Decide and document entitlement treatment. Base/Standard currently select frameworks; do not repurpose that selector or rewrite existing subscriber grants. No price, stored entitlement, or access rule was changed by this draft.
5. Import sections/topics/exercises in curriculum order with explicit RU/EN verification and backups. API create DTOs do not expose order in the inspected code, so verify the returned order and use the existing reorder operation rather than assuming the authoring manifest is a POST payload.
6. Verify guest previews, denied private access, ordinary subscribed USERs, and ADMIN. Verify assistant access before content reads/model calls. Do not use ADMIN alone to claim subscription coverage.
7. Open starter and answer in StackBlitz in a real embedded session. The Node checks here prove local projects, not WebContainer/browser availability. Verify initial load, checks after save, and completed status without weakening tests.
8. Perform real-assistant transfer and course-content review, then stage and release with a rollback. Do not mark the course published solely because `verify.mjs` passed.

## Assistant changes prepared in app repositories

The existing tutor now receives both theory and practice with a bounded context allocation. Reference content and old summaries are not inserted into system instructions. The tutor policy asks for one hint, preserves response language, avoids unsupported test/editor claims, and never grants tools. A third RU/EN quick prompt requests one small hint. Course authorization and subscription enforcement are unchanged.

These are local source changes only. No production deployment or external model call was performed for this request.
