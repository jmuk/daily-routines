<script lang="ts">
  import { onMount } from 'svelte';
  import { user } from './lib/userStore';
  import { auth } from './lib/firebase';
  import { onAuthStateChanged, type User } from 'firebase/auth';
  import { hash } from './lib/hashStore';
  import LoginView from './components/LoginView.svelte';
  import ListsView from './components/ListsView.svelte';
  import DetailView from './components/DetailView.svelte';
  import Header from './components/Header.svelte';

  let currentView: 'login' | 'lists' | 'detail';
  let currentListId: string | null;

  $: {
    if (!$user) {
      currentView = 'login';
    } else {
      if ($hash.startsWith('#/list/')) {
        currentView = 'detail';
        currentListId = $hash.substring('#/list/'.length);
      } else {
        currentView = 'lists';
        currentListId = null;
      }
    }
  }

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
  {#if currentView === 'login'}
    <LoginView />
  {:else if currentView === 'lists'}
    <ListsView />
  {:else if currentView === 'detail'}
    <DetailView listId={currentListId} />
  {/if}
</main>
