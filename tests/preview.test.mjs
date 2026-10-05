import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import '../scripts/preview.mjs';

test('standalone preview starts without a server, network, or browser storage', async () => {
  const html = await readFile(new URL('../apercu.html', import.meta.url), 'utf8');
  assert.equal(html.includes('src="./main.js"'), false);
  assert.equal(html.includes('href="./styles.css"'), false);
  assert.equal(html.includes('fonts.googleapis.com'), false);
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const element = () => ({ innerHTML: '', className: '', classList: { add() {}, remove() {} }, addEventListener() {} });
  const nodes = { '#app': element(), '#dialog': element(), '#toast': element() };
  const document = { querySelector: selector => nodes[selector], querySelectorAll: () => [], addEventListener() {}, body: element() };
  const context = vm.createContext({ document, window: { addEventListener() {} }, location: { pathname: '/apercu.html', search: '' }, console, URLSearchParams, URL, Date, Intl, crypto: webcrypto, structuredClone, setTimeout() {}, clearTimeout() {}, fetch() { throw new Error('L’aperçu ne doit pas utiliser le réseau.'); } });
  await vm.runInContext(script, context, { timeout: 10000 });
  assert.equal(nodes['#app'].innerHTML.includes('Aperçu interactif'), false);
  assert.equal(nodes['#app'].innerHTML.includes('Exemple local'), false);
  assert.ok(nodes['#app'].innerHTML.includes('L’agenda de la maison'));
  assert.equal((nodes['#app'].innerHTML.match(/class="day-column/g) ?? []).length, 7);
  assert.ok(nodes['#app'].innerHTML.includes('data-toggle='));
});
