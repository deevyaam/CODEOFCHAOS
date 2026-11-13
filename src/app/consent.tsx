import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button, Card, Icon, Text } from '@/components/ui';
import { APP_NAME } from '@/config';
import { MIN_AGE } from '@/lib/consent';
import { useSession } from '@/lib/session';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

export default function Consent() {
  const { acceptConsent } = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.top}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Logo size={52} />
        </View>
        <Text variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">
          Welcome to {APP_NAME}
        </Text>
        <Text muted style={{ textAlign: 'center' }}>
          Report local problems in Mauritius, follow what happens to them, and talk with your community.
        </Text>
      </View>

      <Card style={{ gap: spacing.md }}>
        <Check checked={age} onToggle={() => setAge((v) => !v)} label={`I am ${MIN_AGE} or older`} />
        <Check
          checked={terms}
          onToggle={() => setTerms((v) => !v)}
          label={
            <Text>
              I accept the{' '}
              <Link href="/legal/terms" style={{ color: colors.primary, textDecorationLine: 'underline' }}>
                Terms
              </Link>{' '}
              and have read the{' '}
              <Link href="/legal/privacy" style={{ color: colors.primary, textDecorationLine: 'underline' }}>
                Privacy policy
              </Link>
            </Text>
          }
        />
      </Card>

      <Button title="Continue" onPress={acceptConsent} disabled={!age || !terms} haptic style={{ marginTop: spacing.xl }} />
      <Text variant="small" muted style={{ textAlign: 'center', marginTop: spacing.md }}>
        In an emergency call 999 or 112 (police), 114 (ambulance) or 115 (fire). This app is not an emergency service.
      </Text>
    </View>
  );
}

function Check({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.check}>
      <View
        style={[
          styles.box,
          { backgroundColor: checked ? colors.primary : colors.surfaceSunken },
        ]}>
        {checked && <Icon name="checkmark" size={18} color={colors.onPrimary} />}
      </View>
      <View style={{ flex: 1 }}>{typeof label === 'string' ? <Text>{label}</Text> : label}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: GUTTER, justifyContent: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' },
  top: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  mark: { width: 88, height: 88, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  box: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
