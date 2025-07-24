
<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { functions } from '../lib/firebase';
  import { httpsCallable } from 'firebase/functions';

  export let listId: string;

  let tasks: any[] = [];
  let listName = 'List';
  let listTimezone: string | null = null;
  let newTaskDescription = '';
  let newTaskRefreshHours = 24;
  let inviteAdminEmail = '';
  let isLoading = true;
  let admins: string[] = [];

  const getRoutineListDetails = httpsCallable(functions, 'getRoutineListDetails');
  const addTask = httpsCallable(functions, 'addTask');
  const updateTaskStatus = httpsCallable(functions, 'updateTaskStatus');
  const inviteAdmin = httpsCallable(functions, 'inviteAdmin');
  const removeTask = httpsCallable(functions, 'removeTask');

  async function fetchTasks() {
    isLoading = true;
    try {
      const result: any = await getRoutineListDetails({ listId });
      // Tasks are now pre-sorted by the backend.
      tasks = result.data.tasks || [];
      listName = result.data.name || 'List';
      listTimezone = result.data.timezone;
      admins = result.data.admins || [];
    } catch (error) {
      console.error("Error fetching tasks:", error);
      alert("Could not fetch tasks for this list.");
      window.location.hash = '#/';
    } finally {
      isLoading = false;
    }
  }

  async function handleAddTask() {
    if (!newTaskDescription.trim() || !newTaskRefreshHours) {
      return alert("Please provide a description and refresh duration in hours.");
    }
    try {
      await addTask({ listId, description: newTaskDescription, refreshHours: newTaskRefreshHours });
      newTaskDescription = '';
      newTaskRefreshHours = 24;
      await fetchTasks();
    } catch (error) {
      console.error("Error adding task:", error);
      alert("Failed to add task.");
    }
  }

  async function handleTaskStatusChange(taskId: string, newStatus: boolean) {
    try {
      await updateTaskStatus({ listId, taskId, status: newStatus });
      // Re-fetch to get the updated list with backend sorting.
      await fetchTasks();
    } catch (error) {
      console.error("Error updating task status:", error);
      alert("Failed to update task status.");
    }
  }
  
  async function handleInviteAdmin() {
    if (!inviteAdminEmail.trim()) return alert("Please enter an email to invite.");
    try {
      await inviteAdmin({ listId, email: inviteAdminEmail });
      inviteAdminEmail = '';
      alert("Invitation sent successfully!");
    } catch (error: any) {
      console.error("Error inviting admin:", error);
      alert(`Failed to invite admin: ${error.message}`);
    }
  }

  async function handleRemoveTask(taskId: string) {
    if (!confirm("Are you sure you want to remove this task?")) {
      return;
    }
    try {
      await removeTask({ listId, taskId });
      // Re-fetch to get the updated list.
      await fetchTasks();
    } catch (error) {
      console.error("Error removing task:", error);
      alert("Failed to remove task.");
    }
  }

  onMount(fetchTasks);
</script>

<section id="detail-view">
  <button id="back-to-lists" on:click={() => navigate('/')}>&larr; Back to Lists</button>
  <h2 id="list-name-header">{listName}</h2>
  {#if isLoading}
    <p>Loading tasks...</p>
  {:else}
    <p id="list-timezone-info">Timezone: {listTimezone || 'N/A'}</p>
    <div id="tasks-container">
      {#if tasks.length === 0}
        <p>No tasks in this list. Add one below!</p>
      {:else}
        {#each tasks as task (task.id)}
          <div class="task-item" class:completed={task.status}>
            <input 
              type="checkbox" 
              id="task-{task.id}"
              bind:checked={task.status} 
              on:change={() => handleTaskStatusChange(task.id, task.status)}
            />
            <label for="task-{task.id}" class="task-description">
              {task.description} (Resets every {task.refreshDuration / (1000 * 60 * 60)} hours)
            </label>
            <button class="remove-task-btn" on:click={() => handleRemoveTask(task.id)}>x</button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <div class="form-container">
    <h3>Add New Task</h3>
    <input type="text" bind:value={newTaskDescription} placeholder="Task description...">
    <label for="refresh-hours-input">Refresh duration in hours (e.g., 24)</label>
    <input id="refresh-hours-input" type="number" bind:value={newTaskRefreshHours}>
    <button on:click={handleAddTask}>Add Task</button>
  </div>

  <div class="form-container">
    <h3>Invite Admin</h3>
    <input type="email" bind:value={inviteAdminEmail} placeholder="user@example.com">
    <button on:click={handleInviteAdmin}>Invite</button>
  </div>

  <div class="admins-container">
    <h3>Admins</h3>
    <ul>
      {#each admins as admin}
        <li>{admin}</li>
      {/each}
    </ul>
  </div>
</section>
