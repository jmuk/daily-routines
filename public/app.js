document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Initialization ---
    const app = firebase.app();
    const auth = firebase.auth();
    const functions = firebase.functions();

    // --- Emulator Configuration ---
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocal) {
        console.log("Local environment detected. Using emulators.");
        auth.useEmulator("http://localhost:9099");
        functions.useEmulator("localhost", 5001);
    }

    // --- DOM Elements ---
    const signInButton = document.getElementById('sign-in');
    const signOutButton = document.getElementById('sign-out');
    const userInfo = document.getElementById('user-info');
    const loginView = document.getElementById('login-view');
    const listsView = document.getElementById('lists-view');
    const detailView = document.getElementById('detail-view');
    const routineListsContainer = document.getElementById('routine-lists-container');
    const createListButton = document.getElementById('create-list-button');
    const newListNameInput = document.getElementById('new-list-name');
    const newListTimezoneInput = document.getElementById('new-list-timezone');
    const listNameHeader = document.getElementById('list-name-header');
    const listTimezoneInfo = document.getElementById('list-timezone-info');
    const tasksContainer = document.getElementById('tasks-container');
    const addTaskButton = document.getElementById('add-task-button');
    const newTaskDescriptionInput = document.getElementById('new-task-description');
    const newTaskRefreshTimeInput = document.getElementById('new-task-refresh-time');
    const inviteAdminButton = document.getElementById('invite-admin-button');
    const inviteAdminEmailInput = document.getElementById('invite-admin-email');
    const backToListsButton = document.getElementById('back-to-lists');

    // --- App State ---
    let state = {
        currentUser: null,
        currentView: 'login', // 'login', 'lists', 'detail'
        currentListId: null,
        currentListTimezone: null,
        lists: [],
        tasks: [],
        isLoading: true,
    };

    // --- Firebase Function Callers ---
    const getRoutineLists = functions.httpsCallable('getRoutineLists');
    const createRoutineList = functions.httpsCallable('createRoutineList');
    const getRoutineListDetails = functions.httpsCallable('getRoutineListDetails');
    const addTask = functions.httpsCallable('addTask');
    const updateTaskStatus = functions.httpsCallable('updateTaskStatus');
    const inviteAdmin = functions.httpsCallable('inviteAdmin');

    // --- Main Render Function ---
    function render() {
        // Render Auth State
        if (state.currentUser) {
            userInfo.textContent = `Welcome, ${state.currentUser.displayName}`;
            userInfo.style.display = 'block';
            signInButton.style.display = 'none';
            signOutButton.style.display = 'block';
        } else {
            userInfo.style.display = 'none';
            signInButton.style.display = 'block';
            signOutButton.style.display = 'none';
        }

        // Render Views
        loginView.style.display = state.currentView === 'login' ? 'block' : 'none';
        listsView.style.display = state.currentView === 'lists' ? 'block' : 'none';
        detailView.style.display = state.currentView === 'detail' ? 'block' : 'none';

        // Render Lists
        if (state.currentView === 'lists') {
            routineListsContainer.innerHTML = '';
            if (state.lists.length === 0) {
                routineListsContainer.innerHTML = '<p>No routine lists found. Create one below!</p>';
            } else {
                state.lists.forEach(list => {
                    const listItem = document.createElement('div');
                    listItem.className = 'list-item';
                    listItem.textContent = list.name;
                    listItem.onclick = () => navigate(`/list/${list.id}`);
                    routineListsContainer.appendChild(listItem);
                });
            }
        }

        // Render Tasks
        if (state.currentView === 'detail') {
            listNameHeader.textContent = state.lists.find(l => l.id === state.currentListId)?.name || 'List';
            listTimezoneInfo.textContent = `Timezone: ${state.currentListTimezone || 'Loading...'}`;
            tasksContainer.innerHTML = '';
            const sortedTasks = [...state.tasks].sort((a, b) => a.status - b.status);
            if (sortedTasks.length === 0) {
                tasksContainer.innerHTML = '<p>No tasks in this list. Add one below!</p>';
            } else {
                sortedTasks.forEach(task => {
                    const taskItem = document.createElement('div');
                    taskItem.className = `task-item ${task.status ? 'completed' : ''}`;
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = task.status;
                    checkbox.onchange = () => handleTaskStatusChange(state.currentListId, task.id, checkbox.checked);
                    const description = document.createElement('span');
                    description.className = 'task-description';
                    description.textContent = `${task.description} (Resets at ${task.refreshTime})`;
                    taskItem.appendChild(checkbox);
                    taskItem.appendChild(description);
                    tasksContainer.appendChild(taskItem);
                });
            }
        }
    }

    // --- Navigation and Routing ---
    function navigate(path) {
        window.location.hash = path;
    }

    async function handleRouting() {
        if (!state.currentUser) {
            state.currentView = 'login';
            render();
            return;
        }

        const hash = window.location.hash;
        if (hash.startsWith('#/list/')) {
            const listId = hash.substring('#/list/'.length);
            state.currentView = 'detail';
            state.currentListId = listId;
            await fetchTasks(listId);
        } else {
            state.currentView = 'lists';
            state.currentListId = null;
            await fetchLists();
        }
        render();
    }

    window.addEventListener('hashchange', handleRouting);

    // --- Data Fetching ---
    async function fetchLists() {
        try {
            const result = await getRoutineLists();
            state.lists = result.data;
        } catch (error) {
            console.error("Error fetching routine lists:", error);
            alert("Could not fetch your routine lists.");
            state.lists = [];
        }
    }

    async function fetchTasks(listId) {
        try {
            const result = await getRoutineListDetails({ listId });
            state.tasks = result.data.tasks || [];
            state.currentListTimezone = result.data.timezone;
        } catch (error) {
            console.error("Error fetching tasks:", error);
            alert("Could not fetch tasks for this list.");
            state.tasks = [];
            state.currentListTimezone = null;
            navigate('/'); // Go back if there's an error
        }
    }

    // --- Authentication Logic ---
    if (isLocal) {
        console.log("Emulator detected. Simulating user login as admin@example.com");
        state.currentUser = {
            displayName: "Admin (Local)",
            email: "admin@example.com",
            uid: "fake-admin-uid"
        };
        handleRouting();
    } else {
        auth.onAuthStateChanged(user => {
            state.currentUser = user;
            handleRouting();
        });

        signInButton.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => {
                console.error("Sign-in error", error);
                alert("Failed to sign in. See console for details.");
            });
        });

        signOutButton.addEventListener('click', () => auth.signOut());
    }

    // --- Event Handlers ---
    backToListsButton.addEventListener('click', () => navigate('/'));

    createListButton.addEventListener('click', async () => {
        const name = newListNameInput.value.trim();
        if (!name) return alert("Please provide a name for the list.");
        
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        try {
            await createRoutineList({ name, timezone });
            newListNameInput.value = '';
            await fetchLists();
            render();
        } catch (error) {
            console.error("Error creating list:", error);
            alert("Failed to create list.");
        }
    });

    addTaskButton.addEventListener('click', async () => {
        const description = newTaskDescriptionInput.value.trim();
        const refreshTime = newTaskRefreshTimeInput.value.trim();
        if (!description || !refreshTime) return alert("Please provide a description and refresh time.");
        try {
            await addTask({ listId: state.currentListId, description, refreshTime });
            newTaskDescriptionInput.value = '';
            newTaskRefreshTimeInput.value = '';
            await fetchTasks(state.currentListId);
            render();
        } catch (error) {
            console.error("Error adding task:", error);
            alert("Failed to add task.");
        }
    });

    async function handleTaskStatusChange(listId, taskId, status) {
        try {
            await updateTaskStatus({ listId, taskId, status });
            const task = state.tasks.find(t => t.id === taskId);
            if (task) task.status = status;
            render();
        } catch (error) {
            console.error("Error updating task status:", error);
            alert("Failed to update task status.");
        }
    }

    inviteAdminButton.addEventListener('click', async () => {
        const email = inviteAdminEmailInput.value.trim();
        if (!email) return alert("Please enter an email to invite.");
        try {
            await inviteAdmin({ listId: state.currentListId, email });
            inviteAdminEmailInput.value = '';
            alert("Invitation sent successfully!");
        } catch (error) {
            console.error("Error inviting admin:", error);
            alert(`Failed to invite admin: ${error.message}`);
        }
    });
});
