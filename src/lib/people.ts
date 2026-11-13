// People & roles (moderators only). All changes go through the set_user_access() database function,
// which enforces the rules: moderators only, never your own access, admins only by admins, and a logged history.
import type { Profile } from './session';
import { supabase } from './supabase';

export type Role = 'member' | 'moderator' | 'authority';
export type PeopleFilter = 'all' | 'staff' | 'limited';

export type Person = Pick<Profile, 'id' | 'full_name' | 'avatar_kind' | 'avatar_path' | 'avatar_icon' | 'avatar_color' | 'updated_at'> & {
  joined_at: string;
  is_admin: boolean;
  is_moderator: boolean;
  authority_name: string | null;
  authority_verified: boolean;
  no_reports: boolean;
  no_comments: boolean;
  no_discussion: boolean;
  restriction_reason: string | null;
};

export type Access = {
  role: Role;
  authorityName: string;
  noReports: boolean;
  noComments: boolean;
  noDiscussion: boolean;
  reason: string;
};

export type Change = {
  id: number;
  created_at: string;
  changed_by: string | null;
  changer: string;
  change: {
    from: ChangeState;
    to: ChangeState;
    reason: string | null;
  };
};
type ChangeState = { role: Role; authority_name: string | null; no_reports: boolean; no_comments: boolean; no_discussion: boolean };

export const ROLE_INFO: Record<Role, { label: string; hint: string }> = {
  member: { label: 'Member', hint: 'Can report, comment and chat. No extra powers.' },
  moderator: { label: 'Moderator', hint: 'Reviews flagged posts and can change people’s access.' },
  authority: { label: 'Authority', hint: 'A council, ministry or service. Can update a report’s progress.' },
};

export const LIMIT_INFO = {
  noReports: { label: 'Post new reports', off: 'reports' },
  noComments: { label: 'Comment on reports', off: 'comments' },
  noDiscussion: { label: 'Write in the Discussion', off: 'Discussion messages' },
} as const;

export const roleOf = (p: Pick<Person, 'is_moderator' | 'authority_verified'>): Role =>
  p.is_moderator ? 'moderator' : p.authority_verified ? 'authority' : 'member';

export const isLimited = (p: Pick<Person, 'no_reports' | 'no_comments' | 'no_discussion'>) =>
  p.no_reports || p.no_comments || p.no_discussion;

export const accessOf = (p: Person): Access => ({
  role: roleOf(p),
  authorityName: p.authority_name ?? '',
  noReports: p.no_reports,
  noComments: p.no_comments,
  noDiscussion: p.no_discussion,
  reason: p.restriction_reason ?? '',
});

export async function fetchPeople(search: string, filter: PeopleFilter) {
  const { data, error } = await supabase.rpc('people_directory', { p_search: search.trim() || null, p_filter: filter });
  if (error) throw error;
  return (data ?? []) as Person[];
}

export async function fetchPerson(id: string): Promise<Person | null> {
  const [{ data: p }, { data: r }, { data: x }] = await Promise.all([
    supabase.from('profiles').select('id,full_name,avatar_kind,avatar_path,avatar_icon,avatar_color,updated_at,created_at').eq('id', id).maybeSingle(),
    supabase.from('user_roles').select('is_admin,is_moderator,authority_name,authority_verified').eq('user_id', id).maybeSingle(),
    supabase.from('user_restrictions').select('no_reports,no_comments,no_discussion,reason').eq('user_id', id).maybeSingle(),
  ]);
  if (!p) return null;
  return {
    ...(p as Omit<Person, 'joined_at'> & { created_at: string }),
    joined_at: (p as { created_at: string }).created_at,
    is_admin: !!r?.is_admin,
    is_moderator: !!r?.is_moderator,
    authority_name: r?.authority_name ?? null,
    authority_verified: !!r?.authority_verified,
    no_reports: !!x?.no_reports,
    no_comments: !!x?.no_comments,
    no_discussion: !!x?.no_discussion,
    restriction_reason: x?.reason ?? null,
  };
}

export async function saveAccess(userId: string, a: Access) {
  const { error } = await supabase.rpc('set_user_access', {
    p_user: userId,
    p_role: a.role,
    p_authority_name: a.role === 'authority' ? a.authorityName.trim() : null,
    p_no_reports: a.noReports,
    p_no_comments: a.noComments,
    p_no_discussion: a.noDiscussion,
    p_reason: a.noReports || a.noComments || a.noDiscussion ? a.reason.trim() || null : null,
  });
  if (error) throw error;
}

export async function fetchHistory(userId: string): Promise<Change[]> {
  const { data } = await supabase
    .from('role_changes')
    .select('id,created_at,changed_by,change')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Omit<Change, 'changer'>[];
  const ids = [...new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id,full_name').in('id', ids);
    (ps ?? []).forEach((p) => names.set(p.id as string, (p.full_name as string | null)?.trim() || 'A moderator'));
  }
  return rows.map((r) => ({ ...r, changer: (r.changed_by && names.get(r.changed_by)) || 'A moderator' }));
}

/** One plain sentence per change, e.g. "Made Moderator · Paused comments". */
export function describeChange(c: Change['change']) {
  const out: string[] = [];
  const { from, to } = c;
  if (from.role !== to.role || (to.role === 'authority' && from.authority_name !== to.authority_name)) {
    out.push(to.role === 'member' ? `Made a Member (was ${ROLE_INFO[from.role].label})` : to.role === 'authority' ? `Made Authority: ${to.authority_name}` : 'Made Moderator');
  }
  (['no_reports', 'no_comments', 'no_discussion'] as const).forEach((k) => {
    const what = k === 'no_reports' ? 'reports' : k === 'no_comments' ? 'comments' : 'Discussion messages';
    if (from[k] !== to[k]) out.push(to[k] ? `Paused ${what}` : `Allowed ${what} again`);
  });
  return out.length ? out.join(' · ') : 'Saved with no change';
}
