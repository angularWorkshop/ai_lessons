# Edutec AI assistants

26 RU/EN lessons across 13 sections: assistant setup, agent OS, orchestration, local models, data, real CPU training, and optional LoRA/QLoRA.

Platform: https://courses.edutec.it.com/ai/home

See [release status and verification boundaries](course_authoring/ai/RELEASE.md) and the machine-readable [publication registry](course_authoring/ai/publication.json). API content and all 52 public practice branches are published; the registry records whether the complete interface release is verified.

Run `npm test --prefix ai_lessons` and `node course_authoring/ai/verify.mjs`. Preview: `node course_authoring/ai/preview-server.mjs`. See [lab instructions](ai_lessons/README.md).

Every topic has matching lesson/answer branches with identical checks. Automated configuration status and actual model/client acceptance are separate. No paid API or automatic model download is required for the Node labs. CPU training runs locally with Python 3.10+; the optional GPU guide was not executed during release verification.
