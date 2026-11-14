// Device preferences, remembered on this device only (AsyncStorage → localStorage on web).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { DEFAULT_QUICK_REACTIONS } from './discussion';

export type Appearance = 'light' | 'dark' | 'device';
/** Assistant reply language: auto = same as the question; mfe = Kreol Morisien. */
export type AssistantLanguage = 'auto' | 'mfe' | 'fr' | 'en';
export type AlertArea =
  | { mode: 'everywhere' }
  | { mode: 'town'; town: string }
  | { mode: 'near'; km: number };

export type Prefs = {
  appearance: Appearance;
  font: 'google-sans' | 'system';
  homeLayout: 'list' | 'grid';
  weatherStyle: 'dynamic' | 'static';
  /** Town name from TOWNS, or 'my-location'. */
  weatherTown: string;
  weatherCollapsed: boolean;
  quickReactions: string[];
  anonymousDefault: boolean;
  appLock: boolean;
  approveImportant: boolean;
  alertArea: AlertArea;
  notifyMyReports: boolean;
  notifyMeToo: boolean;
  notifyDiscussion: boolean;
  discussLastRead: string | null;
  assistantLanguage: AssistantLanguage;
};

export const DEFAULT_PREFS: Prefs = {
  appearance: 'device',
  font: 'google-sans',
  homeLayout: 'list',
  weatherStyle: 'dynamic',
  weatherTown: 'my-location',
  weatherCollapsed: false,
  quickReactions: DEFAULT_QUICK_REACTIONS,
  anonymousDefault: false,
  appLock: false,
  approveImportant: false,
  alertArea: { mode: 'everywhere' },
  notifyMyReports: true,
  notifyMeToo: true,
  notifyDiscussion: true,
  discussLastRead: null,
  assistantLanguage: 'auto',
};

const KEY = 'lpt.prefs.v1';
let state: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

export async function loadPrefs(): Promise<Prefs> {
  if (loaded) return state;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // Storage can be unavailable (private browsing); fall back to defaults.
  }
  loaded = true;
  listeners.forEach((l) => l());
  return state;
}

export function getPrefs(): Prefs {
  return state;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  state = { ...state, [key]: value };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}

export function usePref<K extends keyof Prefs>(key: K): Prefs[K] {
  return useSyncExternalStore(
    subscribe,
    () => state[key],
    () => state[key],
  );
}
