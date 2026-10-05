// The SDK and provider-specific identities stay entirely inside this adapter.
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const COLLECTIONS = ['members', 'groups', 'tasks', 'sessions', 'overrides'];

function readableError(error) {
  const code = error.code ?? '';
  const messages = {
    'auth/operation-not-allowed': 'La connexion Google doit être activée dans Firebase Authentication.',
    'auth/unauthorized-domain': 'Cette adresse doit être ajoutée aux domaines autorisés dans Firebase Authentication.',
    'auth/popup-blocked': 'Le navigateur a bloqué la connexion. Autorise la fenêtre puis réessaie.',
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'permission-denied': 'Accès refusé. Vérifie les règles Firestore et ton appartenance au foyer.',
    'resource-exhausted': 'Le quota gratuit est atteint. Réessaie après son renouvellement.',
    'unavailable': 'Le service est indisponible. Vérifie ta connexion et réessaie.',
  };
  return new Error(messages[code] ?? error.message ?? 'Impossible de contacter le planning partagé.');
}

export async function createFirebaseInfrastructure(config) {
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`),
  ]);
  const app = appSdk.initializeApp(config);
  const auth = authSdk.getAuth(app), db = dbSdk.getFirestore(app);
  const accountListeners = new Set();
  let account = null;
  const normalizeAccount = value => value ? { id: value.uid, name: value.displayName || 'Moi', email: value.email || '' } : null;
  const ready = new Promise(resolve => {
    let first = true;
    authSdk.onAuthStateChanged(auth, value => {
      account = normalizeAccount(value);
      if (first) { first = false; resolve(account); }
      for (const fn of accountListeners) fn(account);
    });
  });
  const guarded = fn => async (...args) => { try { return await fn(...args); } catch (error) { throw readableError(error); } };
  const identityRef = () => dbSdk.doc(db, 'identities', auth.currentUser.uid);
  const membershipRef = id => dbSdk.doc(db, 'identities', auth.currentUser.uid, 'memberships', id);
  const rootRef = id => dbSdk.doc(db, 'households', id);
  const entityRef = (id, collection, key) => dbSdk.doc(db, 'households', id, collection, key);
  return {
    mode: 'firebase',
    auth: {
      signInLabel: 'Se connecter avec Google',
      ready: () => ready,
      current: () => account,
      subscribe(fn) { accountListeners.add(fn); return () => accountListeners.delete(fn); },
      signIn: guarded(async () => {
        const provider = new authSdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await authSdk.signInWithPopup(auth, provider);
      }),
      signOut: guarded(() => authSdk.signOut(auth)),
    },
    listHouseholds: guarded(async () => {
      if (!auth.currentUser) return { households: [], favoriteHouseholdId: null };
      const profile = await dbSdk.getDoc(identityRef());
      const memberships = await dbSdk.getDocs(dbSdk.collection(db, 'identities', auth.currentUser.uid, 'memberships'));
      const entries = memberships.docs.map(doc => doc.data());
      // Preserve an existing V1 family until its membership index is created.
      const legacy = profile.exists() ? profile.data() : {};
      if (legacy.householdId && !entries.some(entry => entry.householdId === legacy.householdId)) entries.push(legacy);
      const households = [];
      for (const entry of entries) {
        try {
          const snapshot = await dbSdk.getDoc(rootRef(entry.householdId));
          const root = snapshot.exists() ? snapshot.data() : null;
          const access = root?.access?.[auth.currentUser.uid];
          if (access) households.push({ householdId: entry.householdId, memberId: access.memberId, name: root.name, canInvite: root.ownerUid === auth.currentUser.uid });
        } catch (error) { if (error.code !== 'permission-denied') throw error; }
      }
      return { households, favoriteHouseholdId: legacy.favoriteHouseholdId || legacy.householdId || null };
    }),
    setFavoriteHousehold: guarded(async householdId => {
      const snapshot = await dbSdk.getDoc(rootRef(householdId));
      if (!snapshot.exists() || !snapshot.data().access?.[auth.currentUser.uid]) throw new Error('Cette famille n’est plus accessible.');
      await dbSdk.setDoc(identityRef(), { favoriteHouseholdId: householdId }, { merge: true });
    }),
    createHousehold: guarded(async initial => {
      if (!auth.currentUser) throw new Error('Connecte-toi pour créer le foyer.');
      const id = initial.household.id, memberId = initial.members[0].id;
      const batch = dbSdk.writeBatch(db);
      batch.set(rootRef(id), { schemaVersion: 1, revision: 0, name: initial.household.name, ownerUid: auth.currentUser.uid, access: { [auth.currentUser.uid]: { memberId } } });
      for (const key of COLLECTIONS) {
        const values = key === 'overrides' ? Object.values(initial.overrides) : initial[key];
        for (const value of values) batch.set(entityRef(id, key, value.id), value);
      }
      batch.set(entityRef(id, 'accountLinks', memberId), { uid: auth.currentUser.uid, memberId });
      batch.set(membershipRef(id), { householdId: id, memberId });
      await batch.commit();
      return { householdId: id, memberId };
    }),
    joinHousehold: guarded(async token => {
      if (!auth.currentUser) throw new Error('Connecte-toi pour rejoindre le foyer.');
      if (!/^[a-zA-Z0-9-]{20,100}$/.test(token)) throw new Error('Code d’invitation invalide.');
      return dbSdk.runTransaction(db, async transaction => {
        const ref = dbSdk.doc(db, 'invitations', token);
        const invitation = await transaction.get(ref);
        if (!invitation.exists()) throw new Error('Invitation introuvable.');
        const data = invitation.data(), { householdId, memberId } = data;
        if (data.usedBy || !data.expiresAt || data.expiresAt.toMillis() <= Date.now()) throw new Error('Cette invitation a expiré ou a déjà été utilisée.');
        if (!auth.currentUser.emailVerified || data.email !== auth.currentUser.email?.toLowerCase()) throw new Error('Connecte-toi avec l’adresse vérifiée de cette invitation.');
        const membership = await transaction.get(membershipRef(householdId));
        if (membership.exists()) throw new Error('Tu fais déjà partie de cette famille.');
        transaction.update(rootRef(householdId), new dbSdk.FieldPath('access', auth.currentUser.uid), { memberId, invitationId: token });
        transaction.set(entityRef(householdId, 'accountLinks', memberId), { uid: auth.currentUser.uid, memberId });
        transaction.set(membershipRef(householdId), { householdId, memberId });
        transaction.update(ref, { usedBy: auth.currentUser.uid });
        return { householdId, memberId };
      });
    }),
    inviteMember: guarded(async (householdId, memberId, email) => {
      if ((await dbSdk.getDoc(entityRef(householdId, 'accountLinks', memberId))).exists()) throw new Error('Ce membre possède déjà un compte connecté.');
      const token = crypto.randomUUID();
      await dbSdk.setDoc(dbSdk.doc(db, 'invitations', token), { householdId, memberId, email: email.trim().toLowerCase(), createdBy: auth.currentUser.uid, createdAt: dbSdk.serverTimestamp(), expiresAt: dbSdk.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
      return token;
    }),
    createDataAdapter(householdId) {
      let baseline;
      const callbacks = new Set(), failures = new Set(), stops = [];
      let parts = {}, started = false;
      function assemble(root, rows) {
        return { schemaVersion: root.schemaVersion, revision: root.revision, household: { id: householdId, name: root.name }, ...rows };
      }
      function publish() {
        if (Object.keys(parts).length !== COLLECTIONS.length + 1) return;
        baseline = assemble(parts.root, Object.fromEntries(COLLECTIONS.map(key => [key, parts[key]])));
        for (const fn of callbacks) fn(structuredClone(baseline));
      }
      function watch() {
        if (started) return;
        started = true;
        const fail = error => { for (const fn of failures) fn(readableError(error)); };
        stops.push(dbSdk.onSnapshot(rootRef(householdId), snap => { if (snap.exists()) parts.root = snap.data(); else fail(new Error('Foyer introuvable.')); }, fail));
        for (const key of COLLECTIONS) stops.push(dbSdk.onSnapshot(dbSdk.collection(db, 'households', householdId, key), snap => {
          const values = snap.docs.map(doc => doc.data());
          parts[key] = key === 'overrides' ? Object.fromEntries(values.map(o => [o.id, o])) : values;
        }, fail));
        stops.push(dbSdk.onSnapshotsInSync(db, publish));
      }
      return {
        mode: 'firebase',
        load: guarded(async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const before = await dbSdk.getDoc(rootRef(householdId));
            if (!before.exists()) throw new Error('Foyer introuvable.');
            const values = await Promise.all(COLLECTIONS.map(key => dbSdk.getDocs(dbSdk.collection(db, 'households', householdId, key))));
            const after = await dbSdk.getDoc(rootRef(householdId));
            if (before.data().revision !== after.data().revision) continue;
            const rows = Object.fromEntries(COLLECTIONS.map((key, i) => {
              const items = values[i].docs.map(doc => doc.data());
              return [key, key === 'overrides' ? Object.fromEntries(items.map(o => [o.id, o])) : items];
            }));
            baseline = assemble(after.data(), rows);
            return structuredClone(baseline);
          }
          throw new Error('Le planning change rapidement. Réessaie dans un instant.');
        }),
        subscribe(fn) { callbacks.add(fn); watch(); return () => callbacks.delete(fn); },
        onError(fn) { failures.add(fn); return () => failures.delete(fn); },
        commit: guarded(async (next, expectedRevision) => {
          const previous = structuredClone(baseline);
          await dbSdk.runTransaction(db, async transaction => {
            const snapshot = await transaction.get(rootRef(householdId));
            if (!snapshot.exists() || snapshot.data().revision !== expectedRevision) throw new Error('Le planning a été modifié par un autre membre. Réessaie avec la version actualisée.');
            let writes = 1;
            for (const key of COLLECTIONS) {
              const oldMap = Object.fromEntries((key === 'overrides' ? Object.values(previous.overrides) : previous[key]).map(item => [item.id, item]));
              const newMap = Object.fromEntries((key === 'overrides' ? Object.values(next.overrides) : next[key]).map(item => [item.id, item]));
              for (const [id, item] of Object.entries(newMap)) if (JSON.stringify(oldMap[id]) !== JSON.stringify(item)) {
                if (++writes > 450) throw new Error('Trop de modifications dans une seule opération. Réduis la taille de l’import.');
                transaction.set(entityRef(householdId, key, id), item);
              }
              for (const id of Object.keys(oldMap)) if (!newMap[id]) {
                if (++writes > 450) throw new Error('Trop de modifications dans une seule opération.');
                transaction.delete(entityRef(householdId, key, id));
              }
            }
            transaction.update(rootRef(householdId), { revision: expectedRevision + 1 });
          });
          baseline = { ...next, revision: expectedRevision + 1 };
          return structuredClone(baseline);
        }),
        dispose() { stops.forEach(stop => stop()); callbacks.clear(); failures.clear(); },
      };
    },
  };
}
