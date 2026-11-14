import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanEnv(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^["']+|["']+$/g, '').trim();
}

const supabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('your-supabase-anon-key') &&
    (supabaseUrl.startsWith('https://') || supabaseUrl.startsWith('http://'))
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;
