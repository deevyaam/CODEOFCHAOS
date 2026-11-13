import { useCallback, useEffect, useState } from 'react';

import { Page, Screen, StackHeader } from '@/components/layout';
import { Button, Card, Empty, Row } from '@/components/ui';
import { loadProfiles, type PublicProfile } from '@/lib/profiles';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

export default function Blocked() {
  const { user } = useSession();
  const [people, setPeople] = useState<{ id: string; profile?: PublicProfile }[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id);
    const ids = (data ?? []).map((b) => b.blocked_id as string);
    const map = await loadProfiles(ids);
    setPeople(ids.map((id) => ({ id, profile: map.get(id) })));
  }, [user]);

  useEffect(() => {
    // load() sets state only after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <Screen>
      <StackHeader title="Blocked people" />
      <Page tab={false}>
        {people?.length === 0 && <Empty icon="happy-outline" title="You haven’t blocked anyone" body="When you block someone, you stop seeing their reports, comments and messages." />}
        {!!people?.length && (
          <Card style={{ paddingVertical: spacing.xs }}>
            {people.map((p) => {
              const name = p.profile?.full_name || 'Member';
              return (
                <Row
                  key={p.id}
                  title={name}
                  right={
                    <Button
                      kind="secondary"
                      title="Unblock"
                      onPress={async () => {
                        await supabase.from('user_blocks').delete().eq('blocker_id', user!.id).eq('blocked_id', p.id);
                        load();
                      }}
                    />
                  }
                />
              );
            })}
          </Card>
        )}
      </Page>
    </Screen>
  );
}
