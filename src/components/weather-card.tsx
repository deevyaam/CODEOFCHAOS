import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { setPref, usePref } from '@/lib/prefs';
import { TOWNS } from '@/lib/places';
import {
  describe,
  formatClock,
  moonPhase,
  moonPhaseName,
  useForecast,
} from '@/lib/weather';
import { radius, spacing, useTheme } from '@/theme';
import { spring } from '@/theme/motion';

import { Sheet } from './sheet';
import { NoTabSwipe } from './tab-swipe';
import { Button, Icon, PressableScale, Row, Text } from './ui';
import { WeatherScene } from './weather-scene';

export function WeatherCard() {
  const { colors, shadows } = useTheme();
  const town = usePref('weatherTown');
  const style = usePref('weatherStyle');
  const collapsed = usePref('weatherCollapsed');
  const reduce = useReducedMotion();
  const { data, error, retry } = useForecast(town);
  const [picker, setPicker] = useState(false);

  const rot = useSharedValue(collapsed ? 0 : 180);
  useEffect(() => {
    rot.set(withSpring(collapsed ? 0 : 180, spring));
  }, [collapsed, rot]);
  const arrow = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  const animate = style === 'dynamic' && !reduce;
  const desc = data ? describe(data.current.code, data.current.isDay) : null;

  return (
    <Animated.View
      layout={LinearTransition.duration(260)}
      style={[styles.card, { backgroundColor: colors.surface, boxShadow: shadows.card }]}>
      {data ? (
        <View>
          <WeatherScene forecast={data} animate={animate} />
          <View style={styles.overlay} pointerEvents="box-none">
            <PressableScale
              onPress={() => setPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Weather place: ${data.place}. Change`}
              style={styles.placeChip}>
              <Icon name={data.isMyLocation ? 'navigate' : 'location'} size={14} color="#fff" />
              <Text variant="label" color="#fff" numberOfLines={1}>
                {data.isMyLocation ? `Near ${data.place}` : data.place}
              </Text>
              <Icon name="chevron-down" size={14} color="#fff" />
            </PressableScale>
            <View style={styles.now}>
              <Text variant="display" color="#fff" style={styles.shadowText}>
                {Math.round(data.current.temp)}°
              </Text>
              <Text variant="label" color="#fff" style={styles.shadowText}>
                {desc?.label} · feels {Math.round(data.current.feels)}°
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.loading, { backgroundColor: colors.surfaceMuted }]}>
          {error ? (
            <>
              <Text muted>{error}</Text>
              <Button kind="secondary" title="Try again" onPress={retry} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text muted variant="caption">Getting the weather…</Text>
            </>
          )}
        </View>
      )}

      {data && (
        <Pressable
          onPress={() => setPref('weatherCollapsed', !collapsed)}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={collapsed ? 'Show forecast' : 'Hide forecast'}
          style={styles.toggle}>
          <Text variant="label" muted>
            {data.fellBack ? 'Location didn’t answer — showing Port Louis' : `Wind ${Math.round(data.current.wind)} km/h · Clouds ${data.current.cloud}%`}
          </Text>
          <Animated.View style={arrow}>
            <Icon name="chevron-down" size={20} color={colors.textMuted} />
          </Animated.View>
        </Pressable>
      )}

      {data && !collapsed && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ paddingBottom: spacing.lg }}>
          <NoTabSwipe>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
              {data.hourly.map((h, i) => {
                const d = describe(h.code, true);
                return (
                  <View key={h.time} style={[styles.hour, { backgroundColor: colors.surfaceMuted }]}>
                    <Text variant="small" muted>{i === 0 ? 'Now' : formatClock(h.time)}</Text>
                    <Icon name={d.icon} size={20} color={colors.primary} />
                    <Text variant="label">{Math.round(h.temp)}°</Text>
                    {h.rainChance >= 20 && <Text variant="small" color={colors.primary}>{h.rainChance}%</Text>}
                  </View>
                );
              })}
            </ScrollView>
          </NoTabSwipe>

          <View style={styles.astro}>
            <Astro icon="sunny-outline" label="Sunrise" value={formatClock(data.daily[0].sunrise)} />
            <Astro icon="moon-outline" label="Sunset" value={formatClock(data.daily[0].sunset)} />
            <Astro icon="ellipse-outline" label="Moon" value={moonPhaseName(moonPhase(new Date()))} />
          </View>

          <DailyList forecast={data} />
        </Animated.View>
      )}

      <Sheet visible={picker} onClose={() => setPicker(false)} title="Weather for">
        <Row
          icon="navigate"
          title="My location"
          subtitle="Uses your phone’s location; falls back to Port Louis after 10 seconds"
          onPress={() => {
            setPref('weatherTown', 'my-location');
            setPicker(false);
          }}
          right={town === 'my-location' ? <Icon name="checkmark" color={colors.primary} /> : undefined}
        />
        {TOWNS.map((t) => (
          <Row
            key={t.name}
            title={t.name}
            onPress={() => {
              setPref('weatherTown', t.name);
              setPicker(false);
            }}
            right={town === t.name ? <Icon name="checkmark" color={colors.primary} /> : undefined}
          />
        ))}
      </Sheet>
    </Animated.View>
  );
}

function Astro({ icon, label, value }: { icon: 'sunny-outline' | 'moon-outline' | 'ellipse-outline'; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.astroItem}>
      <Icon name={icon} size={18} color={colors.accent} />
      <Text variant="small" muted>{label}</Text>
      <Text variant="label" numberOfLines={1}>{value}</Text>
    </View>
  );
}

function DailyList({ forecast }: { forecast: NonNullable<ReturnType<typeof useForecast>['data']> }) {
  const { colors } = useTheme();
  const lo = Math.min(...forecast.daily.map((d) => d.min));
  const hi = Math.max(...forecast.daily.map((d) => d.max));
  const span = Math.max(1, hi - lo);
  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      {forecast.daily.map((d, i) => {
        const desc = describe(d.code, true);
        const day = i === 0 ? 'Today' : new Date(d.date + 'T12:00:00+04:00').toLocaleDateString('en-MU', { weekday: 'short' });
        const left = ((d.min - lo) / span) * 100;
        const width = Math.max(6, ((d.max - d.min) / span) * 100);
        return (
          <View key={d.date} style={styles.dayRow} accessible accessibilityLabel={`${day}: ${desc.label}, low ${Math.round(d.min)}, high ${Math.round(d.max)} degrees`}>
            <Text variant="label" style={{ width: 52 }}>{day}</Text>
            <Icon name={desc.icon} size={18} color={colors.primary} />
            <Text variant="caption" muted style={{ width: 30, textAlign: 'right' }}>{Math.round(d.min)}°</Text>
            <View style={[styles.barTrack, { backgroundColor: colors.surfaceSunken }]}>
              <View style={[styles.bar, { left: `${left}%`, width: `${width}%`, backgroundColor: colors.accent }]} />
            </View>
            <Text variant="label" style={{ width: 30 }}>{Math.round(d.max)}°</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: spacing.lg, justifyContent: 'space-between' },
  placeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.pill,
    maxWidth: 240,
  },
  now: { gap: 0 },
  shadowText: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  loading: { height: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, minHeight: 48 },
  hours: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  hour: { width: 60, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', gap: 4 },
  astro: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.sm },
  astroItem: { flex: 1, alignItems: 'center', gap: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
});
