-- Ansam Moris — community features (run after schema.sql).
-- Discussion room, flags, moderation, assistant chats, push tokens, event queue and media cleanup.

-- ─────────────────────────────────────────────────────────────────────────────
-- Discussion (one public room for signed-in members; guests cannot read it)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.discussion_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 4),
  reply_to uuid references public.discussion_messages (id) on delete set null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists discussion_created_idx on public.discussion_messages (created_at desc);

-- Removed by staff: the row stays (emptied) so the room shows "Message deleted by an admin / a moderator / an authority".
alter table public.discussion_messages add column if not exists deleted_at timestamptz;
alter table public.discussion_messages add column if not exists deleted_by_role text;
alter table public.discussion_messages drop constraint if exists discussion_messages_deleted_by_role_check;
alter table public.discussion_messages add constraint discussion_messages_deleted_by_role_check
  check (deleted_by_role in ('admin', 'moderator', 'authority'));
-- A message needs text or media, unless staff deleted it. (Replaces the original unnamed check.)
alter table public.discussion_messages drop constraint if exists discussion_messages_check;
alter table public.discussion_messages drop constraint if exists discussion_messages_content_check;
alter table public.discussion_messages add constraint discussion_messages_content_check
  check (char_length(body) > 0 or jsonb_array_length(media) > 0 or deleted_at is not null);

-- One reaction per person per message.
create table if not exists public.discussion_reactions (
  message_id uuid not null references public.discussion_messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji text not null check (public.is_reaction_emoji(emoji)),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.discussion_messages enable row level security;
alter table public.discussion_reactions enable row level security;

drop policy if exists dm_select on public.discussion_messages;
create policy dm_select on public.discussion_messages for select to authenticated using (
  not public.is_guest() and (
    (not hidden and not public.has_blocked(user_id)) or user_id = (select auth.uid()) or public.has_role('moderator')
  )
);
drop policy if exists dm_insert on public.discussion_messages;
create policy dm_insert on public.discussion_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_guest() and not hidden and deleted_at is null and deleted_by_role is null);
drop policy if exists dm_delete on public.discussion_messages;
create policy dm_delete on public.discussion_messages for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists dr_select on public.discussion_reactions;
create policy dr_select on public.discussion_reactions for select to authenticated using (not public.is_guest());
drop policy if exists dr_insert on public.discussion_reactions;
create policy dr_insert on public.discussion_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_guest());
drop policy if exists dr_update on public.discussion_reactions;
create policy dr_update on public.discussion_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not public.is_guest());
drop policy if exists dr_delete on public.discussion_reactions;
create policy dr_delete on public.discussion_reactions for delete to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Flags and moderation
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.content_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('report', 'comment', 'message')),
  target_id uuid not null,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'personal_info', 'false_info', 'dangerous', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

alter table public.content_flags enable row level security;
drop policy if exists flags_insert on public.content_flags;
create policy flags_insert on public.content_flags for insert to authenticated
  with check (reporter_id = (select auth.uid()) and not public.is_guest() and status = 'open');
drop policy if exists flags_select on public.content_flags;
create policy flags_select on public.content_flags for select to authenticated
  using (reporter_id = (select auth.uid()) or public.has_role('moderator'));

