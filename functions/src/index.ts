import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError, CallableOptions} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// Define common options for callable functions to allow requests from any origin.
const callableOptions: CallableOptions = {
  cors: true,
};

/**
 * Helper to get user's email, faking it for the emulator if necessary
 * @param {any} request The request object.
 * @return {string} The user's email.
 */
function getEmail(
  request: {data: any, auth?: {token: {email?: string}}}
): string {
  if (isEmulator && !request.auth?.token.email) {
    logger.warn("EMULATOR MODE: Faking email for request.");
    return "admin@example.com";
  }
  const email = request.auth?.token.email;
  if (!email) {
    throw new HttpsError(
      "unauthenticated", "You must be logged in with an email."
    );
  }
  return email;
}

// --- Callable Functions ---

/**
 * Creates a new routine list for the authenticated user.
 */
export const createRoutineList = onCall(callableOptions, async (request) => {
  const email = getEmail(request);

  const {name, timezone} = request.data;
  if (!name || !timezone) {
    throw new HttpsError(
      "invalid-argument", "Name and timezone are required."
    );
  }

  const newList = {
    name,
    timezone,
    admins: [email], // The creator is the first admin
  };

  const listRef = await db.collection("routine_lists").add(newList);
  logger.info(`New list created by ${email} with ID: ${listRef.id}`);
  return {listId: listRef.id};
});

/**
 * Fetches all routine lists where the current user is an admin.
 */
export const getRoutineLists = onCall(callableOptions, async (request) => {
  const email = getEmail(request);
  const snapshot = await db.collection("routine_lists")
    .where("admins", "array-contains", email).get();
  return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
});

/**
 * Fetches the details of a single routine list, including its tasks.
 */
export const getRoutineListDetails = onCall(callableOptions, async (request) => {
  const email = getEmail(request);

  const {listId} = request.data;
  if (!listId) {
    throw new HttpsError(
      "invalid-argument", "The 'listId' argument is required."
    );
  }

  const listDoc = await db.collection("routine_lists").doc(listId).get();
  if (!listDoc.exists) {
    throw new HttpsError("not-found", "The specified list does not exist.");
  }

  const listData = listDoc.data();
  if (!listData?.admins.includes(email)) {
    throw new HttpsError(
      "permission-denied", "You are not an admin of this list."
    );
  }

  // Fetch tasks for this list, sorted by the next refresh time
  const tasksSnapshot = await db.collection("tasks")
    .where("listId", "==", listId)
    .orderBy("refreshTimestamp", "asc")
    .get();
  const tasks = tasksSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));

  return {id: listDoc.id, ...listData, tasks};
});


/**
 * Adds a new task to a specified routine list.
 */
export const addTask = onCall(callableOptions, async (request) => {
  const email = getEmail(request);

  const {listId, description, refreshHours} = request.data;
  if (!listId || !description || !refreshHours) {
    throw new HttpsError(
      "invalid-argument",
      "listId, description, and refreshHours are required."
    );
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(email)) {
    throw new HttpsError(
      "permission-denied", "You are not an admin of this list."
    );
  }

  const refreshDuration = refreshHours * 60 * 60 * 1000;
  const now = Date.now();

  const newTask = {
    listId,
    description,
    status: false,
    refreshDuration,
    refreshTimestamp: now + refreshDuration,
    previousRefreshTimestamp: null,
  };

  const taskRef = await db.collection("tasks").add(newTask);
  logger.info(
    `Task added to list ${listId} by ${email} with new task ID: ${taskRef.id}`
  );
  return {taskId: taskRef.id};
});

/**
 * Updates the status of a task.
 */
