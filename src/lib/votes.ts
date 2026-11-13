import { useCallback, useEffect, useState } from 'react';

import { myVotes, setMeToo, type Report } from './reports';
import { useSession } from './session';

/** "Me too" state for a list of reports, with optimistic toggling. Guests can't vote. */
export function useVotes(reports: Report[]) {
  const { user, isGuest } = useSession();
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const ids = reports.map((r) => r.id).join(',');

  useEffect(() => {
    if (!user || isGuest || !ids) return;
    myVotes(user.id, ids.split(',')).then(setVoted);
  }, [user, isGuest, ids]);

  const toggle = useCallback(
    async (reportId: string) => {
      if (!user || isGuest) return;
      const on = !voted.has(reportId);
      setVoted((s) => {
        const n = new Set(s);
        if (on) n.add(reportId);
        else n.delete(reportId);
        return n;
      });
      const { error } = await setMeToo(reportId, user.id, on);
      if (error) {
        setVoted((s) => {
          const n = new Set(s);
          if (on) n.delete(reportId);
          else n.add(reportId);
          return n;
        });
      }
    },
    [user, isGuest, voted],
  );

  return { voted, toggle, canVote: !!user && !isGuest };
}
