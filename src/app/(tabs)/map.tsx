import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/layout';
import { MeTooButton, StatusPill } from '@/components/report-card';
import { ReportMap } from '@/components/report-map';
import type { LatLng, ReportMapHandle } from '@/components/report-map.types';
import { Sheet } from '@/components/sheet';
import { Button, Chip, Icon, PressableScale, Text } from '@/components/ui';
import { NoTabSwipe } from '@/components/tab-swipe';
import { distanceKm, formatDistance } from '@/lib/places';
import { CATEGORIES, categoryInfo, timeAgo, useReports, type Category } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useVotes } from '@/lib/votes';
import { getPositionWithTimeout } from '@/lib/weather';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

export default function MapScreen() {
  const { user } = useSession();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const map = useRef<ReportMapHandle>(null);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const { reports } = useReports({ category, status: 'open', limit: 300 }, user?.id);
  const { voted, toggle, canVote } = useVotes(reports);
  const report = reports.find((r) => r.id === selected) ?? null;

  const centreOnMe = useCallback(async () => {
    setLocating(true);
    const pos = await getPositionWithTimeout();
    setLocating(false);
    if (pos) {
      setMe(pos);
      map.current?.centerOn(pos);
    }
  }, []);

  const directions = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReportMap ref={map} reports={reports} me={me} selectedId={selected} onSelect={setSelected} />

      <NoTabSwipe style={[styles.filters, { top: insets.top + spacing.sm }]}>
        <View style={styles.filterRow}>
          <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORIES.map((c) => (
            <Chip key={c.value} label={c.label} icon={c.icon} color={c.color} selected={category === c.value} onPress={() => setCategory(c.value)} />
          ))}
        </View>
      </NoTabSwipe>

      <PressableScale
        onPress={centreOnMe}
        accessibilityRole="button"
        accessibilityLabel="Centre on me"
        style={[styles.fab, { bottom: tabSpace - spacing.sm, backgroundColor: colors.surface, boxShadow: shadows.float }]}>
        <Icon name={locating ? 'hourglass-outline' : 'locate'} size={24} color={colors.primary} />
      </PressableScale>

      <Sheet visible={!!report} onClose={() => setSelected(null)} title={report ? categoryInfo(report.category).label : undefined}>
        {report && (
          <View style={{ gap: spacing.md }}>
            <Text variant="headline">{report.title}</Text>
            <Text variant="caption" muted>
              {[report.town ?? report.place_name, timeAgo(report.created_at), me && report.lat != null ? formatDistance(distanceKm(me, { lat: report.lat, lng: report.lng! })) + ' away' : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {report.description ? <Text numberOfLines={4}>{report.description}</Text> : null}
            <View style={styles.sheetRow}>
              <StatusPill status={report.status} />
              <MeTooButton count={report.me_too_count} on={voted.has(report.id)} disabled={!canVote} onPress={() => toggle(report.id)} />
            </View>
            <View style={styles.sheetRow}>
              <Button
                title="Open"
                icon="open-outline"
                style={{ flex: 1 }}
                onPress={() => {
                  setSelected(null);
                  router.push({ pathname: '/report/[id]', params: { id: report.id } });
                }}
              />
              {report.lat != null && (
                <Button kind="secondary" title="Directions" icon="navigate" style={{ flex: 1 }} onPress={() => directions(report.lat!, report.lng!)} />
              )}
            </View>
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { position: 'absolute', left: 0, right: 0 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: GUTTER },
  fab: {
    position: 'absolute',
    right: GUTTER,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
});
