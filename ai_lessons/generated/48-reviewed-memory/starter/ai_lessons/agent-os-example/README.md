# Agent OS Example / Пример агентной ОС

RU: Это изолированная учебная копия идеи `.agents`: одна точка входа, workflow,
роль, навык, профиль и проверенные знания. Это не настройка Windows/Linux и не
обучение весов. Реальная `.agents` пользователя не читается и не изменяется.

EN: This isolated example uses the `.agents` architecture: one entry point,
workflow, role, skill, project profile, and reviewed knowledge. It is neither an
operating-system configuration nor weight training. It does not read or change
the user's real `.agents` folder.

From the workspace root / Из корня workshop:

```sh
node ai_lessons/agent-os-example/doctor.mjs
```

RU: Doctor проверяет файлы и профиль, но не исполняет команды и не доказывает,
что ассистент действительно соблюдает правила. Скопируйте capstone-project в
отдельную папку и выполните workflow там. Корневой адаптер выбранного клиента
должен ссылаться на эту точку входа; проверьте, что клиент её прочёл. Защита
файлов, инструментов и сети настраивается отдельно в клиенте. Нельзя заменять
настоящие разрешения текстом «никогда не делай».

EN: The doctor checks files and the profile, not command execution or whether an
assistant obeys instructions. Copy capstone-project into a separate folder and
exercise the workflow there. Point your client's project adapter to this entry
point and verify that it was loaded. Configure file, tool, and network access
separately in the client; a written rule is not a security boundary.

RU: Настоящий `.agents/PLUGINS/model-router` может слушать localhost, но передавать
запрос провайдеру. Такой proxy не означает локальный inference. Для урока о локальном роутинге
явно проверьте upstream; при сомнении блокируйте, а не подставляйте облако.

EN: The real `.agents/PLUGINS/model-router` may listen on localhost and still
forward requests to a provider. Such a proxy is not local inference. Check the
upstream explicitly in the local-routing lesson; block rather than silently fall back to cloud.
