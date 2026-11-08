import { createClient } from '@supabase/supabase-js';

export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// Build-time placeholders allow prerendering. Login reports missing configuration.
// The browser always uses the public key; the service role is isolated on the server.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
);
