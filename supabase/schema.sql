-- Life Powered by Tech — core schema (run first, then community.sql).
-- Every table has Row Level Security. Guests (anonymous sign-ins) can read reports but never write.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.

create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles and roles
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 80),
  avatar_kind text not null default 'initials' check (avatar_kind in ('photo', 'icon', 'initials')),
  avatar_path text,
  avatar_icon text check (char_length(avatar_icon) <= 40),
  avatar_color text check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  consent_version text,
  consented_at timestamptz,
  anonymous_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  is_moderator boolean not null default false,
  -- An authority account (e.g. a ministry or council). Only counts once verified by an admin.
  authority_name text,
  authority_verified boolean not null default false,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions (security definer, fixed search_path)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_guest() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.is_admin)
$$;

-- role: 'admin' | 'moderator' | 'authority' (verified authorities only) | 'staff' (any of them)
create or replace function public.has_role(role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid()
      and case role
        when 'admin' then r.is_admin
        when 'moderator' then r.is_moderator or r.is_admin
        when 'authority' then r.authority_verified
        when 'staff' then r.is_admin or r.is_moderator or r.authority_verified
        else false
      end
  )
$$;

create or replace function public.has_blocked(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select other is not null and exists (
    select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = other
  )
$$;

-- The single list of allowed reaction emojis. KEEP IN STEP with REACTION_EMOJIS in src/lib/discussion.ts.
create or replace function public.is_reaction_emoji(e text) returns boolean
language sql immutable set search_path = '' as $$
  select e = any (array[
    '👍','👎','❤️','😂','😮','😢',
    '😡','🙏','👏','🔥','🎉','💯',
    '🤔','😊','😍','🥲','😅','🙌',
    '💪','👀','✅','❌','⚠️','🚨',
    '🚗','🚌','🌧️','☀️','🌊','🌳',
    '🏥','🚓','🗑️','💡','🇲🇺','🤝'
  ])
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reports
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('safety', 'transport', 'health', 'environment', 'other')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'reported' check (status in ('reported', 'sent', 'in_progress', 'fixed')),
  sent_to text check (char_length(sent_to) <= 120),
  -- Location is optional: only stored when the person chooses to attach it.
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  place_name text check (char_length(place_name) <= 160),
  town text check (char_length(town) <= 60),
  occurred_at timestamptz,
  is_anonymous boolean not null default false,
  -- Author is only stored here for named reports. Ownership is always in report_owners.
  author_id uuid references auth.users (id) on delete set null,
  pin_color text check (pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  pin_icon text check (char_length(pin_icon) <= 40),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 6),
  me_too_count integer not null default 0,
  comment_count integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_anonymous or author_id is null),
  check ((lat is null) = (lng is null))
);
create index if not exists reports_created_idx on public.reports (created_at desc);
create index if not exists reports_category_status_idx on public.reports (category, status);

create table if not exists public.report_owners (
  report_id uuid primary key references public.reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade
);
create index if not exists report_owners_user_idx on public.report_owners (user_id);

create or replace function public.owns_report(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.report_owners o where o.report_id = rid and o.user_id = auth.uid())
$$;

create table if not exists public.report_votes (
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table if not exists public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 4),
  -- When set, this comment is a status change (shown in the timeline).
  status_change text check (status_change in ('reported', 'sent', 'in_progress', 'fixed')),
  sent_to text check (char_length(sent_to) <= 120),
  -- Written by the reporter of an anonymous report: user_id is then left empty so they stay anonymous.
  by_reporter boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or jsonb_array_length(media) > 0 or status_change is not null)
);
create index if not exists report_comments_report_idx on public.report_comments (report_id, created_at);

