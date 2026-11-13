// Accounts saved on this device, so people can switch between them.
// Refresh tokens are kept in the secure keystore on phones (localStorage on web).
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type SavedAccount = { userId: string; email: string; name: string | null };

const LIST_KEY = 'lpt.accounts';
const tokenKey = (id: string) => `lpt.acct.${id.replace(/[^a-zA-Z0-9]/g, '')}`;

async function getItem(key: string) {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') return localStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}
async function removeItem(key: string) {
  if (Platform.OS === 'web') return localStorage.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

export async function listAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await getItem(LIST_KEY);
    return raw ? (JSON.parse(raw) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

/** Remember the current (non-guest) session so it can be switched back to later. */
export async function rememberSession(session: Session, name: string | null) {
  const u = session.user;
  if (u.is_anonymous || !u.email) return;
  const list = await listAccounts();
  const next = [{ userId: u.id, email: u.email, name }, ...list.filter((a) => a.userId !== u.id)].slice(0, 5);
  await setItem(LIST_KEY, JSON.stringify(next));
  await setItem(tokenKey(u.id), session.refresh_token);
}

export async function forgetAccount(userId: string) {
  const list = await listAccounts();
  await setItem(LIST_KEY, JSON.stringify(list.filter((a) => a.userId !== userId)));
  await removeItem(tokenKey(userId)).catch(() => {});
}

/** Switch to a saved account. Returns false if its sign-in has expired (the person must sign in again). */
export async function switchTo(userId: string): Promise<boolean> {
  const refresh = await getItem(tokenKey(userId));
  if (!refresh) return false;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refresh });
  if (error || !data.session) {
    await forgetAccount(userId);
    return false;
  }
  await setItem(tokenKey(userId), data.session.refresh_token);
  return true;
}
