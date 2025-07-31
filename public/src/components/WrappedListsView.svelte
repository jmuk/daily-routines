<script>
    import { user } from '../lib/userStore';
    import LoginView from './LoginView.svelte';
    import ListsView from './ListsView.svelte';
</script>

{#if $user }
<ListsView/>
{:else}
<LoginView/>
{/if}
