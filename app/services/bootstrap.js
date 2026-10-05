import { config } from '../config.js';
import { createDemoAdapter } from '../adapters/demo.js';
import { createPlanningService } from './planning-service.js';
import { seedState } from './seed.js';

export async function createRuntime({ demo = false } = {}) {
  const response = await fetch(new URL('../data/catalog.json', import.meta.url));
  if (!response.ok) throw new Error('Impossible de charger le catalogue des tâches.');
  const catalog = await response.json();
  let adapter;
  if (demo || config.provider === 'demo') {
    adapter = createDemoAdapter(seedState(catalog, { demo: true }));
    const auth = {
      ready: async () => ({ id: 'member-camille', name: 'Camille', email: '' }),
      current: () => ({ id: 'member-camille', name: 'Camille', email: '' }),
      subscribe: () => () => {},
      signOut: async () => {},
    };
    return { mode: 'demo', auth, memberId: 'member-camille', async open() { return createPlanningService(adapter, 'member-camille'); }, dispose() { adapter.dispose(); } };
  }
  const { createFirebaseInfrastructure } = await import('../adapters/firebase.js');
  const infrastructure = await createFirebaseInfrastructure(config.firebase);
  return {
    mode: 'shared', auth: infrastructure.auth,
    memberId: null, households: [], favoriteHouseholdId: null,
    async refreshHouseholds() { const result = await infrastructure.listHouseholds(); this.households = result.households; this.favoriteHouseholdId = result.favoriteHouseholdId; return this.households; },
    async setFavorite(householdId) { await infrastructure.setFavoriteHousehold(householdId); this.favoriteHouseholdId = householdId; },
    permissions: { canInvite: false },
    async open(householdId) {
      await this.refreshHouseholds();
      const membership = householdId ? this.households.find(h => h.householdId === householdId) : this.households.find(h => h.householdId === this.favoriteHouseholdId) ?? this.households[0];
      if (!membership) return null;
      this.memberId = membership.memberId;
      this.permissions = { canInvite: membership.canInvite };
      adapter?.dispose();
      adapter = infrastructure.createDataAdapter(membership.householdId);
      return createPlanningService(adapter, membership.memberId);
    },
    async createHousehold(name) {
      const initial = seedState(catalog, { memberName: infrastructure.auth.current().name });
      initial.household.name = name;
      const membership = await infrastructure.createHousehold(initial);
      await this.refreshHouseholds();
      if (!this.favoriteHouseholdId) await this.setFavorite(membership.householdId);
      return this.open(membership.householdId);
    },
    async joinHousehold(token) { const membership = await infrastructure.joinHousehold(token); return this.open(membership.householdId); },
    async invite(memberId, email, householdId) { return infrastructure.inviteMember(householdId, memberId, email); },
    onError(fn) { return adapter?.onError(fn) ?? (() => {}); },
    dispose() { adapter?.dispose(); },
  };
}