create table if not exists public.report_comment_reactions (
  comment_id uuid not null references public.report_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (public.is_reaction_emoji(emoji)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- New auth user → profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- New report: record the owner, set author only for named reports, and force safe defaults.
create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_guest() then
    raise exception 'Sign in to post a report';
  end if;
  new.author_id := case when new.is_anonymous then null else auth.uid() end;
  new.status := 'reported';
  new.sent_to := null;
  new.me_too_count := 0;
  new.comment_count := 0;
  new.hidden := false;
  return new;
end $$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

create or replace function public.reports_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.report_owners (report_id, user_id) values (new.id, auth.uid());
  return new;
end $$;
drop trigger if exists reports_after_insert on public.reports;
create trigger reports_after_insert after insert on public.reports
  for each row execute function public.reports_after_insert();

-- Owners may edit their own text/media/location, but counters, status and visibility are server-managed.
create or replace function public.reports_guard_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('lpt.trusted', true) = 'on' then
    return new;
  end if;
  new.status := old.status;
  new.sent_to := old.sent_to;
  new.me_too_count := old.me_too_count;
  new.comment_count := old.comment_count;
  new.hidden := old.hidden;
  new.author_id := old.author_id;
  new.is_anonymous := old.is_anonymous;
  new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists reports_guard_update on public.reports;
create trigger reports_guard_update before update on public.reports
  for each row execute function public.reports_guard_update();

-- "Me too" counter.
create or replace function public.report_votes_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('lpt.trusted', 'on', true);
  if tg_op = 'INSERT' then
    update public.reports set me_too_count = me_too_count + 1 where id = new.report_id;
  else
    update public.reports set me_too_count = greatest(me_too_count - 1, 0) where id = old.report_id;
  end if;
  perform set_config('lpt.trusted', 'off', true);
  return null;
end $$;
drop trigger if exists report_votes_count on public.report_votes;
create trigger report_votes_count after insert or delete on public.report_votes
  for each row execute function public.report_votes_count();

-- Comments: permission check for status changes, then apply them to the report.
create or replace function public.report_comments_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_guest() then
    raise exception 'Sign in to comment';
  end if;
  new.user_id := auth.uid();
  new.hidden := false;
  new.by_reporter := public.owns_report(new.report_id);
  -- Keep anonymous reporters anonymous in their own report's timeline.
  if new.by_reporter and exists (select 1 from public.reports r where r.id = new.report_id and r.is_anonymous) then
    new.user_id := null;
  end if;
  if new.status_change is not null then
    if not (public.owns_report(new.report_id) or public.has_role('authority') or public.has_role('moderator')) then
      raise exception 'Only the reporter, verified authorities and moderators can change the status';
    end if;
  else
    new.sent_to := null;
  end if;
  return new;
end $$;
drop trigger if exists report_comments_before_insert on public.report_comments;
create trigger report_comments_before_insert before insert on public.report_comments
  for each row execute function public.report_comments_before_insert();

create or replace function public.report_comments_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('lpt.trusted', 'on', true);
  if tg_op = 'INSERT' then
    update public.reports
      set comment_count = comment_count + case when char_length(new.body) > 0 or jsonb_array_length(new.media) > 0 then 1 else 0 end,
          status = coalesce(new.status_change, status),
          sent_to = case when new.status_change = 'sent' then coalesce(new.sent_to, sent_to) else sent_to end
      where id = new.report_id;
  elsif tg_op = 'DELETE' then
    update public.reports
      set comment_count = greatest(comment_count - case when char_length(old.body) > 0 or jsonb_array_length(old.media) > 0 then 1 else 0 end, 0)
      where id = old.report_id;
  end if;
  perform set_config('lpt.trusted', 'off', true);
  return null;
end $$;
drop trigger if exists report_comments_after_change on public.report_comments;
create trigger report_comments_after_change after insert or delete on public.report_comments
  for each row execute function public.report_comments_after_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.report_owners enable row level security;
alter table public.report_votes enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_comment_reactions enable row level security;

-- profiles: signed-in people (incl. guests) can see names/avatars; you edit only your own.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: everyone can read (to show badges); only admins write.
drop policy if exists roles_select on public.user_roles;
create policy roles_select on public.user_roles for select to authenticated using (true);
drop policy if exists roles_admin_write on public.user_roles;
drop policy if exists roles_admin_insert on public.user_roles;
create policy roles_admin_insert on public.user_roles for insert to authenticated with check (public.is_admin());
drop policy if exists roles_admin_update on public.user_roles;
create policy roles_admin_update on public.user_roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists roles_admin_delete on public.user_roles;
create policy roles_admin_delete on public.user_roles for delete to authenticated using (public.is_admin());

-- user_blocks: your own list only.
drop policy if exists blocks_own on public.user_blocks;
create policy blocks_own on public.user_blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()) and not public.is_guest());

