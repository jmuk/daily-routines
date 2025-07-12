
<script lang="ts">
  import { user } from '../lib/userStore';
  import { auth } from '../lib/firebase';
  import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

  async function signIn() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign-in error", error);
      alert("Failed to sign in. See console for details.");
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }
</script>

<header>
  <h1>Daily Routines</h1>
  <div id="auth-container">
    {#if $user}
      <p id="user-info">Welcome, {$user.displayName}</p>
      <button id="sign-out" class="auth-button" on:click={handleSignOut}>Sign Out</button>
    {:else}
      <button id="sign-in" class="auth-button" on:click={signIn}>Sign in with Google</button>
    {/if}
  </div>
</header>
