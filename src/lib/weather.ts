// Open-Meteo forecast (no API key) plus sun and moon maths for the weather scene.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { IconName } from '@/components/ui';

import { DEFAULT_TOWN, TOWNS, nearestTown } from './places';

export type Forecast = {
  place: string;
  isMyLocation: boolean;
  fellBack: boolean;
  lat: number;
  lng: number;
  current: {
    temp: number;
    feels: number;
    code: number;
    cloud: number; // %
    precip: number; // mm
    wind: number; // km/h
    windDir: number;
    isDay: boolean;
  };
  hourly: { time: string; temp: number; code: number; rainChance: number }[];
  daily: { date: string; min: number; max: number; code: number; rainChance: number; sunrise: string; sunset: string }[];
  fetchedAt: number;
};

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';

export async function fetchForecast(lat: number, lng: number): Promise<Omit<Forecast, 'place' | 'isMyLocation' | 'fellBack'>> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: 'temperature_2m,apparent_temperature,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'Indian/Mauritius',
    forecast_days: '6',
  });
  const res = await fetch(`${URL_BASE}?${params}`);
  if (!res.ok) throw new Error(`Weather service error ${res.status}`);
  const j = await res.json();
  const nowIdx = Math.max(0, (j.hourly.time as string[]).findIndex((t) => new Date(t + ':00+04:00').getTime() >= Date.now() - 30 * 60_000));
  return {
    lat,
    lng,
    current: {
      temp: j.current.temperature_2m,
      feels: j.current.apparent_temperature,
      code: j.current.weather_code,
      cloud: j.current.cloud_cover,
      precip: j.current.precipitation,
      wind: j.current.wind_speed_10m,
      windDir: j.current.wind_direction_10m,
      isDay: j.current.is_day === 1,
    },
    hourly: (j.hourly.time as string[]).slice(nowIdx, nowIdx + 12).map((t, i) => ({
      time: t,
      temp: j.hourly.temperature_2m[nowIdx + i],
      code: j.hourly.weather_code[nowIdx + i],
      rainChance: j.hourly.precipitation_probability[nowIdx + i] ?? 0,
    })),
    daily: (j.daily.time as string[]).slice(0, 5).map((d, i) => ({
      date: d,
      min: j.daily.temperature_2m_min[i],
      max: j.daily.temperature_2m_max[i],
      code: j.daily.weather_code[i],
      rainChance: j.daily.precipitation_probability_max[i] ?? 0,
      sunrise: j.daily.sunrise[i],
      sunset: j.daily.sunset[i],
    })),
    fetchedAt: Date.now(),
  };
}

const LOCATION_TIMEOUT_MS = 10_000;

/** Current position, or null if permission is refused or it doesn't answer within 10 seconds. */
export async function getPositionWithTimeout(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), LOCATION_TIMEOUT_MS)),
    ]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

export function useForecast(town: string) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let place = TOWNS.find((t) => t.name === town) ?? DEFAULT_TOWN;
        let isMyLocation = false;
        let fellBack = false;
        let coords = { lat: place.lat, lng: place.lng };
        if (town === 'my-location') {
          const pos = await getPositionWithTimeout();
          if (pos) {
            coords = pos;
            isMyLocation = true;
            place = nearestTown(pos);
          } else {
            fellBack = true; // fall back to Port Louis
            place = DEFAULT_TOWN;
            coords = { lat: place.lat, lng: place.lng };
          }
        }
        const f = await fetchForecast(coords.lat, coords.lng);
        if (alive) {
          setData({ ...f, place: place.name, isMyLocation, fellBack });
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the weather');
      }
    })();
    const refresh = setInterval(() => setNonce((n) => n + 1), 20 * 60_000);
    return () => {
      alive = false;
      clearInterval(refresh);
    };
  }, [town, nonce]);

  return { data, error, retry: () => setNonce((n) => n + 1) };
}

// WMO weather codes → description and icon.
export function describe(code: number, isDay = true): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Clear', icon: isDay ? 'sunny' : 'moon' };
  if (code <= 2) return { label: 'Partly cloudy', icon: isDay ? 'partly-sunny' : 'cloudy-night' };
  if (code === 3) return { label: 'Cloudy', icon: 'cloudy' };
  if (code <= 48) return { label: 'Fog', icon: 'cloudy' };
  if (code <= 57) return { label: 'Drizzle', icon: 'rainy' };
  if (code <= 67) return { label: 'Rain', icon: 'rainy' };
  if (code <= 77) return { label: 'Snow', icon: 'snow' };
  if (code <= 82) return { label: 'Showers', icon: 'rainy' };
  return { label: 'Thunderstorm', icon: 'thunderstorm' };
}

export function rainIntensity(code: number, precip: number) {
  if (code >= 95) return 1;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return Math.min(1, 0.45 + precip / 6);
  if (code >= 51 && code <= 57) return 0.25;
  return precip > 0 ? Math.min(0.6, precip / 4) : 0;
}

// ── Sun & moon ──────────────────────────────────────────────────────────────

const rad = Math.PI / 180;

/** Solar elevation in degrees (NOAA approximation), good to ~1°. */
export function sunElevation(date: Date, lat: number, lng: number) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = 23.439 * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lng) * rad;
  const ha = lst - ra;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  return el / rad;
}

/** 0 = new moon, 0.5 = full moon, 1 = next new moon. */
export function moonPhase(date: Date) {
  const synodic = 29.530588853;
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - known) / 86400000;
  return (((days / synodic) % 1) + 1) % 1;
}

export function moonPhaseName(p: number) {
  if (p < 0.03 || p > 0.97) return 'New moon';
  if (p < 0.22) return 'Waxing crescent';
  if (p < 0.28) return 'First quarter';
  if (p < 0.47) return 'Waxing gibbous';
  if (p < 0.53) return 'Full moon';
  if (p < 0.72) return 'Waning gibbous';
  if (p < 0.78) return 'Last quarter';
  return 'Waning crescent';
}

/** Fraction of the day between sunrise and sunset (0..1), or <0 / >1 at night. */
export function dayProgress(now: Date, sunrise: string, sunset: string) {
  const rise = new Date(sunrise + ':00+04:00').getTime();
  const set = new Date(sunset + ':00+04:00').getTime();
  return (now.getTime() - rise) / (set - rise);
}

export function formatClock(iso: string) {
  return iso.slice(11, 16);
}
