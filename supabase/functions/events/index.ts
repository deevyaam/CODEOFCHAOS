// Processes public.event_queue: sends Expo push notifications and removes trashed media.
// Called by the database (pg_net) with the shared secret in x-events-secret. Deploy with --no-verify-jwt.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const STATUS_LABEL: Record<string, string> = {
  reported: 'Reported',
  sent: 'Sent to an authority',
  in_progress: 'In progress',
  fixed: 'Fixed',
};
const CATEGORY_LABEL: Record<string, string> = {
  safety: 'Safety',
  transport: 'Transport',
  health: 'Health',
  environment: 'Environment',
  other: 'Other',
};

type Token = {
  token: string;
  user_id: string;
  alert_mode: string;
  alert_town: string | null;
  alert_lat: number | null;
  alert_lng: number | null;
  alert_km: number | null;
  notify_my_reports: boolean;
  notify_me_too: boolean;
};
type Push = { to: string; title: string; body: string; data?: Record<string, unknown>; sound?: 'default' };

Deno.serve(async (req) => {
  if (req.headers.get('x-events-secret') !== Deno.env.get('EVENTS_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const { data: events } = await admin
    .from('event_queue')
    .select('*')
    .is('processed_at', null)
    .lt('attempts', 5)
    .order('id')
    .limit(50);

  let processed = 0;
  for (const ev of events ?? []) {
    try {
      await handle(ev.kind, ev.payload ?? {});
      await admin.from('event_queue').update({ processed_at: new Date().toISOString(), error: null }).eq('id', ev.id);
      processed++;
    } catch (e) {
      await admin
        .from('event_queue')
        .update({ attempts: ev.attempts + 1, error: String(e).slice(0, 500) })
        .eq('id', ev.id);
    }
  }
  return Response.json({ processed });
});

async function handle(kind: string, payload: Record<string, string>) {
  switch (kind) {
    case 'report_created':
      return reportCreated(payload.report_id);
    case 'status_changed':
      return statusChanged(payload.report_id, payload.to);
    case 'comment_added':
      return commentAdded(payload.report_id, payload.author_id);
    case 'test_push':
      return testPush(payload.user_id);
    case 'media_cleanup':
      return mediaCleanup();
  }
}

async function getReport(id: string) {
  const { data } = await admin.from('reports').select('id,title,category,town,lat,lng,hidden').eq('id', id).single();
  return data;
}
async function ownerOf(reportId: string) {
  const { data } = await admin.from('report_owners').select('user_id').eq('report_id', reportId).single();
  return data?.user_id as string | undefined;
}
async function tokensFor(userIds: string[]) {
  if (!userIds.length) return [] as Token[];
  const { data } = await admin.from('push_tokens').select('*').in('user_id', userIds);
  return (data ?? []) as Token[];
}

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function reportCreated(reportId: string) {
  const report = await getReport(reportId);
  if (!report || report.hidden) return;
  const owner = await ownerOf(reportId);
  const { data } = await admin.from('push_tokens').select('*').neq('alert_mode', 'off');
  const matches = ((data ?? []) as Token[]).filter((t) => {
    if (t.user_id === owner) return false;
    if (t.alert_mode === 'everywhere') return true;
    if (t.alert_mode === 'town') return !!report.town && t.alert_town?.toLowerCase() === report.town.toLowerCase();
    if (t.alert_mode === 'near') {
      return (
        report.lat != null && t.alert_lat != null && t.alert_lng != null &&
        km(report.lat, report.lng, t.alert_lat, t.alert_lng) <= (t.alert_km ?? 5)
      );
    }
    return false;
  });
  await send(
    matches.map((t) => ({
      to: t.token,
      title: `New ${CATEGORY_LABEL[report.category] ?? ''} report${report.town ? ` in ${report.town}` : ''}`,
      body: report.title,
      data: { url: `/report/${report.id}` },
      sound: 'default',
    })),
  );
}

async function statusChanged(reportId: string, to: string) {
  const report = await getReport(reportId);
  if (!report) return;
  const owner = await ownerOf(reportId);
  const { data: votes } = await admin.from('report_votes').select('user_id').eq('report_id', reportId);
  const voters = (votes ?? []).map((v) => v.user_id as string).filter((u) => u !== owner);
  const ownerTokens = (await tokensFor(owner ? [owner] : [])).filter((t) => t.notify_my_reports);
  const voterTokens = (await tokensFor(voters)).filter((t) => t.notify_me_too);
  const label = STATUS_LABEL[to] ?? to;
  await send([
    ...ownerTokens.map((t) => ({
      to: t.token,
      title: `Your report is now: ${label}`,
      body: report.title,
      data: { url: `/report/${report.id}` },
    })),
    ...voterTokens.map((t) => ({
      to: t.token,
      title: `A report you backed is now: ${label}`,
      body: report.title,
      data: { url: `/report/${report.id}` },
    })),
  ]);
}

async function commentAdded(reportId: string, authorId: string) {
  const report = await getReport(reportId);
  if (!report) return;
  const owner = await ownerOf(reportId);
  if (!owner || owner === authorId) return;
  const tokens = (await tokensFor([owner])).filter((t) => t.notify_my_reports);
  await send(
    tokens.map((t) => ({
      to: t.token,
      title: 'New comment on your report',
      body: report.title,
      data: { url: `/report/${report.id}` },
    })),
  );
}

async function testPush(userId: string) {
  const tokens = await tokensFor([userId]);
  await send(
    tokens.map((t) => ({
      to: t.token,
      title: 'Test notification',
      body: 'Notifications are working on this phone.',
      data: { url: '/alerts' },
      sound: 'default',
    })),
  );
}

async function mediaCleanup() {
  const { data } = await admin.from('media_trash').select('*').is('deleted_at', null).limit(500);
  const byBucket = new Map<string, { ids: number[]; paths: string[] }>();
  for (const row of data ?? []) {
    const g = byBucket.get(row.bucket) ?? { ids: [], paths: [] };
    g.ids.push(row.id);
    g.paths.push(row.path);
    byBucket.set(row.bucket, g);
  }
  for (const [bucket, g] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(g.paths);
    if (error) throw error;
    await admin.from('media_trash').update({ deleted_at: new Date().toISOString() }).in('id', g.ids);
  }
}

async function send(messages: Push[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Expo push ${res.status}: ${await res.text()}`);
    const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    // Remove tokens for uninstalled apps.
    const dead = (out.data ?? [])
      .map((r, j) => (r.details?.error === 'DeviceNotRegistered' ? chunk[j].to : null))
      .filter(Boolean) as string[];
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  }
}
