import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// This async function ensures Firebase is initialized before any other code uses it.
async function initializeFirebase() {
  // If already initialized, return the existing app instance.
  if (getApps().length) {
    return getApp();
  }

  let config;
  // When deployed to Firebase Hosting, the config is available at a special URL.
  // This is the recommended way to get the config in production.
  if (import.meta.env.PROD) {
    const response = await fetch('/__/firebase/init.json');
    config = await response.json();
  } else {
    // For local development, we use placeholder values.
    // The emulators will intercept calls, so real keys are not needed.
    config = {
      apiKey: "emulator-api-key",
      authDomain: "localhost",
      projectId: "daily-routines-98925", // From .firebaserc
    };
  }
  
  return initializeApp(config);
}

// Use top-level await to get the initialized Firebase app instance.
const app = await initializeFirebase();
const auth = getAuth(app);
const functions = getFunctions(app);

// In development mode, connect to the running Firebase emulators.
if (import.meta.env.DEV) {
  console.log("Development mode: Connecting to Firebase Emulators.");
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "localhost", 5001);
}

// Export the initialized services for use in other parts of the app.
export { auth, functions };