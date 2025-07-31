<script lang="ts">
  import { onMount } from 'svelte';
  import { user } from './lib/userStore';
  import { auth } from './lib/firebase';
  import { onAuthStateChanged } from 'firebase/auth';
  import { Router, Route } from 'svelte-routing';
  import ListsView from './components/WrappedListsView.svelte';
  import DetailView from './components/WrappedDetailView.svelte';
  import Header from './components/Header.svelte';

  export let url = "";

  onMount(() => {
    if (import.meta.env.DEV) {
      user.set({
        uid: 'dev-user-uid',
        email: 'admin@example.com',
        displayName: 'Admin User',
        photoURL: null,
        phoneNumber: null,
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        providerId: 'fake',
        refreshToken: 'fake-refresh-token',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'fake-id-token',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({}),
      });
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      user.set(currentUser);
    });

    return unsubscribe;
  });
</script>

<Header />

<main>
  <Router {url}>
    <Route path="/"><ListsView /></Route>
    <Route path="/list/:listId" let:params><DetailView listId={params.listId}/></Route>
  </Router>
</main>