-- moderate(): hide / unhide content and close the flags on it. Moderators and admins only.
create or replace function public.moderate(p_target_type text, p_target_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('moderator') then
    raise exception 'Moderators only';
  end if;
  if p_action not in ('hide', 'unhide', 'dismiss') then
    raise exception 'Unknown action %', p_action;
  end if;

  if p_action in ('hide', 'unhide') then
    perform set_config('lpt.trusted', 'on', true);
    if p_target_type = 'report' then
      update public.reports set hidden = (p_action = 'hide') where id = p_target_id;
    elsif p_target_type = 'comment' then
      update public.report_comments set hidden = (p_action = 'hide') where id = p_target_id;
    elsif p_target_type = 'message' then
      update public.discussion_messages set hidden = (p_action = 'hide') where id = p_target_id;
    else
      raise exception 'Unknown target %', p_target_type;
    end if;
    perform set_config('lpt.trusted', 'off', true);
  end if;

  update public.content_flags
    set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
        handled_by = auth.uid(), handled_at = now()
    where target_type = p_target_type and target_id = p_target_id and status = 'open';
end $$;
revoke all on function public.moderate(text, uuid, text) from public, anon;
grant execute on function public.moderate(text, uuid, text) to authenticated;

-- staff_delete_message(): moderators/admins and verified authorities remove a normal member's Discuss message.
-- The text, media and reactions are removed; the row stays so everyone sees who removed it (by role, not by name).
-- Messages from other staff can't be removed this way.
create or replace function public.staff_delete_message(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_role text;
begin
  if public.is_admin() then
    v_role := 'admin';
  elsif public.has_role('moderator') then
    v_role := 'moderator';
  elsif public.has_role('authority') then
    v_role := 'authority';
  else
    raise exception 'Only moderators and verified authorities can delete other people''s messages';
  end if;

  select user_id into v_author from public.discussion_messages where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Message not found or already deleted';
  end if;
  -- Admins can remove anyone's message except another admin's; moderators and authorities only members' messages.
  if v_role = 'admin' then
    if exists (select 1 from public.user_roles r where r.user_id = v_author and r.is_admin) then
      raise exception 'Messages from admins can''t be deleted this way';
    end if;
  elsif exists (
    select 1 from public.user_roles r
    where r.user_id = v_author and (r.is_admin or r.is_moderator or r.authority_verified)
  ) then
    raise exception 'Messages from moderators and authorities can''t be deleted this way';
  end if;

  -- Queue the message's photos/videos for removal from Storage.
  insert into public.media_trash (bucket, path)
    select 'discussion-media', item ->> 'path'
    from public.discussion_messages m, jsonb_array_elements(m.media) item
    where m.id = p_id and item ? 'path';
  if found then
    insert into public.event_queue (kind, payload) values ('media_cleanup', '{}'::jsonb);
  end if;

  update public.discussion_messages
    set body = '', media = '[]'::jsonb, deleted_at = now(), deleted_by_role = v_role
    where id = p_id;
  delete from public.discussion_reactions where message_id = p_id;
  update public.content_flags
    set status = 'actioned', handled_by = auth.uid(), handled_at = now()
    where target_type = 'message' and target_id = p_id and status = 'open';
end $$;
revoke all on function public.staff_delete_message(uuid) from public, anon;
grant execute on function public.staff_delete_message(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assistant chats (guests' chats are never saved: insert blocked for guests)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.assistant_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 120),
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_chats enable row level security;
drop policy if exists chats_own on public.assistant_chats;
create policy chats_own on public.assistant_chats for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not public.is_guest());
drop trigger if exists chats_touch on public.assistant_chats;
create trigger chats_touch before update on public.assistant_chats
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Push tokens (one row per device) with that device's alert area
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  token text primary key check (token like 'ExponentPushToken[%' or token like 'ExpoPushToken[%'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text check (platform in ('ios', 'android')),
  alert_mode text not null default 'everywhere' check (alert_mode in ('everywhere', 'town', 'near', 'off')),
  alert_town text check (char_length(alert_town) <= 60),
  alert_lat double precision,
  alert_lng double precision,
  alert_km integer check (alert_km between 1 and 100),
  notify_my_reports boolean not null default true,
  notify_me_too boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists push_own on public.push_tokens;
create policy push_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not public.is_guest());
-- Discuss notifications: on by default, and at most one every 10 minutes per phone (see the events function).
-- Older databases created the queue before 'message_added' existed; widen the allowed kinds.
alter table public.event_queue drop constraint if exists event_queue_kind_check;
alter table public.event_queue add constraint event_queue_kind_check
  check (kind in ('report_created', 'status_changed', 'comment_added', 'message_added', 'test_push', 'media_cleanup'));
alter table public.push_tokens add column if not exists notify_discussion boolean not null default true;
alter table public.push_tokens add column if not exists discussion_pushed_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- Event queue → "events" Edge Function (via pg_net). No direct access from the app.
-- Needs two Vault secrets (see README): events_url and events_secret.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.event_queue (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('report_created', 'status_changed', 'comment_added', 'message_added', 'test_push', 'media_cleanup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text
);
alter table public.event_queue enable row level security; -- no policies: service role only

create table if not exists public.media_trash (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.media_trash enable row level security; -- no policies: service role only

create or replace function public.dispatch_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'events_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'events_secret';
  if v_url is null or v_secret is null then
    return null; -- not configured yet; rows stay queued and are picked up on the next call
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-events-secret', v_secret),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 5000
  );
  return null;
end $$;
drop trigger if exists event_queue_dispatch on public.event_queue;
create trigger event_queue_dispatch after insert on public.event_queue
  for each row execute function public.dispatch_event();

-- Notification triggers.
create or replace function public.queue_report_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.event_queue (kind, payload)
    values ('report_created', jsonb_build_object('report_id', new.id));
  elsif new.status is distinct from old.status then
    insert into public.event_queue (kind, payload)
    values ('status_changed', jsonb_build_object('report_id', new.id, 'from', old.status, 'to', new.status));
  end if;
  return null;
end $$;
drop trigger if exists reports_queue_events on public.reports;
create trigger reports_queue_events after insert or update of status on public.reports
  for each row execute function public.queue_report_events();

create or replace function public.queue_comment_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status_change is null and not new.by_reporter then
    insert into public.event_queue (kind, payload)
    values ('comment_added', jsonb_build_object('report_id', new.report_id, 'comment_id', new.id, 'author_id', new.user_id));
  end if;
  return null;
end $$;
drop trigger if exists comments_queue_event on public.report_comments;
create trigger comments_queue_event after insert on public.report_comments
  for each row execute function public.queue_comment_event();

-- New Discuss message → notify members who want it (the events function applies blocks and the 10-minute limit).
create or replace function public.queue_message_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.hidden and new.deleted_at is null then
    insert into public.event_queue (kind, payload)
    values ('message_added', jsonb_build_object('message_id', new.id, 'author_id', new.user_id));
  end if;
  return null;
end $$;
drop trigger if exists messages_queue_event on public.discussion_messages;
create trigger messages_queue_event after insert on public.discussion_messages
  for each row execute function public.queue_message_event();

-- Test notification for the caller's own devices.
create or replace function public.send_test_push() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_guest() then
    raise exception 'Sign in to test notifications';
  end if;
  insert into public.event_queue (kind, payload) values ('test_push', jsonb_build_object('user_id', auth.uid()));
end $$;
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;

-- Media cleanup: when content with media is deleted, queue its files for removal from Storage.
create or replace function public.trash_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_bucket text := tg_argv[0];
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(old.media, '[]'::jsonb)) loop
    if item ? 'path' then
      insert into public.media_trash (bucket, path) values (v_bucket, item ->> 'path');
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(coalesce(old.media, '[]'::jsonb))) then
    insert into public.event_queue (kind, payload) values ('media_cleanup', '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists reports_trash_media on public.reports;
create trigger reports_trash_media after delete on public.reports
  for each row execute function public.trash_media('report-media');
drop trigger if exists comments_trash_media on public.report_comments;
create trigger comments_trash_media after delete on public.report_comments
  for each row execute function public.trash_media('report-media');
drop trigger if exists messages_trash_media on public.discussion_messages;
create trigger messages_trash_media after delete on public.discussion_messages
  for each row execute function public.trash_media('discussion-media');

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['reports', 'report_comments', 'report_comment_reactions', 'discussion_messages', 'discussion_reactions'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Function privileges. Supabase grants EXECUTE on new public functions to everyone; tighten that.
--   trigger functions: nobody calls them directly (triggers still fire)
--   RLS helpers: signed-in users only (policies evaluate them as the caller)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'touch_updated_at()', 'handle_new_user()', 'reports_before_insert()', 'reports_after_insert()',
    'reports_guard_update()', 'report_votes_count()', 'report_comments_before_insert()',
    'report_comments_after_change()', 'dispatch_event()', 'queue_report_events()',
    'queue_comment_event()', 'queue_message_event()', 'trash_media()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'is_guest()', 'is_admin()', 'has_role(text)', 'has_blocked(uuid)', 'owns_report(uuid)',
    'nearby_open_reports(text, double precision, double precision, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