export const updateTaskStatus = onCall(callableOptions, async (request) => {
  const email = getEmail(request);

  const {listId, taskId, status} = request.data;
  if (!listId || !taskId || typeof status !== "boolean") {
    throw new HttpsError(
      "invalid-argument",
      "listId, taskId, and a boolean status are required."
    );
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(email)) {
    throw new HttpsError(
      "permission-denied", "You are not an admin of this list."
    );
  }

  const taskRef = db.collection("tasks").doc(taskId);
  const taskDoc = await taskRef.get();
  if (!taskDoc.exists) {
    throw new HttpsError("not-found", "Task not found.");
  }
  const taskData = taskDoc.data();
  if (!taskData) {
    throw new HttpsError("data-loss", "Task data is missing.");
  }

  const updates: { [key: string]: any } = {status};

  if (status === true) { // Marked as done
    updates.previousRefreshTimestamp = taskData.refreshTimestamp;
    let now = Date.now();
    if (taskData.refreshTimestamp - now < taskData.refreshDuration / 2) {
      updates.refreshTimestamp += taskData.refreshDuration;
    }
  } else { // Marked as undone
    updates.refreshTimestamp = taskData.previousRefreshTimestamp;
    updates.previousRefreshTimestamp = null;
  }

  await taskRef.update(updates);


  logger.info(`Task ${taskId} in list ${listId} updated by ${email}`);
  return {success: true};
});

/**
 * Invites another user to become an admin of a list by adding their email.
 */
export const inviteAdmin = onCall(callableOptions, async (request) => {
  const requesterEmail = getEmail(request);

  const {listId, email: newAdminEmail} = request.data;
  if (!listId || !newAdminEmail) {
    throw new HttpsError(
      "invalid-argument", "listId and email are required."
    );
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(requesterEmail)) {
    throw new HttpsError(
      "permission-denied", "You are not an admin of this list."
    );
  }

  if (listData.admins.includes(newAdminEmail)) {
    throw new HttpsError("already-exists", "This user is already an admin.");
  }

  await listRef.update({
    admins: FieldValue.arrayUnion(newAdminEmail),
  });

  logger.info(
    `Email ${newAdminEmail} invited to list ${listId} by ${requesterEmail}`
  );
  return {success: true};
});


/**
 * Removes a task from a specified routine list.
 */
export const removeTask = onCall(callableOptions, async (request) => {
  const email = getEmail(request);

  const {listId, taskId} = request.data;
  if (!listId || !taskId) {
    throw new HttpsError(
      "invalid-argument", "listId and taskId are required."
    );
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(email)) {
    throw new HttpsError(
      "permission-denied", "You are not an admin of this list."
    );
  }

  // Also check if the task belongs to the list, as an extra security measure
  const taskRef = db.collection("tasks").doc(taskId);
  const taskDoc = await taskRef.get();
  if (!taskDoc.exists || taskDoc.data()?.listId !== listId) {
    throw new HttpsError(
      "not-found",
      "The task does not exist or does not belong to this list."
    );
  }

  await taskRef.delete();

  logger.info(`Task ${taskId} removed from list ${listId} by ${email}`);
  return {success: true};
});


// --- Scheduled Function for Daily Reset ---

// This function will run every hour.
export const dailyReset = onSchedule("every 1 hours", async () => {
  logger.info("Running daily reset check...");

  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);

  logger.info(
    `Querying for tasks to reset with refreshTimestamp between ${oneHourAgo} and ${now}.`
  );

  const tasksToResetSnapshot = await db.collection("tasks")
    .where("refreshTimestamp", ">=", oneHourAgo)
    .where("refreshTimestamp", "<=", now)
    .get();

  if (tasksToResetSnapshot.empty) {
    logger.info("No tasks to reset at this hour.");
    return;
  }

  const batch = db.batch();
  tasksToResetSnapshot.docs.forEach((doc) => {
    const taskData = doc.data();
    if (taskData) {
      logger.info(`Resetting task ${doc.id}`);
      batch.update(doc.ref, {
        status: false,
        previousRefreshTimestamp: null,
        refreshTimestamp: taskData.refreshTimestamp + taskData.refreshDuration,
      });
    }
  });

  await batch.commit();
  logger.info(`Successfully reset ${tasksToResetSnapshot.size} tasks.`);
  logger.info("Daily reset check finished.");
});

