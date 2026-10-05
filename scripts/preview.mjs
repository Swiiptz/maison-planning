import { readFile, writeFile } from 'node:fs/promises';

// Package the actual interface and demo services in one offline HTML file.
// No server, Firebase connection or network dependency is needed to open it.
const sources = [
  'domain/dates.js',
  'domain/planning.js',
  'adapters/demo.js',
  'services/seed.js',
  'services/planning-service.js',
  'services/bootstrap.js',
  'services/webmcp.js',
  'main.js',
];
const catalog = JSON.parse(await readFile('app/data/catalog.json', 'utf8'));
let code = `const config = { provider: 'demo' };\nconst previewCatalog = ${JSON.stringify(catalog)};\n`;
code += `const previewStorage = (() => {
  try {
    const storage = globalThis.localStorage;
    storage.setItem('maison-preview-check', 'ok');
    storage.removeItem('maison-preview-check');
    return storage;
  } catch {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  }
})();\n`;
for (const filename of sources) {
  let source = await readFile(`app/${filename}`, 'utf8');
  source = source.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
  if (filename === 'services/bootstrap.js') {
    const start = source.indexOf('  const response = await fetch(');
    const end = source.indexOf('  let adapter;', start);
    if (start < 0 || end < 0) throw new Error('Le chargement du catalogue a changé : mettre à jour le générateur d’aperçu.');
    source = source.slice(0, start) + '  const catalog = structuredClone(previewCatalog);\n' + source.slice(end);
  }
  if (filename === 'adapters/demo.js') {
    source = source.replace("const KEY = 'maison-demo-v1'", "const KEY = 'maison-preview-v1'").replace('storage = globalThis.localStorage', 'storage = previewStorage');
  }
  if (filename === 'main.js') {
    source = source.replace('Démonstration</strong> · Enregistrée sur cet appareil', 'Aperçu interactif</strong> · Données d’exemple locales');
    source = source.replace(/\ninit\(\);\s*$/, '\nawait init();\n');
  }
  code += source + '\n';
}
if (code.includes('import.meta')) throw new Error('Une dépendance de module doit être adaptée pour l’aperçu autonome.');
code = `(async () => {\n${code}\n})();`;
const css = (await readFile('app/styles.css', 'utf8')).replace(/^@import[^\n]*\n/gm, '') + '\n[data-action="connect"] { display: none !important; }\n';
const favicon = await readFile('app/assets/favicon.svg', 'utf8');
let html = await readFile('app/index.html', 'utf8');
html = html.replace('<title>Maison — Le planning du foyer</title>', '<title>Aperçu — Maison</title>')
  .replace('href="./assets/favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`)
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./main.js"></script>', `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await writeFile('apercu.html', html);
console.log('Aperçu prêt : ouvrir apercu.html directement dans Firefox ou Chrome.');
