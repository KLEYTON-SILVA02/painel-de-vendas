import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createStore, del, get, set } from 'idb-keyval';

// Shared between App.tsx (wires it into PersistQueryClientProvider) and
// AuthContext.tsx (wipes it on sign-out, so a later login on the same
// device — a different collaborator, or the ADM after a collaborator —
// never paints from a previous session's cached data before its own
// queries have had a chance to load). A dedicated idb-keyval store keeps
// this cache in its own IndexedDB object store, isolated from the PWA
// service worker's own caches and anything else origin-level.
const idbStore = createStore('painel-vendas-query-cache', 'queries');

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key, idbStore),
    setItem: (key, value) => set(key, value, idbStore),
    removeItem: (key) => del(key, idbStore),
  },
});
