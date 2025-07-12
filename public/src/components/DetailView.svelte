
<script lang="ts">
  import { onMount } from 'svelte';
  import { functions } from '../lib/firebase';
  import { httpsCallable } from 'firebase/functions';

  export let listId: string;

  let tasks: any[] = [];
  let listName = 'List';
  let listTimezone: string | null = null;
  let newTaskDescription = '';
  let newTaskRefreshTime = '';
  let inviteAdminEmail = '';
  let isLoading = true;

  const getRoutineListDetails = httpsCallable(functions, 'getRoutineListDetails');
  const addTask = httpsCallable(functions, 'addTask');
  const updateTaskStatus = httpsCallable(functions, 'updateTaskStatus');
  const inviteAdmin = httpsCallable(functions, 'inviteAdmin');

  function taskCmp(t1: any, t2: any) {
    if (t1.status != t2.status) {
      return t1.status - t2.status;
    }
    return t1.originalIndex - t2.originalIndex;
  }

  async function fetchTasks() {
    isLoading = true;
    try {
      const result: any = await getRoutineListDetails({ listId });
      tasks = (result.data.tasks || [])
        .map((task: any, idx: number) => {return {originalIndex: idx, ...task}})
        .sort(taskCmp);
      listName = result.data.name || 'List';
      listTimezone = result.data.timezone;
    } catch (error) {
      console.error("Error fetching tasks:", error);
      alert("Could not fetch tasks for this list.");
      window.location.hash = '#/';
    } finally {
      isLoading = false;
    }
  }

  async function handleAddTask() {
    if (!newTaskDescription.trim() || !newTaskRefreshTime.trim()) {
      return alert("Please provide a description and refresh time.");
    }
    try {
      await addTask({ listId, description: newTaskDescription, refreshTime: newTaskRefreshTime });
      newTaskDescription = '';
      newTaskRefreshTime = '';
      await fetchTasks();
    } catch (error) {
      console.error("Error adding task:", error);
      alert("Failed to add task.");
    }
  }

  async function handleTaskStatusChange(taskId: string, newStatus: boolean) {
    try {
      await updateTaskStatus({ listId, taskId, status: newStatus });
      // Find the task and update its status in the local array.
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        tasks[taskIndex].status = newStatus;
      }
    } catch (error) {
      console.error("Error updating task status:", error);
      alert("Failed to update task status.");
      // Optional: revert local state on failure
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        tasks[taskIndex].status = !newStatus;
      }
    }
    // Create a new sorted array to trigger Svelte's reactivity.
    tasks = [...tasks].sort(taskCmp);
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

  onMount(fetchTasks);
</script>

<section id="detail-view">
  <button id="back-to-lists" on:click={() => window.location.hash = '#/'}>&larr; Back to Lists</button>
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
              bind:checked={task.status} 
              on:change={() => handleTaskStatusChange(task.id, task.status)}
            />
            <span class="task-description">
              {task.description} (Resets at {task.refreshTime})
            </span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <div class="form-container">
    <h3>Add New Task</h3>
    <input type="text" bind:value={newTaskDescription} placeholder="Task description...">
    <input type="text" bind:value={newTaskRefreshTime} placeholder="Refresh time (e.g., 06:00)">
    <button on:click={handleAddTask}>Add Task</button>
  </div>

  <div class="form-container">
    <h3>Invite Admin</h3>
    <input type="email" bind:value={inviteAdminEmail} placeholder="user@example.com">
    <button on:click={handleInviteAdmin}>Invite</button>
  </div>
</section>
