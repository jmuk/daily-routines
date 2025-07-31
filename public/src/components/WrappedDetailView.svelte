<script lang="ts">
    import { user } from "../lib/userStore";
    import LoginView from "./LoginView.svelte";
    import DetailView from "./DetailView.svelte";

    export let listId: string;
</script>

{#if $user }
<DetailView listId={listId}/>
{:else}
<LoginView/>
{/if}
