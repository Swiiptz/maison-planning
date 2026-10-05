import { readdir, readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { seedState } from '../app/services/seed.js';
import { validateState } from '../app/domain/planning.js';
async function files(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : `${dir}/${entry.name}`))).flat();
}
let count = 0;
for (const file of await files('app')) {
  if (!file.endsWith('.js')) continue;
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr);
  const text = await readFile(file, 'utf8');
  if (!file.startsWith('app/adapters/') && /(?:firebasejs|firebase\/|getFirestore\(|getAuth\()/.test(text)) throw new Error(`Dépendance Firebase hors de l’adaptateur : ${file}`);
  for (const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) await access(resolve(dirname(file), match[1]));
  count++;
}
const catalog = JSON.parse(await readFile('app/data/catalog.json', 'utf8'));
validateState(seedState(catalog, { demo: true }));
const html = await readFile('app/index.html', 'utf8');
for (const match of html.matchAll(/(?:href|src)="(\.\/[^"#]+)"/g)) await access(resolve('app', match[1]));
console.log(`${count} modules vérifiés ; imports, isolation Firebase, ressources HTML et catalogue valides.`);
