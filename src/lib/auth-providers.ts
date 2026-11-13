// Which sign-in methods are switched on in the Supabase project (public endpoint, no sign-in needed),
// so the app never sends people to a provider that isn't set up.
import { useEffect, useState } from 'react';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/config';

export type Providers = { google: boolean; email: boolean; anonymous: boolean };

let cache: Providers | null = null;

export async function fetchProviders(): Promise<Providers | null> {
  if (cache) return cache;
  if (!isSupabaseConfigured) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!res.ok) return null;
    const j = (await res.json()) as { external?: Record<string, boolean> };
    cache = {
      google: !!j.external?.google,
      email: j.external?.email !== false,
      anonymous: !!j.external?.anonymous_users,
    };
    return cache;
  } catch {
    return null; // offline: show everything and let Supabase report errors
  }
}

/** null while loading or if the check failed (then all buttons are shown). */
export function useProviders() {
  const [providers, setProviders] = useState<Providers | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchProviders().then((p) => alive && setProviders(p));
    return () => {
      alive = false;
    };
  }, []);
  return providers;
}

export const PROVIDER_NAME = { google: 'Google' } as const;
