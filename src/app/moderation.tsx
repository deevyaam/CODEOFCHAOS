import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Page, Screen, StackHeader } from '@/components/layout';
import { Button, Card, Empty, Notice, Segmented, Text } from '@/components/ui';
import { timeAgo } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

type Flag = {
  id: string;
  target_type: 'report' | 'comment' | 'message';
  target_id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
};
type Target = { text: string; hidden: boolean; reportId?: string } | null;

const REASON: Record<string, string> = {
  spam: 'Spam',
  abuse: 'Abuse',
  personal_info: 'Personal information',
  false_info: 'False information',
  dangerous: 'Dangerous or illegal',
  other: 'Other',
};

export default function Moderation() {
  const { roles } = useSession();
  const { colors } = useTheme();
  const allowed = roles.is_moderator || roles.is_admin;
  const [view, setView] = useState<'open' | 'closed'>('open');
  const [groups, setGroups] = useState<{ key: string; flags: Flag[]; target: Target }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    let q = supabase.from('content_flags').select('*').order('created_at', { ascending: false }).limit(200);
    q = view === 'open' ? q.eq('status', 'open') : q.neq('status', 'open');
    const { data, error: e } = await q;
    if (e) return setError(e.message);
    const flags = (data ?? []) as Flag[];
    const byTarget = new Map<string, Flag[]>();
    flags.forEach((f) => byTarget.set(`${f.target_type}:${f.target_id}`, [...(byTarget.get(`${f.target_type}:${f.target_id}`) ?? []), f]));
    const out = await Promise.all(
      [...byTarget.entries()].map(async ([key, fs]) => ({ key, flags: fs, target: await loadTarget(fs[0]) })),
    );
    setGroups(out);
  }, [allowed, view]);

  useEffect(() => {
    // load() sets state only after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const act = async (f: Flag, action: 'hide' | 'unhide' | 'dismiss') => {
    const { error: e } = await supabase.rpc('moderate', { p_target_type: f.target_type, p_target_id: f.target_id, p_action: action });
    if (e) setError(e.message);
    load();
  };

  if (!allowed) {
    return (
      <Screen>
        <StackHeader title="Moderation" />
        <Empty icon="lock-closed-outline" title="Moderators only" />
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title="Moderation" />
      <Page tab={false}>
        <Segmented value={view} onChange={setView} options={[{ value: 'open', label: 'To review' }, { value: 'closed', label: 'Handled' }]} />
        {error && <View style={{ marginTop: spacing.lg }}><Notice tone="danger"><Text>{error}</Text></Notice></View>}
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {groups === null && <ActivityIndicator color={colors.primary} />}
          {groups?.length === 0 && <Empty icon="checkmark-done-outline" title={view === 'open' ? 'Nothing to review' : 'Nothing handled yet'} />}
          {groups?.map(({ key, flags, target }) => {
            const f = flags[0];
            return (
              <Card key={key} style={{ gap: spacing.sm }}>
                <Text variant="label">
                  {f.target_type === 'report' ? 'Report' : f.target_type === 'comment' ? 'Comment' : 'Discussion message'} · {flags.length} flag{flags.length > 1 ? 's' : ''}
                </Text>
                <Text variant="caption" muted>
                  {[...new Set(flags.map((x) => REASON[x.reason] ?? x.reason))].join(', ')} · {timeAgo(f.created_at)}
                </Text>
                {flags.filter((x) => x.details).map((x) => (
                  <Text key={x.id} variant="caption">“{x.details}”</Text>
                ))}
                <Card style={{ backgroundColor: colors.surfaceMuted, boxShadow: 'none' }}>
                  <Text numberOfLines={6}>{target?.text ?? 'This content no longer exists.'}</Text>
                  {target?.hidden && <Text variant="small" color={colors.danger}>Currently hidden</Text>}
                </Card>
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  {target && !target.hidden && <Button kind="danger" icon="eye-off" title="Hide" onPress={() => act(f, 'hide')} />}
                  {target?.hidden && <Button kind="secondary" icon="eye" title="Unhide" onPress={() => act(f, 'unhide')} />}
                  {f.status === 'open' && <Button kind="ghost" title="Dismiss" onPress={() => act(f, 'dismiss')} />}
                  {target?.reportId && (
                    <Button kind="ghost" title="Open" onPress={() => router.push({ pathname: '/report/[id]', params: { id: target.reportId! } })} />
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      </Page>
    </Screen>
  );
}

async function loadTarget(f: Flag): Promise<Target> {
  if (f.target_type === 'report') {
    const { data } = await supabase.from('reports').select('id,title,description,hidden').eq('id', f.target_id).maybeSingle();
    return data ? { text: `${data.title}\n${data.description}`, hidden: data.hidden, reportId: data.id } : null;
  }
  if (f.target_type === 'comment') {
    const { data } = await supabase.from('report_comments').select('report_id,body,hidden').eq('id', f.target_id).maybeSingle();
    return data ? { text: data.body || '(photo)', hidden: data.hidden, reportId: data.report_id } : null;
  }
  const { data } = await supabase.from('discussion_messages').select('body,hidden,deleted_at').eq('id', f.target_id).maybeSingle();
  return data ? { text: data.deleted_at ? '(deleted by staff)' : data.body || '(photo or video)', hidden: data.hidden } : null;
}
