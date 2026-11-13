import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button, Card, Notice, PressableScale, Segmented, Text } from '@/components/ui';
import { APP_NAME, isSupabaseConfigured } from '@/config';
import { useProviders } from '@/lib/auth-providers';
import { useSession } from '@/lib/session';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

export default function SignIn() {
  const { signInEmail, signUpEmail, signInOAuth, signInGuest } = useSession();
  const { colors, type } = useTheme();
  const providers = useProviders();
  // Hide buttons for providers that are switched off; show both if the check couldn't run.
  const showGoogle = providers?.google ?? true;
  const showFacebook = providers?.facebook ?? true;
  const showGuest = providers?.anonymous ?? true;
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    setMessage(null);
    const err = await fn();
    setBusy(null);
    if (err === 'CHECK_EMAIL') setMessage({ tone: 'info', text: 'Check your email to confirm your account, then sign in.' });
    else if (err && err !== 'CANCELLED') setMessage({ tone: 'danger', text: err });
  };

  const input = [styles.input, type('body'), { backgroundColor: colors.surfaceMuted, color: colors.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.top}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}>
            <Logo size={48} />
          </View>
          <Text variant="title" accessibilityRole="header">{APP_NAME}</Text>
          <Text muted style={{ textAlign: 'center' }}>Sign in to post reports, comment and join the Discussion.</Text>
        </View>

        {!isSupabaseConfigured && (
          <Notice tone="warning">
            <Text variant="label">Supabase is not configured</Text>
            <Text variant="caption" muted>
              Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env and restart the dev server.
            </Text>
          </Notice>
        )}

        {(showGoogle || showFacebook) && (
          <>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              {showGoogle && <SocialButton provider="google" busy={busy === 'google'} onPress={() => run('google', () => signInOAuth('google'))} />}
              {showFacebook && <SocialButton provider="facebook" busy={busy === 'facebook'} onPress={() => run('facebook', () => signInOAuth('facebook'))} />}
            </View>

            <View style={styles.or}>
              <View style={[styles.line, { backgroundColor: colors.separator }]} />
              <Text variant="caption" muted>or with email</Text>
              <View style={[styles.line, { backgroundColor: colors.separator }]} />
            </View>
          </>
        )}

        <Card style={{ gap: spacing.md }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'in', label: 'Sign in' },
              { value: 'up', label: 'Create account' },
            ]}
          />
          {mode === 'up' && (
            <TextInput
              style={input}
              placeholder="Full name"
              placeholderTextColor={colors.textFaint}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              accessibilityLabel="Full name"
            />
          )}
          <TextInput
            style={input}
            placeholder="Email"
            placeholderTextColor={colors.textFaint}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email"
          />
          <TextInput
            style={input}
            placeholder="Password (8+ characters)"
            placeholderTextColor={colors.textFaint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            textContentType={mode === 'up' ? 'newPassword' : 'password'}
            accessibilityLabel="Password"
          />
          <Button
            title={mode === 'in' ? 'Sign in' : 'Create account'}
            loading={busy === 'email'}
            disabled={!email.includes('@') || password.length < 8 || (mode === 'up' && !name.trim())}
            onPress={() =>
              run('email', () => (mode === 'in' ? signInEmail(email, password) : signUpEmail(email, password, name)))
            }
          />
        </Card>

        {message && (
          <View style={{ marginTop: spacing.lg }}>
            <Notice tone={message.tone}>
              <Text>{message.text}</Text>
            </Notice>
          </View>
        )}

        {showGuest && (
          <>
          <Button
          kind="ghost"
          title="Continue as guest"
          icon="eye-outline"
          loading={busy === 'guest'}
          onPress={() => run('guest', signInGuest)}
          style={{ marginTop: spacing.lg }}
        />
        <Text variant="small" muted style={{ textAlign: 'center' }}>
          Guests can browse reports, the map, weather and the assistant, but can’t post, comment, react or join the Discussion.
        </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SocialButton({ provider, onPress, busy }: { provider: 'google' | 'facebook'; onPress: () => void; busy: boolean }) {
  const { colors, shadows } = useTheme();
  const label = provider === 'google' ? 'Continue with Google' : 'Continue with Facebook';
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.social, { backgroundColor: colors.surface, boxShadow: shadows.card }]}>
      <Ionicons name={provider === 'google' ? 'logo-google' : 'logo-facebook'} size={20} color={provider === 'google' ? '#4285F4' : '#1877F2'} />
      <Text variant="label" style={{ fontSize: 15 }}>{busy ? 'Opening…' : label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: GUTTER, maxWidth: 520, width: '100%', alignSelf: 'center' },
  top: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  mark: { width: 76, height: 76, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  social: { minHeight: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  or: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xl },
  line: { flex: 1, height: 1 },
  input: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: spacing.lg },
});
