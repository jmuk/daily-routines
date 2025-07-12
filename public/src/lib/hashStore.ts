import { readable } from 'svelte/store';

function getHash() {
  return window.location.hash || '#/';
}

export const hash = readable(getHash(), (set) => {
  const handler = () => set(getHash());
  
  window.addEventListener('hashchange', handler);
  
  return () => {
    window.removeEventListener('hashchange', handler);
  };
});
