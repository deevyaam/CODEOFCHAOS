// App-wide configuration. Values in angle brackets are placeholders that have not been confirmed yet;
// the legal pages highlight them and the deploy script refuses to publish while any remain.
import Constants from 'expo-constants';

export const APP_NAME = 'Life Powered by Tech';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.length > 20;

/** Contact address shown in About, legal pages and "report a problem". */
export const CONTACT_EMAIL = '<YOUR_CONTACT_EMAIL>';
/** Who runs the service (data controller), shown in the legal notice. */
export const OPERATOR_NAME = '<YOUR_NAME_AND_TEAM>';
/** Region of the Supabase project (shown in the privacy policy), e.g. "EU (Frankfurt)". */
export const DATA_REGION = '<YOUR_SUPABASE_REGION>';

/** Values substituted into src/content/legal.ts. */
export const LEGAL_TOKENS: Record<string, string> = {
  APP_NAME: APP_NAME,
  CONTACT_EMAIL: CONTACT_EMAIL,
  OPERATOR_NAME: OPERATOR_NAME,
  DATA_REGION: DATA_REGION,
};

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
export const EAS_PROJECT_ID: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
  Constants.easConfig?.projectId;

export function isPlaceholder(value: string) {
  return /^<[A-Z0-9_]+>$/.test(value.trim());
}

export const EMERGENCY_NUMBERS = [
  { label: 'Police', numbers: ['999', '112'] },
  { label: 'Ambulance (SAMU)', numbers: ['114'] },
  { label: 'Fire', numbers: ['115'] },
] as const;
