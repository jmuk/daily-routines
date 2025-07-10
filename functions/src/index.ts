import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";
import { utcToZonedTime, format } from "date-fns-tz";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const auth = getAuth();

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

// Helper to get UID, faking it for the emulator if necessary
function getUid(request: any): string {
    let uid = request.auth?.uid;
    if (isEmulator && !uid) {
        logger.warn("EMULATOR MODE: Faking UID for request.");
        return "fake-admin-uid";
    }
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    return uid;
}


// --- Callable Functions ---

/**
 * Creates a new routine list for the authenticated user.
 */
export const createRoutineList = onCall(async (request) => {
  const uid = getUid(request);

  const { name, timezone } = request.data;
  if (!name || !timezone) {
    throw new HttpsError("invalid-argument", "Name and timezone are required.");
  }

  const newList = {
    name,
    timezone,
    admins: [uid], // The creator is the first admin
    tasks: [],
  };

  const listRef = await db.collection("routine_lists").add(newList);
  logger.info(`New list created by ${uid} with ID: ${listRef.id}`);
  return { listId: listRef.id };
});

/**
 * Fetches all routine lists where the current user is an admin.
 */
export const getRoutineLists = onCall(async (request) => {
  const uid = getUid(request);
  const snapshot = await db.collection("routine_lists").where("admins", "array-contains", uid).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

/**
 * Fetches the details of a single routine list.
 */
export const getRoutineListDetails = onCall(async (request) => {
    const uid = getUid(request);

    const { listId } = request.data;
    if (!listId) {
        throw new HttpsError("invalid-argument", "The 'listId' argument is required.");
    }

    const listDoc = await db.collection("routine_lists").doc(listId).get();
    if (!listDoc.exists) {
        throw new HttpsError("not-found", "The specified list does not exist.");
    }

    const listData = listDoc.data();
    if (!listData?.admins.includes(uid)) {
        throw new HttpsError("permission-denied", "You are not an admin of this list.");
    }

    return { id: listDoc.id, ...listData };
});


/**
 * Adds a new task to a specified routine list.
 */
export const addTask = onCall(async (request) => {
  const uid = getUid(request);

  const { listId, description, refreshTime } = request.data;
  if (!listId || !description || !refreshTime) {
    throw new HttpsError("invalid-argument", "listId, description, and refreshTime are required.");
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(uid)) {
    throw new HttpsError("permission-denied", "You are not an admin of this list.");
  }

  const newTask = {
    id: uuidv4(), // Generate a v4 UUID
    description,
    status: false,
    refreshTime, // e.g., "06:00"
  };

  await listRef.update({
    tasks: FieldValue.arrayUnion(newTask),
  });

  logger.info(`Task added to list ${listId} by ${uid}`);
  return { taskId: newTask.id };
});

/**
 * Updates the status of a task in a routine list.
 */
export const updateTaskStatus = onCall(async (request) => {
  const uid = getUid(request);

  const { listId, taskId, status } = request.data;
  if (!listId || !taskId || typeof status !== "boolean") {
    throw new HttpsError("invalid-argument", "listId, taskId, and a boolean status are required.");
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(uid)) {
    throw new HttpsError("permission-denied", "You are not an admin of this list.");
  }

  const newTasks = listData.tasks.map((task: any) => {
    if (task.id === taskId) {
      return { ...task, status };
    }
    return task;
  });

  await listRef.update({ tasks: newTasks });
  logger.info(`Task ${taskId} in list ${listId} updated by ${uid}`);
  return { success: true };
});

/**
 * Invites another user to become an admin of a list.
 */
export const inviteAdmin = onCall(async (request) => {
  const uid = getUid(request);

  const { listId, email } = request.data;
  if (!listId || !email) {
    throw new HttpsError("invalid-argument", "listId and email are required.");
  }

  const listRef = db.collection("routine_lists").doc(listId);
  const listDoc = await listRef.get();
  const listData = listDoc.data();

  if (!listData || !listData.admins.includes(uid)) {
    throw new HttpsError("permission-denied", "You are not an admin of this list.");
  }

  // Find the user by email
  try {
    const userRecord = await auth.getUserByEmail(email);
    const newAdminUid = userRecord.uid;

    if (listData.admins.includes(newAdminUid)) {
        throw new HttpsError("already-exists", "This user is already an admin.");
    }

    await listRef.update({
      admins: FieldValue.arrayUnion(newAdminUid),
    });

    logger.info(`User ${newAdminUid} invited to list ${listId} by ${uid}`);
    return { success: true };
  } catch (error) {
    logger.error("Error inviting admin:", error);
    throw new HttpsError("not-found", "The user with that email was not found.");
  }
});


// --- Scheduled Function for Daily Reset ---

// This function will run every hour.
export const dailyReset = onSchedule("every 1 hours", async () => {
    logger.info("Running daily reset check...");

    const nowUtc = new Date();

    const listsSnapshot = await db.collection("routine_lists").get();
    if (listsSnapshot.empty) {
        logger.info("No routine lists to process.");
        return;
    }

    for (const doc of listsSnapshot.docs) {
        const list = doc.data();
        const listRef = doc.ref;
        const timezone = list.timezone || "UTC"; // Default to UTC if no timezone

        try {
            const nowInListTimezone = utcToZonedTime(nowUtc, timezone);
            const currentHourInListTimezone = parseInt(format(nowInListTimezone, 'HH', { timeZone: timezone }));

            let needsUpdate = false;
            const newTasks = list.tasks.map((task: any) => {
                if (task.status === true) {
                    const [taskHour] = task.refreshTime.split(':').map(Number);
                    if (taskHour === currentHourInListTimezone) {
                        needsUpdate = true;
                        return { ...task, status: false };
                    }
                }
                return task;
            });

            if (needsUpdate) {
                await listRef.update({ tasks: newTasks });
                logger.info(`Reset tasks for list ${doc.id} in timezone ${timezone}`);
            }
        } catch (error) {
            logger.error(`Failed to process list ${doc.id} with timezone ${timezone}.`, error);
        }
    }
    logger.info("Daily reset check finished.");
});