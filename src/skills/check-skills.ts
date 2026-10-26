// Проверка скиллов проекта: npm run check-skills [папка]
// Модель не нужна: читаем каждый skills/*/SKILL.md, проверяем формат и считаем, что и когда попадёт в контекст.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSkill, SkillError, type Skill } from './skill.ts';

const root = resolve(process.argv[2] ?? 'skills');
const dirs = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
  .map((entry) => join(root, entry.name))
  .sort();

const skills: Skill[] = [];
let failed = 0;
for (const dir of dirs) {
  try {
    const skill = parseSkill(readFileSync(join(dir, 'SKILL.md'), 'utf8'), dir);
    skills.push(skill);
    console.log(`✓ ${skill.name}: описание ${skill.description.length} симв., тело ${skill.body.split('\n').length} строк`);
  } catch (error) {
    failed++;
    console.log(`✗ ${error instanceof SkillError ? error.message : String(error)}`);
  }
}

// Progressive disclosure в цифрах: имя и описание — в каждом запросе, тело — только после загрузки.
const always = skills.reduce((sum, skill) => sum + skill.name.length + skill.description.length + 4, 0);
const onDemand = skills.reduce((sum, skill) => sum + skill.body.length, 0);
console.log(`\nскиллов: ${skills.length}, с ошибками: ${failed}`);
console.log(`в каждом запросе: ~${always} симв. (имена и описания)`);
console.log(`по запросу: ~${onDemand} симв. (тела)`);
process.exitCode = failed > 0 ? 1 : 0;
