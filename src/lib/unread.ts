// Unread count for the Discuss tab badge: messages from others newer than the last time Discuss was open.
import { useEffect, useState } from 'react';

import { usePref } from './prefs';
import { useSession } from './session';
import { supabase } from './supabase';

export function useDiscussUnread() {
  const { user, isGuest } = useSession();
  const lastRead = usePref('discussLastRead');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || isGuest) return;
    let alive = true;
    const load = async () => {
      let q = supabase
        .from('discussion_messages')
        .select('id', { count: 'exact', head: true })
        .neq('user_id', user.id);
      if (lastRead) q = q.gt('created_at', lastRead);
      const { count: c } = await q;
      if (alive) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel('discuss-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discussion_messages' }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [user, isGuest, lastRead]);

  return user && !isGuest ? count : 0;
}
