import { useState } from 'react';
import { View } from 'react-native';

import { Page, PageHeader } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Card, Chip, Icon, Row, Segmented, SectionTitle, Text } from '@/components/ui';
import { TOWNS } from '@/lib/places';
import { setPref, usePrefs, type AlertArea } from '@/lib/prefs';
import { spacing, useTheme } from '@/theme';

const DISTANCES = [2, 5, 10, 20];

// Notifications themselves need no setting: signed-in members are signed up automatically (useAutoPush in the
// root layout), and changing the area here re-saves it for this phone.
export default function Alerts() {
  const prefs = usePrefs();
  const { colors } = useTheme();
  const [townPicker, setTownPicker] = useState(false);

  const setArea = (area: AlertArea) => setPref('alertArea', area);
  const area = prefs.alertArea;

  return (
    <Page>
      <PageHeader title="Alerts" subtitle="Hear about new reports where it matters to you" />

      <SectionTitle>Alert area</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <Segmented
          value={area.mode}
          onChange={(m) =>
            setArea(m === 'everywhere' ? { mode: 'everywhere' } : m === 'town' ? { mode: 'town', town: area.mode === 'town' ? area.town : TOWNS[0].name } : { mode: 'near', km: area.mode === 'near' ? area.km : 5 })
          }
          options={[
            { value: 'everywhere', label: 'Everywhere' },
            { value: 'town', label: 'A town' },
            { value: 'near', label: 'Near me' },
          ]}
        />
        {area.mode === 'town' && <Row icon="business-outline" title={area.town} subtitle="Change town" onPress={() => setTownPicker(true)} />}
        {area.mode === 'near' && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" muted>Within</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {DISTANCES.map((d) => (
                <Chip key={d} label={`${d} km`} selected={area.km === d} onPress={() => setArea({ mode: 'near', km: d })} />
              ))}
            </View>
            <Text variant="small" muted>Your position is saved with this phone’s alert settings only, and updated when you change them.</Text>
          </View>
        )}
        <Text variant="small" muted>
          On your phone you’ll be told about new reports in this area, updates on your reports, and new messages in Discuss.
        </Text>
      </Card>

      <Sheet visible={townPicker} onClose={() => setTownPicker(false)} title="Alert town">
        {TOWNS.map((t) => (
          <Row
            key={t.name}
            title={t.name}
            right={area.mode === 'town' && area.town === t.name ? <Icon name="checkmark" color={colors.primary} /> : undefined}
            onPress={() => {
              setArea({ mode: 'town', town: t.name });
              setTownPicker(false);
            }}
          />
        ))}
      </Sheet>
    </Page>
  );
}
