import { Link, useLocalSearchParams } from 'expo-router';
import { Fragment } from 'react';
import { View } from 'react-native';

import { Page, StackHeader, Screen } from '@/components/layout';
import { Card, Chip, Empty, Notice, Text } from '@/components/ui';
import { LEGAL_TOKENS, isPlaceholder } from '@/config';
import { LEGAL_DOCS, LEGAL_UPDATED, legalDoc } from '@/content/legal';
import { spacing, useTheme } from '@/theme';

/** Renders text with {{TOKENS}} filled in; unconfirmed <PLACEHOLDERS> are highlighted. */
function Filled({ text, variant = 'body' as const }: { text: string; variant?: 'body' | 'caption' }) {
  const { colors } = useTheme();
  const parts = text.split(/(\{\{[A-Z_]+\}\})/g);
  return (
    <Text variant={variant}>
      {parts.map((p, i) => {
        const m = p.match(/^\{\{([A-Z_]+)\}\}$/);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const value = LEGAL_TOKENS[m[1]] ?? p;
        return isPlaceholder(value) ? (
          <Text key={i} variant={variant} style={{ backgroundColor: colors.placeholderHighlight, fontWeight: '700' }} accessibilityLabel="Not confirmed yet">
            {value}
          </Text>
        ) : (
          <Fragment key={i}>{value}</Fragment>
        );
      })}
    </Text>
  );
}

export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = legalDoc(doc);
  const hasPlaceholders = Object.values(LEGAL_TOKENS).some(isPlaceholder);

  if (!d) {
    return (
      <Screen>
        <StackHeader title="Legal" />
        <Empty icon="document-outline" title="Page not found" />
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={d.title} />
      <Page tab={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {LEGAL_DOCS.map((x) => (
            <Link key={x.id} href={{ pathname: '/legal/[doc]', params: { doc: x.id } }} replace asChild>
              <Chip label={x.title} selected={x.id === d.id} />
            </Link>
          ))}
        </View>
        {hasPlaceholders && (
          <View style={{ marginBottom: spacing.lg }}>
            <Notice tone="warning">
              <Text variant="caption">Highlighted details haven’t been confirmed yet and will be filled in before publication.</Text>
            </Notice>
          </View>
        )}
        <Text variant="small" muted>Last updated {LEGAL_UPDATED}</Text>
        <View style={{ marginVertical: spacing.md }}>
          <Filled text={d.intro} />
        </View>
        <View style={{ gap: spacing.md }}>
          {d.sections.map((s) => (
            <Card key={s.heading} style={{ gap: spacing.sm }}>
              <Text variant="headline" accessibilityRole="header">{s.heading}</Text>
              {s.body.map((p, i) => (
                <Filled key={i} text={p} />
              ))}
            </Card>
          ))}
        </View>
      </Page>
    </Screen>
  );
}
