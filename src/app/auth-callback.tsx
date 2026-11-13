// OAuth / email-confirmation landing route. On web the provider redirects here with ?code=…;
// on phones the in-app browser returns here and sign-in has usually finished already.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(params.error_description ?? null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (params.code) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(params.code);
          if (e && alive) return setError(e.message);
        }
      }
      if (alive && !params.error_description) router.replace('/');
    })();
    return () => {
      alive = false;
    };
  }, [params.code, params.error_description]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: 16, backgroundColor: colors.background }}>
      {error ? (
        <>
          <Text variant="headline">Sign-in didn’t finish</Text>
          <Text muted style={{ textAlign: 'center' }}>{error}</Text>
          <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text muted>Signing you in…</Text>
        </>
      )}
    </View>
  );
}
