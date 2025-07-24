
<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { functions } from '../lib/firebase';
  import { httpsCallable } from 'firebase/functions';

  let lists: any[] = [];
  let newListName = '';
  let isLoading = true;

  const getRoutineLists = httpsCallable(functions, 'getRoutineLists');
  const createRoutineList = httpsCallable(functions, 'createRoutineList');

  async function fetchLists() {
    isLoading = true;
    try {
      const result = await getRoutineLists();
      lists = result.data as any[];
    } catch (error) {
      console.error("Error fetching routine lists:", error);
      alert("Could not fetch your routine lists.");
    } finally {
      isLoading = false;
    }
  }

  async function handleCreateList() {
    if (!newListName.trim()) return alert("Please provide a name for the list.");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await createRoutineList({ name: newListName, timezone });
      newListName = '';
      await fetchLists();
    } catch (error) {
      console.error("Error creating list:", error);
      alert("Failed to create list.");
    }
  }

  function handleKeyDown(event: KeyboardEvent, listId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      navigate(`/list/${listId}`);
    }
  }

  onMount(fetchLists);
</script>

<section id="lists-view">
  <h2>My Routine Lists</h2>
  <div id="routine-lists-container">
    {#if isLoading}
      <p>Loading...</p>
    {:else if lists.length === 0}
      <p>No routine lists found. Create one below!</p>
    {:else}
      {#each lists as list}
        <div
          class="list-item" 
          role="button" 
          tabindex="0" 
          on:click={() => navigate(`/list/${list.id}`)}
          on:keydown={(e) => handleKeyDown(e, list.id)}
        >
          {list.name}
        </div>
      {/each}
    {/if}
  </div>
  <div class="form-container">
    <h3>Create New List</h3>
    <input type="text" bind:value={newListName} placeholder="New list name...">
    <button on:click={handleCreateList}>Create List</button>
  </div>
</section>
