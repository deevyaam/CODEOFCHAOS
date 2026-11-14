import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export type LiveFix = { lat: number; lng: number; /** metres, when the device reports it */ accuracy: number | null };
export type LiveStatus = 'starting' | 'on' | 'denied' | 'unavailable';

/** Give up if no position arrives in this time (e.g. no GPS signal, or a desktop without location). */
const FIRST_FIX_TIMEOUT_MS = 15_000;

/**
 * Follows the device's live position while `active` (foreground only, high accuracy).
 * `onFix` runs for every update; `onFail` runs once if permission is refused or no position arrives.
 * Watching stops as soon as `active` turns false or the component unmounts.
 */
export function useLiveLocation(
  active: boolean,
  onFix: (fix: LiveFix) => void,
  onFail?: (reason: 'denied' | 'unavailable') => void,
) {
  const [status, setStatus] = useState<LiveStatus>('starting');
  const [fix, setFix] = useState<LiveFix | null>(null);
  // Latest callbacks without restarting the watch when the parent re-renders.
  const handlers = useRef({ onFix, onFail });
  useEffect(() => {
    handlers.current = { onFix, onFail };
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let gotFix = false;
    let sub: Location.LocationSubscription | null = null;

    const fail = (reason: 'denied' | 'unavailable') => {
      if (cancelled) return;
      cancelled = true;
      sub?.remove();
      setStatus(reason);
      handlers.current.onFail?.(reason);
    };
    const timer = setTimeout(() => {
      if (!gotFix) fail('unavailable');
    }, FIRST_FIX_TIMEOUT_MS);

    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm !== 'granted') return fail('denied');
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
          (loc) => {
            if (cancelled) return;
            gotFix = true;
            const next: LiveFix = { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? null };
            setFix(next);
            setStatus('on');
            handlers.current.onFix(next);
          },
          () => {
            if (!gotFix) fail('unavailable');
          },
        );
        if (cancelled) s.remove();
        else sub = s;
      } catch {
        fail('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub?.remove();
      setStatus('starting');
    };
  }, [active]);

  return { status: active ? status : null, fix: active ? fix : null };
}
