// Picks the backend: Supabase when the keys are configured (.env.local or
// GitHub variables), otherwise the demo backend stored in this browser.
import { createSupabaseApi } from './supabase.js';
import { createDemoApi } from './demo.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const api = url && key ? createSupabaseApi(url, key) : createDemoApi();

// Back to the PIN screen; the next sign-in lands on the home page.
export function signOut() {
  window.location.hash = '#/jogos';
  return api.signOut();
}
