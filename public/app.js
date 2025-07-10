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
    const tasksContainer = document.getElementById('tasks-container');
    const addTaskButton = document.getElementById('add-task-button');
    const newTaskDescriptionInput = document.getElementById('new-task-description');
    const newTaskRefreshTimeInput = document.getElementById('new-task-refresh-time');
    const inviteAdminButton = document.getElementById('invite-admin-button');
    const inviteAdminEmailInput = document.getElementById('invite-admin-email');
    const backToListsButton = document.getElementById('back-to-lists');

    // --- App State ---
    let currentUser = null;
    let currentListId = null;

    // --- Firebase Function Callers ---
    const getRoutineLists = functions.httpsCallable('getRoutineLists');
    const createRoutineList = functions.httpsCallable('createRoutineList');
    const getRoutineListDetails = functions.httpsCallable('getRoutineListDetails');
    const addTask = functions.httpsCallable('addTask');
    const updateTaskStatus = functions.httpsCallable('updateTaskStatus');
    const inviteAdmin = functions.httpsCallable('inviteAdmin');

    // --- Routing ---
    function handleRouting() {
        if (!currentUser) {
            showLoginView();
            return;
        }

        const hash = window.location.hash;
        if (hash.startsWith('#/list/')) {
            const listId = hash.substring('#/list/'.length);
            showDetailView(listId);
        } else {
            showListsView();
        }
    }

    window.addEventListener('hashchange', handleRouting);

    // --- Authentication Logic ---
    if (isLocal) {
        console.log("Emulator detected. Simulating user login as admin@example.com");
        currentUser = {
            displayName: "Admin (Local)",
            email: "admin@example.com",
            uid: "fake-admin-uid"
        };
        userInfo.textContent = `Welcome, ${currentUser.displayName}`;
        userInfo.style.display = 'block';
        signInButton.style.display = 'none';
        signOutButton.style.display = 'none';
        handleRouting(); // Start routing after fake login
    } else {
        auth.onAuthStateChanged(user => {
            currentUser = user;
            if (user) {
                userInfo.textContent = `Welcome, ${user.displayName}`;
                userInfo.style.display = 'block';
                signInButton.style.display = 'none';
                signOutButton.style.display = 'block';
            } else {
                userInfo.style.display = 'none';
                signInButton.style.display = 'block';
                signOutButton.style.display = 'none';
            }
            handleRouting(); // Start routing after auth state is known
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

    // --- UI Navigation ---
    function showLoginView() {
        loginView.style.display = 'block';
        listsView.style.display = 'none';
        detailView.style.display = 'none';
    }

    async function showListsView() {
        window.location.hash = '';
        loginView.style.display = 'none';
        detailView.style.display = 'none';
        listsView.style.display = 'block';
        await renderRoutineLists();
    }

    async function showDetailView(listId) {
        loginView.style.display = 'none';
        listsView.style.display = 'none';
        detailView.style.display = 'block';
        currentListId = listId;
        
        // Set URL hash without triggering hashchange
        if (window.location.hash !== `#/list/${listId}`) {
            history.pushState(null, '', `#/list/${listId}`);
        }

        await renderTasks(listId);
    }

    backToListsButton.addEventListener('click', showListsView);

    // --- Rendering Logic ---
    async function renderRoutineLists() {
        try {
            const result = await getRoutineLists();
            routineListsContainer.innerHTML = '';
            if (result.data.length === 0) {
                routineListsContainer.innerHTML = '<p>No routine lists found. Create one below!</p>';
                return;
            }
            result.data.forEach(list => {
                const listItem = document.createElement('div');
                listItem.className = 'list-item';
                listItem.textContent = list.name;
                listItem.onclick = () => {
                    // Navigate by changing hash, which triggers handleRouting
                    window.location.hash = `#/list/${list.id}`;
                };
                routineListsContainer.appendChild(listItem);
            });
        } catch (error) {
            console.error("Error fetching routine lists:", error);
            alert("Could not fetch your routine lists.");
        }
    }

    async function renderTasks(listId) {
        try {
            const result = await getRoutineListDetails({ listId });
            const listData = result.data;
            listNameHeader.textContent = listData.name;
            tasksContainer.innerHTML = '';
            const tasks = listData.tasks || [];
            tasks.sort((a, b) => a.status - b.status);

            if (tasks.length === 0) {
                tasksContainer.innerHTML = '<p>No tasks in this list. Add one below!</p>';
                return;
            }

            tasks.forEach(task => {
                const taskItem = document.createElement('div');
                taskItem.className = `task-item ${task.status ? 'completed' : ''}`;
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = task.status;
                checkbox.onchange = () => handleTaskStatusChange(listId, task.id, checkbox.checked);
                const description = document.createElement('span');
                description.className = 'task-description';
                description.textContent = `${task.description} (Resets at ${task.refreshTime})`;
                taskItem.appendChild(checkbox);
                taskItem.appendChild(description);
                tasksContainer.appendChild(taskItem);
            });
        } catch (error) {
            console.error("Error fetching tasks:", error);
            alert("Could not fetch tasks for this list.");
            showListsView(); // Go back if there's an error
        }
    }

    // --- Event Handlers ---
    createListButton.addEventListener('click', async () => {
        const name = newListNameInput.value.trim();
        const timezone = newListTimezoneInput.value.trim();
        if (!name || !timezone) {
            alert("Please provide a name and timezone for the new list.");
            return;
        }
        try {
            await createRoutineList({ name, timezone });
            newListNameInput.value = '';
            newListTimezoneInput.value = '';
            await renderRoutineLists();
        } catch (error) {
            console.error("Error creating list:", error);
            alert("Failed to create list.");
        }
    });

    addTaskButton.addEventListener('click', async () => {
        const description = newTaskDescriptionInput.value.trim();
        const refreshTime = newTaskRefreshTimeInput.value.trim();
        if (!description || !refreshTime) {
            alert("Please provide a description and refresh time for the new task.");
            return;
        }
        try {
            await addTask({ listId: currentListId, description, refreshTime });
            newTaskDescriptionInput.value = '';
            newTaskRefreshTimeInput.value = '';
            await renderTasks(currentListId);
        } catch (error) {
            console.error("Error adding task:", error);
            alert("Failed to add task.");
        }
    });

    async function handleTaskStatusChange(listId, taskId, status) {
        try {
            await updateTaskStatus({ listId, taskId, status });
            await renderTasks(listId);
        } catch (error) {
            console.error("Error updating task status:", error);
            alert("Failed to update task status.");
        }
    }

    inviteAdminButton.addEventListener('click', async () => {
        const email = inviteAdminEmailInput.value.trim();
        if (!email) {
            alert("Please enter an email to invite.");
            return;
        }
        try {
            await inviteAdmin({ listId: currentListId, email });
            inviteAdminEmailInput.value = '';
            alert("Invitation sent successfully!");
        } catch (error) {
            console.error("Error inviting admin:", error);
            alert(`Failed to invite admin: ${error.message}`);
        }
    });
});
