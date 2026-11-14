// One-time server setup for push notifications (run it yourself; it changes the live Supabase project):
//   node scripts/setup-push.mjs
//
// 1. Creates a random shared secret and stores it as the EVENTS_SECRET of the "events" Edge Function.
// 2. Stores the same secret and the function's address in Supabase Vault (events_secret, events_url), so the
//    database can call the function whenever a report is created, changes status or gets a comment.
// 3. Marks events that piled up before this setup as skipped, so nobody gets old notifications later.
// 4. Sends a test event through the whole chain and reports whether it was processed.
//
// The secret is never printed. Run it again to rotate the secret.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const ref = env.EXPO_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (!ref) {
  console.error('✖ EXPO_PUBLIC_SUPABASE_URL in .env is missing or not a Supabase project address.');
  process.exit(1);
}

const secret = randomBytes(32).toString('hex');
const dir = mkdtempSync(join(tmpdir(), 'lpt-push-'));
const supabase = (...args) => execFileSync('npx', ['supabase', ...args, `--remote=${ref}`, '--yes'], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const sql = (text) => {
  const f = join(dir, 'q.sql');
  writeFileSync(f, text, { mode: 0o600 });
  return supabase('db', 'query', '--file', f);
};

try {
  const envFile = join(dir, 'events.env');
  writeFileSync(envFile, `EVENTS_SECRET=${secret}\n`, { mode: 0o600 });
  supabase('secrets', 'set', '--env-file', envFile);
  console.log('✔ EVENTS_SECRET set on the events function');

  const url = `https://${ref}.supabase.co/functions/v1/events`;
  sql(`do $$
declare r record;
begin
  for r in select * from (values ('events_url', '${url}'), ('events_secret', '${secret}')) as t(n, v) loop
    if exists (select 1 from vault.secrets where name = r.n) then
      perform vault.update_secret((select id from vault.secrets where name = r.n), r.v);
    else
      perform vault.create_secret(r.v, r.n);
    end if;
  end loop;
end $$;`);
  console.log('✔ Vault: events_url and events_secret stored');

  const skipped = sql(`with s as (
  update public.event_queue set processed_at = now(), error = 'skipped: queued before push was set up'
  where processed_at is null and created_at < now() returning 1)
select count(*) as skipped from s;`);
  console.log(`✔ Old queued events skipped: ${skipped.match(/"skipped":\s*"?(\d+)|│\s*(\d+)\s*│/)?.slice(1).find(Boolean) ?? '?'}`);

  // Test: a push for a user with no phones registered goes through the whole chain without notifying anyone.
  sql(`insert into public.event_queue (kind, payload) values ('test_push', '{"user_id":"00000000-0000-0000-0000-000000000000"}');`);
  await new Promise((r) => setTimeout(r, 6000));
  const check = sql(`select processed_at is not null as ok, attempts, error from public.event_queue where kind = 'test_push' order by id desc limit 1;`);
  // The CLI prints JSON when piped and a table in a terminal; accept both.
  if (/"ok":\s*true|│\s*true\s*│/.test(check)) console.log('✔ Test event processed: the database → events function → Expo chain works');
  else console.log(`✖ Test event not processed yet. Details:\n${check}`);
} catch (e) {
  console.error('✖ Setup failed:', (e.stderr || e.message || String(e)).toString().replaceAll(secret, '***').slice(0, 800));
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
