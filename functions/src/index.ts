import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { toZonedTime } from "date-fns-tz";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

// Helper to get user's email, faking it for the emulator if necessary
function getEmail(request: any): string {
    if (isEmulator && !request.auth?.token.email) {
        logger.warn("EMULATOR MODE: Faking email for request.");
        return "admin@example.com";
    }
    const email = request.auth?.token.email;
    if (!email) {
        throw new HttpsError("unauthenticated", "You must be logged in with an email.");
    }
    return email;
}

/**
 * Converts a local time string (e.g., "21:00") and a timezone
 * into the corresponding hour in UTC.
 * @param {string} refreshTime Local time in "HH:mm" format.
 * @param {string} timezone IANA timezone name.
 * @return {number} The hour (0-23) in UTC.
 */
function convertLocalTimeToUtcHour(refreshTime: string, timezone: string): number {
    const [hour, minute] = refreshTime.split(':').map(Number);
    const now = new Date();

    // Create a date object for today in the specified timezone with the given time
    const localDate = toZonedTime(now, timezone);
    localDate.setHours(hour, minute, 0, 0);

    // Convert that zoned time to a UTC date object
    const utcDate = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));

    // Return the UTC hour
    return utcDate.getUTCHours();
}


// --- Callable Functions ---

/**
 * Creates a new routine list for the authenticated user.
 */
export const createRoutineList = onCall(async (request) => {
  const email = getEmail(request);

  const { name, timezone } = request.data;
  if (!name || !timezone) {
    throw new HttpsError("invalid-argument", "Name and timezone are required.");
  }

  const newList = {
    name,
    timezone,
    admins: [email], // The creator is the first admin
  };

  const listRef = await db.collection("routine_lists").add(newList);
  logger.info(`New list created by ${email} with ID: ${listRef.id}`);
  return { listId: listRef.id };
});

/**
 * Fetches all routine lists where the current user is an admin.
 */
export const getRoutineLists = onCall(async (request) => {
  const email = getEmail(request);
  const snapshot = await db.collection("routine_lists").where("admins", "array-contains", email).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

/**
 * Fetches the details of a single routine list, including its tasks.
 */
export const getRoutineListDetails = onCall(async (request) => {
    const email = getEmail(request);

    const { listId } = request.data;
    if (!listId) {
        throw new HttpsError("invalid-argument", "The 'listId' argument is required.");
    }

    const listDoc = await db.collection("routine_lists").doc(listId).get();
    if (!listDoc.exists) {
        throw new HttpsError("not-found", "The specified list does not exist.");
    }

    const listData = listDoc.data();
    if (!listData?.admins.includes(email)) {
        throw new HttpsError("permission-denied", "You are not an admin of this list.");
    }

    // Fetch tasks for this list
    const tasksSnapshot = await db.collection("tasks").where("listId", "==", listId).get();
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { id: listDoc.id, ...listData, tasks };
});


/**
 * Adds a new task to a specified routine list.
 */
export const addTask = onCall(async (request) => {
  const email = getEmail(request);

  const { listId, description, refreshTime } = request.data;
  if (!listId || !description || !refreshTime) {
    throw new HttpsError("invalid-argument", "listId, description, and refreshTime are required.");
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(email)) {
    throw new HttpsError("permission-denied", "You are not an admin of this list.");
  }

  const newTask = {
    listId,
    description,
    status: false,
    refreshTime, // e.g., "06:00" - kept for display purposes
    refreshHourUtc: convertLocalTimeToUtcHour(refreshTime, listData.timezone),
  };

  const taskRef = await db.collection("tasks").add(newTask);
  logger.info(`Task added to list ${listId} by ${email} with new task ID: ${taskRef.id}`);
  return { taskId: taskRef.id };
});

/**
 * Updates the status of a task.
 */
export const updateTaskStatus = onCall(async (request) => {
  const email = getEmail(request);

  const { listId, taskId, status } = request.data;
  if (!listId || !taskId || typeof status !== "boolean") {
    throw new HttpsError("invalid-argument", "listId, taskId, and a boolean status are required.");
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(email)) {
    throw new HttpsError("permission-denied", "You are not an admin of this list.");
  }

  const taskRef = db.collection("tasks").doc(taskId);
  await taskRef.update({ status });

  logger.info(`Task ${taskId} in list ${listId} updated by ${email}`);
  return { success: true };
});

/**
 * Invites another user to become an admin of a list by adding their email.
 */
export const inviteAdmin = onCall(async (request) => {
  const requesterEmail = getEmail(request);

  const { listId, email: newAdminEmail } = request.data;
  if (!listId || !newAdminEmail) {
    throw new HttpsError("invalid-argument", "listId and email are required.");
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(requesterEmail)) {
    throw new HttpsError("permission-denied", "You are not an admin of this list.");
  }

  if (listData.admins.includes(newAdminEmail)) {
      throw new HttpsError("already-exists", "This user is already an admin.");
  }

  await listRef.update({
    admins: FieldValue.arrayUnion(newAdminEmail),
  });

  logger.info(`Email ${newAdminEmail} invited to list ${listId} by ${requesterEmail}`);
  return { success: true };
});


// --- Scheduled Function for Daily Reset ---

// This function will run every hour.
export const dailyReset = onSchedule("every 1 hours", async () => {
    logger.info("Running daily reset check...");

    const currentUtcHour = new Date().getUTCHours();
    logger.info(`Current UTC hour is ${currentUtcHour}. Querying for tasks to reset.`);

    const tasksToResetSnapshot = await db.collection("tasks")
        .where("status", "==", true)
        .where("refreshHourUtc", "==", currentUtcHour)
        .get();

    if (tasksToResetSnapshot.empty) {
        logger.info("No tasks to reset at this hour.");
        return;
    }

    const batch = db.batch();
    tasksToResetSnapshot.docs.forEach(doc => {
        logger.info(`Resetting task ${doc.id}`);
        batch.update(doc.ref, { status: false });
    });

    await batch.commit();
    logger.info(`Successfully reset ${tasksToResetSnapshot.size} tasks.`);
    logger.info("Daily reset check finished.");
});