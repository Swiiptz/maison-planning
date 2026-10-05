import { validateState } from '../domain/planning.js';

const KEY = 'maison-demo-v1';
export function createDemoAdapter(initialState, storage = globalThis.localStorage) {
  let state;
  const listeners = new Set();
  function load() {
    const data = storage.getItem(KEY);
    state = data ? validateState(JSON.parse(data)) : structuredClone(initialState);
    return structuredClone(state);
  }
  load();
  const storageListener = event => {
    if (event.key !== KEY) return;
    try { load(); for (const fn of listeners) fn(structuredClone(state)); } catch { /* Keep the last valid state. */ }
  };
  globalThis.addEventListener?.('storage', storageListener);
  return {
    mode: 'demo',
    async load() { return load(); },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    async commit(next, revision) {
      load();
      if (revision !== state.revision) throw new Error('Le planning a changé dans un autre onglet. Recharge-le avant de réessayer.');
      validateState(next);
      const saved = { ...next, revision: revision + 1 };
      storage.setItem(KEY, JSON.stringify(saved));
      state = structuredClone(saved);
      for (const fn of listeners) fn(structuredClone(state));
      return structuredClone(state);
    },
    dispose() { globalThis.removeEventListener?.('storage', storageListener); listeners.clear(); },
  };
}
