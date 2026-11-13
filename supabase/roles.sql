-- People & roles: lets moderators make someone a moderator or a verified authority (or take it back),
-- and limit what a member can do (post reports, comment, use the Discussion).
-- Run after schema.sql and community.sql. Safe to run again.
--
-- Guard rails, all enforced here rather than in the app:
--   * only moderators and admins can change anyone's access;
--   * nobody can change their own access (no self-promotion, no locking yourself out);
--   * admins can only be changed by another admin, and admin itself is never granted from the app;
--   * guests can't be given roles;
--   * every change is written to role_changes, which staff can read and nobody can edit.

-- ─────────────────────────────────────────────────────────────────────────────
-- Limits on a member. Kept apart from user_roles because user_roles is readable by everyone
-- (for badges) and a person's limits are private: only they and moderators can see them.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_restrictions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  no_reports boolean not null default false,
  no_comments boolean not null default false,
  no_discussion boolean not null default false,
  reason text check (char_length(reason) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.user_restrictions enable row level security;

drop policy if exists restrictions_select on public.user_restrictions;
create policy restrictions_select on public.user_restrictions for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('moderator'));
-- No insert/update/delete policies: changes only go through set_user_access().

-- ─────────────────────────────────────────────────────────────────────────────
-- History of every change (who changed whom, to what, and why).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.role_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  changed_by uuid references auth.users (id) on delete set null,
  change jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists role_changes_user_idx on public.role_changes (user_id, created_at desc);
create index if not exists role_changes_by_idx on public.role_changes (changed_by);
alter table public.role_changes enable row level security;

drop policy if exists role_changes_select on public.role_changes;
create policy role_changes_select on public.role_changes for select to authenticated
  using (public.has_role('moderator'));

-- ─────────────────────────────────────────────────────────────────────────────
-- can_do(): false when the signed-in member has been limited for that action.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_do(what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.user_restrictions r
    where r.user_id = auth.uid()
      and case what
        when 'report' then r.no_reports
        when 'comment' then r.no_comments
        when 'discuss' then r.no_discussion
        else false
      end
  )
$$;
revoke all on function public.can_do(text) from public, anon;
grant execute on function public.can_do(text) to authenticated;

-- Enforce the limits on the three ways of posting.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (not public.is_guest() and public.can_do('report'));

drop policy if exists comments_insert on public.report_comments;
create policy comments_insert on public.report_comments for insert to authenticated
  with check (not public.is_guest() and public.can_do('comment'));

drop policy if exists dm_insert on public.discussion_messages;
create policy dm_insert on public.discussion_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_guest() and not hidden and deleted_at is null and deleted_by_role is null
              and public.can_do('discuss'));