-- reports: anyone signed in (guests too) reads visible reports; hidden ones only by owner and staff.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated using (
  (not hidden and not public.has_blocked(author_id))
  or public.owns_report(id)
  or public.has_role('moderator')
);
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (not public.is_guest());
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (public.owns_report(id) and not public.is_guest())
  with check (public.owns_report(id));
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated
  using (public.owns_report(id) or public.is_admin());

-- report_owners: you can see which reports are yours; nobody else can.
drop policy if exists owners_select on public.report_owners;
create policy owners_select on public.report_owners for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- votes ("me too"): readable for counts of your own; one per person; guests cannot vote.
drop policy if exists votes_select on public.report_votes;
create policy votes_select on public.report_votes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists votes_insert on public.report_votes;
create policy votes_insert on public.report_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_guest());
drop policy if exists votes_delete on public.report_votes;
create policy votes_delete on public.report_votes for delete to authenticated using (user_id = (select auth.uid()));

-- comments
drop policy if exists comments_select on public.report_comments;
create policy comments_select on public.report_comments for select to authenticated using (
  ((not hidden and not public.has_blocked(user_id)) or user_id = (select auth.uid()) or public.has_role('moderator'))
  and exists (select 1 from public.reports r where r.id = report_id)
);
drop policy if exists comments_insert on public.report_comments;
create policy comments_insert on public.report_comments for insert to authenticated
  with check (not public.is_guest());
drop policy if exists comments_delete on public.report_comments;
create policy comments_delete on public.report_comments for delete to authenticated
  using (user_id = (select auth.uid()) or (by_reporter and public.owns_report(report_id)) or public.is_admin());

-- comment reactions
drop policy if exists creact_select on public.report_comment_reactions;
create policy creact_select on public.report_comment_reactions for select to authenticated using (true);
drop policy if exists creact_write on public.report_comment_reactions;
create policy creact_write on public.report_comment_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_guest());
drop policy if exists creact_update on public.report_comment_reactions;
create policy creact_update on public.report_comment_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not public.is_guest());
drop policy if exists creact_delete on public.report_comment_reactions;
create policy creact_delete on public.report_comment_reactions for delete to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets and path-based policies
--   report-media/<user id>/<file>          named reports and comments
--   report-media/anonymous/<uuid>/<file>   anonymous reports (no user id in the path)
--   discussion-media/<user id>/<file>      members only (private bucket, signed URLs)
--   avatars/<user id>/<file>
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('report-media', 'report-media', true, 52428800, array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime']),
  ('discussion-media', 'discussion-media', false, 52428800, array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "report media upload" on storage.objects;
create policy "report media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'report-media' and not public.is_guest() and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (storage.foldername(name))[1] = 'anonymous'
  )
);
drop policy if exists "report media delete own" on storage.objects;
create policy "report media delete own" on storage.objects for delete to authenticated using (
  bucket_id = 'report-media' and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "discussion media read" on storage.objects;
create policy "discussion media read" on storage.objects for select to authenticated using (
  bucket_id = 'discussion-media' and not public.is_guest()
);
drop policy if exists "discussion media upload" on storage.objects;
create policy "discussion media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'discussion-media' and not public.is_guest() and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "discussion media delete own" on storage.objects;
create policy "discussion media delete own" on storage.objects for delete to authenticated using (
  bucket_id = 'discussion-media' and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Storage needs SELECT on your own files to overwrite (upsert) or delete them, even in a public bucket.
drop policy if exists "avatar read own" on storage.objects;
create policy "avatar read own" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "avatar upload" on storage.objects;
create policy "avatar upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and not public.is_guest() and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "avatar update" on storage.objects;
create policy "avatar update" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "avatar delete" on storage.objects;
create policy "avatar delete" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Duplicate detection: open reports of the same type within ~radius metres.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.nearby_open_reports(p_category text, p_lat double precision, p_lng double precision, p_radius_m integer default 300)
returns setof public.reports
language sql stable set search_path = '' as $$
  select r.* from public.reports r
  where r.category = p_category and r.status <> 'fixed' and not r.hidden
    and r.lat is not null
    and r.lat between p_lat - (p_radius_m / 111320.0) and p_lat + (p_radius_m / 111320.0)
    and 2 * 6371000 * asin(sqrt(
          power(sin(radians(r.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(r.lat)) * power(sin(radians(r.lng - p_lng) / 2), 2)
        )) <= p_radius_m
  order by r.created_at desc
  limit 5
$$;
