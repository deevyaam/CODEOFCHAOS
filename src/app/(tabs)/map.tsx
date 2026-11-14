import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/layout';
import { MeTooButton, StatusPill } from '@/components/report-card';
import { ReportMap } from '@/components/report-map';
import type { LatLng, ReportMapHandle } from '@/components/report-map.types';
import { Sheet } from '@/components/sheet';
import { Button, Chip, Icon, PressableScale, Segmented, Text } from '@/components/ui';
import { NoTabSwipe } from '@/components/tab-swipe';
import { distanceKm, formatDistance } from '@/lib/places';
import { setPref, usePref } from '@/lib/prefs';
import { CATEGORIES, categoryInfo, timeAgo, useReports, type Category } from '@/lib/reports';
import { DARK_COLOR, HEAT_DAYS, HEAT_LEVELS, TIME_WINDOWS, darkSpots, safetyHeat, type TimeWindow } from '@/lib/safety';
import { useSession } from '@/lib/session';
import { useVotes } from '@/lib/votes';
import { getPositionWithTimeout } from '@/lib/weather';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

type Layer = 'reports' | 'heat' | 'dark';

export default function MapScreen() {
  const { user } = useSession();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const map = useRef<ReportMapHandle>(null);
  const [layer, setLayer] = useState<Layer>('reports');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);

  // One query feeds every layer: open reports for pins and dark spots, recent fixed ones for the heat layer.
  const { reports: all, loading, reload } = useReports({ status: 'all', limit: 500 }, user?.id);
  const basemap = usePref('mapBasemap');
  const open = useMemo(() => all.filter((r) => r.status !== 'fixed'), [all]);
  const heat = useMemo(() => safetyHeat(all, timeWindow), [all, timeWindow]);
  const dark = useMemo(() => darkSpots(all), [all]);

  const pins = useMemo(() => {
    if (layer === 'heat') return [];
    if (layer === 'dark') return dark.spots;
    return category === 'all' ? open : open.filter((r) => r.category === category);
  }, [layer, dark.spots, open, category]);
  const zones = layer === 'heat' ? heat.zones : layer === 'dark' ? dark.zones : undefined;

  const { voted, toggle, canVote } = useVotes(pins);
  const report = pins.find((r) => r.id === selected) ?? null;

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

  const windowInfo = TIME_WINDOWS.find((w) => w.value === timeWindow)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReportMap ref={map} reports={pins} zones={zones} me={me} selectedId={selected} onSelect={setSelected} basemap={basemap} layers={false} />

      <NoTabSwipe style={[styles.top, { top: insets.top + spacing.sm }]}>
        <View style={[styles.layerSwitch, { backgroundColor: colors.surface, boxShadow: shadows.float }]}>
          <Segmented<Layer>
            value={layer}
            onChange={(v) => {
              setSelected(null);
              setLayer(v);
            }}
            options={[
              { value: 'reports', label: 'Reports' },
              { value: 'heat', label: 'Safety' },
              { value: 'dark', label: 'Dark spots' },
            ]}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {layer === 'reports' && (
            <>
              <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
              {CATEGORIES.map((c) => (
                <Chip key={c.value} label={c.label} icon={c.icon} color={c.color} selected={category === c.value} onPress={() => setCategory(c.value)} />
              ))}
            </>
          )}
          {layer === 'heat' &&
            TIME_WINDOWS.map((w) => (
              <Chip key={w.value} label={w.hours ? `${w.label} ${w.hours}` : w.label} icon={w.value === 'night' ? 'moon-outline' : undefined} selected={timeWindow === w.value} onPress={() => setTimeWindow(w.value)} />
            ))}
        </ScrollView>
      </NoTabSwipe>

      {layer !== 'reports' && (
        <View
          style={[styles.legend, { bottom: tabSpace - spacing.sm, backgroundColor: colors.surface, boxShadow: shadows.float }]}
          accessible
          accessibilityRole="summary"
          accessibilityLabel={
            layer === 'heat'
              ? `${heat.total} safety reports in the last ${HEAT_DAYS} days, ${windowInfo.label.toLowerCase()}${heat.busiest ? `. Most near ${heat.busiest.town}` : ''}`
              : `${dark.spots.length} open dark spots`
          }>
          {layer === 'heat' ? (
            <>
              <Text variant="label">
                {heat.total === 0 ? 'No safety reports' : `${heat.total} safety report${heat.total === 1 ? '' : 's'}`}
              </Text>
              <Text variant="small" muted>
                Last {HEAT_DAYS} days · {windowInfo.label}
                {windowInfo.hours ? ` (${windowInfo.hours} h)` : ''}
              </Text>
              {heat.busiest && heat.total > 0 && (
                <Text variant="small" muted numberOfLines={1}>Most near {heat.busiest.town}</Text>
              )}
              <View style={styles.scale}>
                {HEAT_LEVELS.map((l) => (
                  <View key={l.label} style={styles.scaleItem}>
                    <View style={[styles.dot, { backgroundColor: l.color }]} />
                    <Text variant="small" muted>{l.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.scaleItem}>
                <View style={[styles.dot, { backgroundColor: DARK_COLOR }]} />
                <Text variant="label">
                  {dark.spots.length === 0 ? 'No dark spots reported' : `${dark.spots.length} open dark spot${dark.spots.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <Text variant="small" muted>Street lights out or unlit areas. Tap a pin to say “me too”.</Text>
              {canVote && (
                <PressableScale onPress={() => router.push('/report/new')} accessibilityRole="button" accessibilityLabel="Report a dark spot">
                  <Text variant="label" color={colors.primary}>+ Report a dark spot</Text>
                </PressableScale>
              )}
            </>
          )}
        </View>
      )}

      <View style={[styles.fabStack, { bottom: tabSpace - spacing.sm }]} pointerEvents="box-none">
        <PressableScale
          onPress={reload}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Refreshing reports' : 'Refresh reports'}
          style={[styles.fabSmall, { backgroundColor: colors.surface, boxShadow: shadows.float }]}>
          {loading ? <ActivityIndicator color={colors.primary} /> : <Icon name="refresh" size={22} color={colors.primary} />}
        </PressableScale>
        <PressableScale
          onPress={() => setPref('mapBasemap', basemap === 'satellite' ? 'map' : 'satellite')}
          accessibilityRole="button"
          accessibilityLabel={basemap === 'satellite' ? 'Show the street map' : 'Show satellite view'}
          style={[styles.fabSmall, { backgroundColor: basemap === 'satellite' ? colors.primary : colors.surface, boxShadow: shadows.float }]}>
          <Icon name={basemap === 'satellite' ? 'map' : 'earth'} size={22} color={basemap === 'satellite' ? colors.onPrimary : colors.primary} />
        </PressableScale>
      </View>
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
  top: { position: 'absolute', left: 0, right: 0, gap: spacing.sm },
  layerSwitch: { marginHorizontal: GUTTER, borderRadius: radius.pill, padding: 4, maxWidth: 520, width: 'auto', alignSelf: 'stretch' },
  chips: { gap: spacing.sm, paddingHorizontal: GUTTER },
  legend: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER + 52 + spacing.md,
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  scaleItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  // Refresh and Map/Satellite sit in a column above "Centre on me" (52 + 12 px gap).
  fabStack: { position: 'absolute', right: GUTTER + 4, gap: spacing.md, transform: [{ translateY: -(52 + spacing.md) }] },
  fabSmall: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
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
