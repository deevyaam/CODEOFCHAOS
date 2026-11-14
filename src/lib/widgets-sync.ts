// Keeps the home screen widgets up to date. Widgets can't fetch data themselves, so the app sends them a
// snapshot when it opens and when it comes back to the foreground (at most every 10 minutes).
// Only public information goes to widgets: report titles, statuses and pin colours, never names or exact places.
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import NearbyWidget from '@/widgets/nearby-widget';
import QuickWidget from '@/widgets/quick-widget';
import { EMPTY_NEARBY, EMPTY_QUICK, type NearbyWidgetProps, type QuickWidgetProps } from '@/widgets/types';

import { DEFAULT_TOWN, TOWNS, distanceKm } from './places';
import { getPrefs } from './prefs';
import { fetchReports, pinOf, statusInfo } from './reports';
import { describe, fetchForecast, getPositionWithTimeout } from './weather';

const MIN_GAP_MS = 10 * 60 * 1000;
let lastRun = 0;

const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export async function refreshWidgets(signedIn: boolean, force = false) {
  if (Platform.OS === 'web') return;
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return;
  lastRun = Date.now();

  const prefs = getPrefs();
  const area = prefs.alertArea;
  const needPosition = area.mode === 'near' || prefs.weatherTown === 'my-location';
  const me = needPosition ? await getPositionWithTimeout() : null;
  const areaLabel = area.mode === 'town' ? `in ${area.town}` : area.mode === 'near' ? `within ${area.km} km` : 'in Mauritius';
  const updated = clock();

  // Weather for the same place the Home weather card shows.
  let weather: Pick<NearbyWidgetProps, 'place' | 'temp' | 'condition' | 'rain'> = { place: '', temp: '', condition: '', rain: '' };
  try {
    const town = prefs.weatherTown === 'my-location' ? null : (TOWNS.find((t) => t.name === prefs.weatherTown) ?? DEFAULT_TOWN);
    const at = town ?? me ?? DEFAULT_TOWN;
    const f = await fetchForecast(at.lat, at.lng);
    const rain = f.hourly[0]?.rainChance ?? 0;
    weather = {
      place: town ? town.name : me ? 'Near you' : DEFAULT_TOWN.name,
      temp: `${Math.round(f.current.temp)}°`,
      condition: describe(f.current.code, f.current.isDay).label,
      rain: rain >= 10 ? `Rain ${rain}%` : '',
    };
  } catch {
    // Offline: keep the reports part.
  }

  if (!signedIn) {
    QuickWidget.updateSnapshot({ ...EMPTY_QUICK, areaLabel, updated });
    NearbyWidget.updateSnapshot({ ...EMPTY_NEARBY, ...weather, areaLabel, updated });
    return;
  }

  let open: Awaited<ReturnType<typeof fetchReports>> = [];
  try {
    open = await fetchReports({ status: 'open', sort: 'newest', limit: 200 });
  } catch {
    return; // keep the last snapshot rather than showing an empty one
  }
  const inArea = open.filter((r) => {
    if (r.hidden) return false;
    if (area.mode === 'town') return (r.town ?? '').toLowerCase() === area.town.toLowerCase();
    if (area.mode === 'near') return !!me && r.lat != null && r.lng != null && distanceKm(me, { lat: r.lat, lng: r.lng }) <= area.km;
    return true;
  });

  const quick: QuickWidgetProps = { signedIn: true, count: inArea.length, areaLabel: area.mode === 'everywhere' ? 'in Mauritius' : areaLabel, updated };
  const nearby: NearbyWidgetProps = {
    signedIn: true,
    ...weather,
    areaLabel: area.mode === 'everywhere' ? 'in Mauritius' : areaLabel,
    updated,
    items: inArea.slice(0, 3).map((r) => {
      const pin = pinOf(r);
      return { id: r.id, title: r.title.length > 40 ? `${r.title.slice(0, 39)}…` : r.title, status: statusInfo(r.status).label, color: pin.color };
    }),
  };
  QuickWidget.updateSnapshot(quick);
  NearbyWidget.updateSnapshot(nearby);
}

/** Refreshes the widgets when the app starts, when it returns to the foreground, and when sign-in changes. */
export function useWidgetSync(ready: boolean, signedIn: boolean) {
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    refreshWidgets(signedIn, true).catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshWidgets(signedIn).catch(() => {});
    });
    return () => sub.remove();
  }, [ready, signedIn]);
}
