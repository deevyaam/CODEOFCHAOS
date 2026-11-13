// "Safer streets" layer: where and when safety reports cluster, and where street lights are out.
// Everything is computed from real reports on the device — no invented scores.
import { nearestTown } from './places';
import type { Report } from './reports';

export type TimeWindow = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';

export const TIME_WINDOWS: { value: TimeWindow; label: string; hours: string }[] = [
  { value: 'all', label: 'All day', hours: '' },
  { value: 'morning', label: 'Morning', hours: '6–12' },
  { value: 'afternoon', label: 'Afternoon', hours: '12–18' },
  { value: 'evening', label: 'Evening', hours: '18–22' },
  { value: 'night', label: 'Night', hours: '22–6' },
];

/** How far back the heat layer looks. */
export const HEAT_DAYS = 90;
/** Open this long or more counts as overdue. */
export const OVERDUE_DAYS = 30;

const DAY = 86_400_000;

/** Hour of day in Mauritius (UTC+4, no daylight saving) when it happened, or when it was reported. */
export function hourInMauritius(r: Pick<Report, 'occurred_at' | 'created_at'>) {
  return (new Date(r.occurred_at ?? r.created_at).getUTCHours() + 4) % 24;
}

export function inWindow(hour: number, w: TimeWindow) {
  switch (w) {
    case 'morning':
      return hour >= 6 && hour < 12;
    case 'afternoon':
      return hour >= 12 && hour < 18;
    case 'evening':
      return hour >= 18 && hour < 22;
    case 'night':
      return hour >= 22 || hour < 6;
    default:
      return true;
  }
}

const DARK_WORDS =
  /(street ?light|lamp ?post|light(s)? (is |are )?(out|off|broken)|no light|dark (road|street|spot|area)|lampadaire|éclairage|eclairage|lalimier|lalimyer|lampe|fer nwar|nwar)/i;

/** A report about a street light being out or an unlit spot. */
export function isDarkSpot(r: Pick<Report, 'pin_icon' | 'title' | 'description'>) {
  return r.pin_icon === 'bulb' || DARK_WORDS.test(`${r.title} ${r.description}`);
}

export function daysOpen(r: Pick<Report, 'created_at' | 'status'>, now = Date.now()) {
  return r.status === 'fixed' ? 0 : Math.floor((now - new Date(r.created_at).getTime()) / DAY);
}

export function isOverdue(r: Pick<Report, 'created_at' | 'status'>, now = Date.now()) {
  return r.status !== 'fixed' && daysOpen(r, now) >= OVERDUE_DAYS;
}

export type Zone = {
  id: string;
  lat: number;
  lng: number;
  /** metres */
  radius: number;
  color: string;
  opacity: number;
  label: string;
  /** Number of reports in the zone (heat layer only). */
  count?: number;
};

export const HEAT_LEVELS = [
  { min: 1, label: '1 report', color: '#F2B33D' },
  { min: 2, label: '2–3', color: '#E8664A' },
  { min: 4, label: '4 or more', color: '#C8372D' },
] as const;

const levelFor = (n: number) => [...HEAT_LEVELS].reverse().find((l) => n >= l.min) ?? HEAT_LEVELS[0];

const CELL_DEG = 0.0036; // ≈ 400 m north–south

export type HeatResult = { zones: Zone[]; total: number; busiest: { town: string; count: number } | null };

/** Group safety reports from the last 90 days into ~400 m squares for the chosen time of day. */
export function safetyHeat(reports: Report[], window: TimeWindow, now = Date.now()): HeatResult {
  const cells = new Map<string, { n: number; lat: number; lng: number }>();
  let total = 0;
  for (const r of reports) {
    if (r.category !== 'safety' || r.lat == null || r.lng == null) continue;
    if (now - new Date(r.created_at).getTime() > HEAT_DAYS * DAY) continue;
    if (!inWindow(hourInMauritius(r), window)) continue;
    total++;
    const lngDeg = CELL_DEG / Math.cos((r.lat * Math.PI) / 180);
    const key = `${Math.floor(r.lat / CELL_DEG)}:${Math.floor(r.lng / lngDeg)}`;
    const c = cells.get(key) ?? { n: 0, lat: 0, lng: 0 };
    // Weight by "me too" so a problem many people confirm counts for more, up to 3×.
    const w = 1 + Math.min(2, r.me_too_count / 3);
    c.lat = (c.lat * c.n + r.lat * w) / (c.n + w);
    c.lng = (c.lng * c.n + r.lng * w) / (c.n + w);
    c.n += w;
    cells.set(key, c);
  }
  const zones: Zone[] = [...cells.entries()].map(([key, c]) => {
    const count = Math.round(c.n);
    const level = levelFor(count);
    return {
      id: `heat-${key}`,
      lat: c.lat,
      lng: c.lng,
      radius: 180 + 70 * Math.min(count, 6),
      color: level.color,
      opacity: 0.22 + 0.06 * Math.min(count, 4),
      label: `${count} safety report${count === 1 ? '' : 's'} near ${nearestTown(c).name}`,
      count,
    };
  });
  const top = zones.reduce<Zone | null>((a, z) => (!a || (z.count ?? 0) > (a.count ?? 0) ? z : a), null);
  return {
    zones,
    total,
    busiest: top ? { town: nearestTown(top).name, count: top.count ?? 0 } : null,
  };
}

export const DARK_COLOR = '#5B4FC4';

/** Open street-light / unlit-area reports, as halos plus their pins. */
export function darkSpots(reports: Report[]) {
  const spots = reports.filter((r) => r.status !== 'fixed' && r.lat != null && r.lng != null && isDarkSpot(r));
  const zones: Zone[] = spots.map((r) => ({
    id: `dark-${r.id}`,
    lat: r.lat!,
    lng: r.lng!,
    radius: 140,
    color: DARK_COLOR,
    opacity: 0.35,
    label: `Dark spot: ${r.title}`,
  }));
  return { spots, zones };
}
