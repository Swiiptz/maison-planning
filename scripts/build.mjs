import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('app', 'dist', { recursive: true });
await writeFile('dist/.nojekyll', '');
console.log('Site statique prêt dans dist/ pour GitHub Pages.');
