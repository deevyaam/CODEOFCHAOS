// Consent gate: age 16+ and acceptance of the terms, once per terms version.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

/** Bump this when the Terms or Privacy policy change materially; everyone is asked again. */
export const TERMS_VERSION = '2026-11-13';
export const MIN_AGE = 16;

const KEY = 'lpt.consent';

export type ConsentRecord = { version: string; at: string };

export async function readConsent(): Promise<ConsentRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const rec = raw ? (JSON.parse(raw) as ConsentRecord) : null;
    return rec?.version === TERMS_VERSION ? rec : null;
  } catch {
    return null;
  }
}

export async function saveConsent(): Promise<ConsentRecord> {
  const rec = { version: TERMS_VERSION, at: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(rec)).catch(() => {});
  return rec;
}

/** Record the consent on the signed-in member's profile (guests have no profile row to keep). */
export async function syncConsentToProfile(userId: string, rec: ConsentRecord) {
  await supabase
    .from('profiles')
    .update({ consent_version: rec.version, consented_at: rec.at })
    .eq('id', userId)
    .neq('consent_version', rec.version);
}
