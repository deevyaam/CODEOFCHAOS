import { useEffect, useState } from 'react';

import type { Profile } from './session';
import { supabase } from './supabase';

export type PublicProfile = Pick<Profile, 'id' | 'full_name' | 'avatar_kind' | 'avatar_path' | 'avatar_icon' | 'avatar_color' | 'updated_at'> & {
  badge?: 'moderator' | 'authority' | 'admin' | null;
  authority_name?: string | null;
};

const cache = new Map<string, PublicProfile>();

export async function loadProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  const missing = [...new Set(ids)].filter((id) => id && !cache.has(id));
  if (missing.length) {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,avatar_kind,avatar_path,avatar_icon,avatar_color,updated_at').in('id', missing),
      supabase.from('user_roles').select('*').in('user_id', missing),
    ]);
    for (const p of (profiles ?? []) as PublicProfile[]) {
      const r = roles?.find((x) => x.user_id === p.id);
      const badge = r?.is_admin ? 'admin' : r?.is_moderator ? 'moderator' : r?.authority_verified ? 'authority' : null;
      cache.set(p.id, { ...p, badge, authority_name: r?.authority_verified ? r.authority_name : null });
    }
  }
  return new Map(ids.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)!]));
}

export function useProfiles(ids: string[]) {
  const [map, setMap] = useState<Map<string, PublicProfile>>(new Map());
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    loadProfiles(key.split(',')).then(setMap);
  }, [key]);
  return map;
}

export function badgeLabel(p?: PublicProfile | null) {
  if (!p?.badge) return null;
  if (p.badge === 'authority') return p.authority_name ? `Verified · ${p.authority_name}` : 'Verified authority';
  return p.badge === 'admin' ? 'Admin' : 'Moderator';
}