-- ─────────────────────────────────────────────────────────────────────────────
-- people_directory(): signed-in members (not guests) with their roles and limits, for staff.
-- No email addresses: names and photos are enough to find someone.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.people_directory(p_search text default null, p_filter text default 'all')
returns table (
  id uuid,
  full_name text,
  avatar_kind text,
  avatar_path text,
  avatar_icon text,
  avatar_color text,
  updated_at timestamptz,
  joined_at timestamptz,
  is_admin boolean,
  is_moderator boolean,
  authority_name text,
  authority_verified boolean,
  no_reports boolean,
  no_comments boolean,
  no_discussion boolean,
  restriction_reason text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('moderator') then
    raise exception 'Only moderators can see this list';
  end if;
  return query
    select p.id, p.full_name, p.avatar_kind::text, p.avatar_path, p.avatar_icon, p.avatar_color, p.updated_at, p.created_at,
           coalesce(r.is_admin, false), coalesce(r.is_moderator, false), r.authority_name, coalesce(r.authority_verified, false),
           coalesce(x.no_reports, false), coalesce(x.no_comments, false), coalesce(x.no_discussion, false), x.reason
    from public.profiles p
    join auth.users u on u.id = p.id and not coalesce(u.is_anonymous, false)
    left join public.user_roles r on r.user_id = p.id
    left join public.user_restrictions x on x.user_id = p.id
    where (coalesce(trim(p_search), '') = '' or p.full_name ilike '%' || replace(replace(trim(p_search), '%', ''), '_', '') || '%')
      and case p_filter
        when 'staff' then coalesce(r.is_admin or r.is_moderator or r.authority_verified, false)
        when 'limited' then coalesce(x.no_reports or x.no_comments or x.no_discussion, false)
        else true
      end
    order by (coalesce(r.is_admin, false) or coalesce(r.is_moderator, false) or coalesce(r.authority_verified, false)) desc,
             lower(coalesce(p.full_name, '')), p.created_at
    limit 200;
end $$;
revoke all on function public.people_directory(text, text) from public, anon;
grant execute on function public.people_directory(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- set_user_access(): the only way to change roles and limits from the app.
--   p_role: 'member' | 'moderator' | 'authority' (authority needs p_authority_name)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_user_access(
  p_user uuid,
  p_role text,
  p_authority_name text,
  p_no_reports boolean,
  p_no_comments boolean,
  p_no_discussion boolean,
  p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  old_roles public.user_roles;
  old_limits public.user_restrictions;
  auth_name text := nullif(trim(coalesce(p_authority_name, '')), '');
  why text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if me is null or not public.has_role('moderator') then
    raise exception 'Only moderators can change people''s access';
  end if;
  if p_user = me then
    raise exception 'You can''t change your own access. Ask another moderator.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user and not coalesce(u.is_anonymous, false)) then
    raise exception 'That person wasn''t found, or is a guest';
  end if;
  if p_role not in ('member', 'moderator', 'authority') then
    raise exception 'Unknown role %', p_role;
  end if;
  if p_role = 'authority' and auth_name is null then
    raise exception 'Enter the name of the authority (for example, the council or ministry)';
  end if;
  if char_length(coalesce(auth_name, '')) > 120 or char_length(coalesce(why, '')) > 300 then
    raise exception 'That text is too long';
  end if;

  select * into old_roles from public.user_roles where user_id = p_user;
  if coalesce(old_roles.is_admin, false) and not public.is_admin() then
    raise exception 'Only an admin can change another admin';
  end if;
  select * into old_limits from public.user_restrictions where user_id = p_user;

  -- Role (admin is left exactly as it was).
  insert into public.user_roles (user_id, is_moderator, authority_name, authority_verified, verified_by, verified_at)
  values (
    p_user,
    p_role = 'moderator',
    case when p_role = 'authority' then auth_name end,
    p_role = 'authority',
    case when p_role = 'authority' then me end,
    case when p_role = 'authority' then now() end
  )
  on conflict (user_id) do update set
    is_moderator = excluded.is_moderator,
    authority_name = excluded.authority_name,
    authority_verified = excluded.authority_verified,
    -- Keep the original verification if they were already this authority.
    verified_by = case when public.user_roles.authority_verified and excluded.authority_verified
                        and public.user_roles.authority_name = excluded.authority_name
                       then public.user_roles.verified_by else excluded.verified_by end,
    verified_at = case when public.user_roles.authority_verified and excluded.authority_verified
                        and public.user_roles.authority_name = excluded.authority_name
                       then public.user_roles.verified_at else excluded.verified_at end;

  -- Limits: keep a row only while at least one limit is on.
  if coalesce(p_no_reports, false) or coalesce(p_no_comments, false) or coalesce(p_no_discussion, false) then
    insert into public.user_restrictions (user_id, no_reports, no_comments, no_discussion, reason, updated_by, updated_at)
    values (p_user, coalesce(p_no_reports, false), coalesce(p_no_comments, false), coalesce(p_no_discussion, false), why, me, now())
    on conflict (user_id) do update set
      no_reports = excluded.no_reports, no_comments = excluded.no_comments, no_discussion = excluded.no_discussion,
      reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  else
    delete from public.user_restrictions where user_id = p_user;
  end if;

  insert into public.role_changes (user_id, changed_by, change)
  values (p_user, me, jsonb_build_object(
    'from', jsonb_build_object(
      'role', case when coalesce(old_roles.is_moderator, false) then 'moderator'
                   when coalesce(old_roles.authority_verified, false) then 'authority' else 'member' end,
      'authority_name', old_roles.authority_name,
      'no_reports', coalesce(old_limits.no_reports, false),
      'no_comments', coalesce(old_limits.no_comments, false),
      'no_discussion', coalesce(old_limits.no_discussion, false)),
    'to', jsonb_build_object(
      'role', p_role,
      'authority_name', case when p_role = 'authority' then auth_name end,
      'no_reports', coalesce(p_no_reports, false),
      'no_comments', coalesce(p_no_comments, false),
      'no_discussion', coalesce(p_no_discussion, false)),
    'reason', why));
end $$;
revoke all on function public.set_user_access(uuid, text, text, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.set_user_access(uuid, text, text, boolean, boolean, boolean, text) to authenticated;
