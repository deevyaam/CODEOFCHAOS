import type { Session, User } from '@supabase/supabase-js';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/config';

import { forgetAccount, rememberSession } from './accounts';
import { PROVIDER_NAME, fetchProviders } from './auth-providers';
import { readConsent, saveConsent, syncConsentToProfile, type ConsentRecord } from './consent';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_kind: 'photo' | 'icon' | 'initials';
  avatar_path: string | null;
  avatar_icon: string | null;
  avatar_color: string | null;
  created_at: string;
  updated_at: string;
};

export type Roles = {
  is_admin: boolean;
  is_moderator: boolean;
  authority_name: string | null;
  authority_verified: boolean;
};

const NO_ROLES: Roles = { is_admin: false, is_moderator: false, authority_name: null, authority_verified: false };

/** What a moderator has paused for this member. Only they and moderators can see it. */
export type Limits = { no_reports: boolean; no_comments: boolean; no_discussion: boolean; reason: string | null };
const NO_LIMITS: Limits = { no_reports: false, no_comments: false, no_discussion: false, reason: null };

type SessionState = {
  ready: boolean;
  consent: ConsentRecord | null;
  session: Session | null;
  user: User | null;
  isGuest: boolean;
  profile: Profile | null;
  roles: Roles;
  limits: Limits;
  /** Moderator, admin or verified authority. */
  isStaff: boolean;
  acceptConsent: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<string | null>;
  signUpEmail: (email: string, password: string, fullName: string) => Promise<string | null>;
  signInOAuth: (provider: 'google' | 'facebook') => Promise<string | null>;
  signInGuest: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);

/**
 * Where sign-in (Google, email links) returns to. Each one must be in Supabase → Authentication → URL Configuration:
 *   web: <origin>/auth-callback · Expo Go: exp(s)://<dev server>/--/auth-callback · app builds: lifepoweredbytech://auth-callback
 */
export function oauthRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/auth-callback`;
  if (isRunningInExpoGo()) {
    // Expo Go can only be reopened through the exp:// (or exps:// for a tunnel) address it loaded the app from.
    // Build it from that address directly: Linking.createURL can fall back to the app's own scheme, which Expo Go can't receive.
    const base = Constants.linkingUri?.match(/^(exps?:\/\/[^/]+)/)?.[1] ?? (Constants.expoConfig?.hostUri ? `exps://${Constants.expoConfig.hostUri}` : null);
    if (base) return `${base}/--/auth-callback`;
  }
  return Linking.createURL('auth-callback');
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Roles>(NO_ROLES);
  const [limits, setLimits] = useState<Limits>(NO_LIMITS);

  const user = session?.user ?? null;
  const isGuest = Boolean(user?.is_anonymous);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u || !isSupabaseConfigured) {
      setProfile(null);
      setRoles(NO_ROLES);
      setLimits(NO_LIMITS);
      return;
    }
    const [{ data: p }, { data: r }, { data: l }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.id).maybeSingle(),
      supabase.from('user_roles').select('*').eq('user_id', u.id).maybeSingle(),
      supabase.from('user_restrictions').select('no_reports,no_comments,no_discussion,reason').eq('user_id', u.id).maybeSingle(),
    ]);
    setProfile((p as Profile | null) ?? null);
    setRoles(r ? { ...NO_ROLES, ...(r as Roles) } : NO_ROLES);
    setLimits(l ? { ...NO_LIMITS, ...(l as Limits) } : NO_LIMITS);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await readConsent();
      const { data } = isSupabaseConfigured ? await supabase.auth.getSession() : { data: { session: null } };
      if (!alive) return;
      setConsent(c);
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      if (alive) setReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => loadProfile(s?.user ?? null), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Keep the saved-account entry and the consent record current.
  useEffect(() => {
    if (!session || session.user.is_anonymous) return;
    rememberSession(session, profile?.full_name ?? null).catch(() => {});
    if (consent) syncConsentToProfile(session.user.id, consent).catch(() => {});
  }, [session, profile?.full_name, consent]);

  const value = useMemo<SessionState>(
    () => ({
      ready,
      consent,
      session,
      user,
      isGuest,
      profile,
      roles,
      limits,
      isStaff: roles.is_admin || roles.is_moderator || roles.authority_verified,
      acceptConsent: async () => setConsent(await saveConsent()),
      refreshProfile: () => loadProfile(user),
      signInEmail: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error?.message ?? null;
      },
      signUpEmail: async (email, password, fullName) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: oauthRedirectUrl() },
        });
        if (error) return error.message;
        if (!data.session) return 'CHECK_EMAIL';
        return null;
      },
      signInOAuth: async (provider) => {
        // Supabase answers a disabled provider with a bare error page on web; catch it here instead.
        const enabled = await fetchProviders();
        if (enabled && !enabled[provider]) return `${PROVIDER_NAME[provider]} sign-in isn't set up yet. Use email or continue as a guest.`;
        const redirectTo = oauthRedirectUrl();
        if (Platform.OS === 'web') {
          const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
          return error?.message ?? null; // the page navigates away; /auth-callback finishes sign-in
        }
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) return error?.message ?? 'Could not start sign-in';
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') return result.type === 'cancel' || result.type === 'dismiss' ? 'CANCELLED' : 'Sign-in did not finish';
        const code = new URL(result.url).searchParams.get('code');
        if (!code) return 'Sign-in did not return a code';
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        return exErr?.message ?? null;
      },
      signInGuest: async () => {
        const { error } = await supabase.auth.signInAnonymously();
        return error?.message ?? null;
      },
      signOut: async () => {
        if (user && !user.is_anonymous) await forgetAccount(user.id);
        // 'local' signs out this device only, so other saved accounts and devices keep working.
        await supabase.auth.signOut({ scope: 'local' });
      },
    }),
    [ready, consent, session, user, isGuest, profile, roles, limits, loadProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

export function displayName(profile: Profile | null, user: User | null) {
  return profile?.full_name?.trim() || user?.email?.split('@')[0] || (user?.is_anonymous ? 'Guest' : 'Member');
}
