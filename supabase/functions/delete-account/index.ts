// Deletes the caller's account and everything they posted: reports (incl. anonymous ones they own),
// comments, discussion messages, assistant chats, photos, videos and avatar. Irreversible.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Media = { path?: string }[];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await asUser.auth.getUser();
  const user = auth.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  // Service role is only ever used here, server-side.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const uid = user.id;

  const paths: Record<string, Set<string>> = {
    'report-media': new Set(),
    'discussion-media': new Set(),
    avatars: new Set(),
  };
  const collect = (bucket: string, media: Media | null) =>
    (media ?? []).forEach((m) => m.path && paths[bucket].add(m.path));

  const { data: owned } = await admin.from('report_owners').select('report_id').eq('user_id', uid);
  const reportIds = (owned ?? []).map((o) => o.report_id as string);
  if (reportIds.length) {
    const { data: reports } = await admin.from('reports').select('media').in('id', reportIds);
    reports?.forEach((r) => collect('report-media', r.media as Media));
  }
  const { data: comments } = await admin.from('report_comments').select('media').eq('user_id', uid);
  comments?.forEach((c) => collect('report-media', c.media as Media));
  const { data: messages } = await admin.from('discussion_messages').select('media').eq('user_id', uid);
  messages?.forEach((m) => collect('discussion-media', m.media as Media));

  // Anything else in the person's own folders.
  for (const bucket of Object.keys(paths)) {
    const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
    files?.forEach((f) => paths[bucket].add(`${uid}/${f.name}`));
  }

  const errors: string[] = [];
  const step = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (reportIds.length) await step('reports', admin.from('reports').delete().in('id', reportIds));
  await step('comments', admin.from('report_comments').delete().eq('user_id', uid));
  await step('messages', admin.from('discussion_messages').delete().eq('user_id', uid));
  await step('chats', admin.from('assistant_chats').delete().eq('user_id', uid));
  await step('push tokens', admin.from('push_tokens').delete().eq('user_id', uid));

  for (const [bucket, set] of Object.entries(paths)) {
    const list = [...set];
    for (let i = 0; i < list.length; i += 100) {
      await step(`storage ${bucket}`, admin.storage.from(bucket).remove(list.slice(i, i + 100)));
    }
  }

  if (errors.length) {
    console.error('delete-account partial failure', uid, errors);
    return json({ error: 'Some data could not be removed. Please try again or contact us.' }, 500);
  }

  // Removing the auth user cascades profiles, roles, votes, reactions, flags and blocks.
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
