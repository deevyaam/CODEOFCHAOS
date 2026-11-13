import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StackHeader } from '@/components/layout';
import { StatusPill } from '@/components/report-card';
import { ReportMap } from '@/components/report-map';
import type { LatLng } from '@/components/report-map.types';
import { Button, Card, Chip, Empty, Icon, Notice, PressableScale, Text, ToggleRow } from '@/components/ui';
import { nearestTown, TOWNS } from '@/lib/places';
import { usePref } from '@/lib/prefs';
import {
  CATEGORIES,
  PIN_COLORS,
  PIN_ICONS,
  categoryInfo,
  setMeToo,
  timeAgo,
  uploadMedia,
  type Category,
  type MediaItem,
  type Report,
} from '@/lib/reports';
import { useSession } from '@/lib/session';
import { BUCKETS, supabase } from '@/lib/supabase';
import { getPositionWithTimeout } from '@/lib/weather';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

type Picked = { uri: string; mimeType?: string | null; type?: string | null };

const STEPS = ['Type', 'Details', 'Pin', 'When & where'];
const WHEN = [
  { label: 'Just now', hours: 0 },
  { label: 'Earlier today', hours: 4 },
  { label: 'Yesterday', hours: 24 },
  { label: 'This week', hours: 72 },
  { label: 'Ongoing', hours: -1 },
];

export default function NewReport() {
  const { user, isGuest } = useSession();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const anonDefault = usePref('anonymousDefault');

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<Picked[]>([]);
  const [attachLocation, setAttachLocation] = useState(true);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [pinColor, setPinColor] = useState<string | null>(null);
  const [pinIcon, setPinIcon] = useState<string | null>(null);
  const [when, setWhen] = useState(0);
  // undefined = suggest the nearest town to the pin; null = none chosen.
  const [townChoice, setTown] = useState<string | null | undefined>(undefined);
  const [place, setPlace] = useState('');
  const [anonymous, setAnonymous] = useState(anonDefault);
  const [dupes, setDupes] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cat = category ? categoryInfo(category) : null;
  const color = pinColor ?? cat?.color ?? colors.primary;
  const town = townChoice === undefined ? (point ? nearestTown(point).name : null) : townChoice;

  // Duplicate detection: open reports of the same type within 300 m.
  useEffect(() => {
    if (!category || !point) return;
    let alive = true;
    supabase
      .rpc('nearby_open_reports', { p_category: category, p_lat: point.lat, p_lng: point.lng, p_radius_m: 300 })
      .then(({ data }) => alive && setDupes((data as Report[] | null) ?? []));
    return () => {
      alive = false;
    };
  }, [category, point]);
  const shownDupes = category && point && attachLocation ? dupes : [];

  const canNext = useMemo(() => {
    if (step === 0) return !!category;
    if (step === 1) return title.trim().length >= 3;
    if (step === 2) return !attachLocation || !!point;
    return true;
  }, [step, category, title, attachLocation, point]);

  if (isGuest || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="New report" />
        <Empty icon="lock-closed-outline" title="Sign in to post a report" body="Guests can browse reports but can’t post." />
      </View>
    );
  }

  const pickMedia = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: 60,
      allowsMultipleSelection: !camera,
      selectionLimit: 6 - media.length,
    };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('Camera permission is needed to take a photo.');
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled) setMedia((m) => [...m, ...res.assets].slice(0, 6));
  };

  const useMyLocation = async () => {
    const pos = await getPositionWithTimeout();
    if (pos) setPoint(pos);
    else setError('Couldn’t get your location. Tap the map to place the pin instead.');
  };

  const submit = async () => {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const folder = anonymous ? `anonymous/${Crypto.randomUUID()}` : user.id;
      const uploaded: MediaItem[] = [];
      for (const m of media) uploaded.push(await uploadMedia(BUCKETS.reportMedia, folder, m));
      const w = WHEN[when];
      const { data, error: e } = await supabase
        .from('reports')
        .insert({
          category,
          title: title.trim(),
          description: description.trim(),
          lat: attachLocation ? point?.lat ?? null : null,
          lng: attachLocation ? point?.lng ?? null : null,
          town,
          place_name: place.trim() || null,
          occurred_at: w.hours >= 0 ? new Date(Date.now() - w.hours * 3600_000).toISOString() : null,
          is_anonymous: anonymous,
          pin_color: pinColor,
          pin_icon: pinIcon,
          media: uploaded,
        })
        .select('id')
        .single();
      if (e) throw e;
      router.replace({ pathname: '/report/[id]', params: { id: data.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the report');
    } finally {
      setBusy(false);
    }
  };

  const input = [type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <StackHeader title="New report" />
      <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of 4: ${STEPS[step]}`}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, gap: 4 }}>
            <View style={[styles.bar, { backgroundColor: i <= step ? colors.primary : colors.surfaceSunken }]} />
            <Text variant="small" color={i === step ? colors.text : colors.textFaint} numberOfLines={1}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <Animated.View key={step} entering={FadeIn.duration(180)} style={{ gap: spacing.lg }}>
          {step === 0 && (
            <>
              <Text variant="title">What kind of problem?</Text>
              {CATEGORIES.map((c) => (
                <PressableScale
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: category === c.value }}>
                  <Card style={[styles.typeCard, category === c.value && { backgroundColor: colors.primarySoft }]}>
                    <View style={[styles.typeIcon, { backgroundColor: c.color }]}>
                      <Icon name={c.icon} size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{c.label}</Text>
                      <Text variant="caption" muted>{c.hint}</Text>
                    </View>
                    {category === c.value && <Icon name="checkmark-circle" color={colors.primary} />}
                  </Card>
                </PressableScale>
              ))}
            </>
          )}

          {step === 1 && (
            <>
              <Text variant="title">Describe it</Text>
              <TextInput style={input} placeholder="Short title (e.g. Broken street light)" placeholderTextColor={colors.textFaint} value={title} onChangeText={setTitle} maxLength={120} accessibilityLabel="Title" />
              <TextInput
                style={[input, { minHeight: 120, textAlignVertical: 'top', paddingTop: spacing.md }]}
                placeholder="What’s happening? Anything that helps someone find and fix it."
                placeholderTextColor={colors.textFaint}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={4000}
                accessibilityLabel="Description"
              />
              <Text variant="label" muted>Photos and videos ({media.length}/6)</Text>
              <View style={styles.mediaRow}>
                {media.map((m, i) => (
                  <View key={m.uri}>
                    <Image source={{ uri: m.uri }} style={styles.mediaThumb} contentFit="cover" />
                    {m.type === 'video' && <Icon name="videocam" size={16} color="#fff" style={styles.videoBadge} />}
                    <PressableScale
                      onPress={() => setMedia((all) => all.filter((_, j) => j !== i))}
                      accessibilityLabel="Remove"
                      accessibilityRole="button"
                      style={[styles.remove, { backgroundColor: colors.overlay }]}>
                      <Icon name="close" size={14} color="#fff" />
                    </PressableScale>
                  </View>
                ))}
              </View>
              {media.length < 6 && (
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {Platform.OS !== 'web' && <Button kind="secondary" icon="camera" title="Camera" onPress={() => pickMedia(true)} style={{ flex: 1 }} />}
                  <Button kind="secondary" icon="images" title="Gallery" onPress={() => pickMedia(false)} style={{ flex: 1 }} />
                </View>
              )}
              <Text variant="small" muted>Please avoid faces and car number plates where you can.</Text>
            </>
          )}

          {step === 2 && (
            <>
              <Text variant="title">Pin it on the map</Text>
              <ToggleRow
                icon="location-outline"
                title="Attach a location"
                subtitle="Only stored if you choose to. Without it, the report won’t show on the map."
                value={attachLocation}
                onChange={setAttachLocation}
              />
              {attachLocation && (
                <>
                  <View style={styles.mapBox}>
                    <ReportMap
                      initial={point ? { ...point, zoom: 15 } : undefined}
                      pick={{ value: point, color, onPick: setPoint }}
                      layers
                    />
                  </View>
                  <Button kind="secondary" icon="locate" title="Use my location" onPress={useMyLocation} />
                  <Text variant="label" muted>Pin colour</Text>
                  <View style={styles.swatches}>
                    {PIN_COLORS.map((c) => (
                      <PressableScale
                        key={c}
                        onPress={() => setPinColor(c)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: color === c }}
                        accessibilityLabel={`Colour ${c}`}
                        style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}>
                        {color === c && <Icon name="checkmark" size={16} color="#fff" />}
                      </PressableScale>
                    ))}
                  </View>
                  <Text variant="label" muted>Pin icon</Text>
                  <View style={styles.swatches}>
                    {PIN_ICONS.map((ic) => {
                      const on = (pinIcon ?? cat?.icon) === ic;
                      return (
                        <PressableScale
                          key={ic}
                          onPress={() => setPinIcon(ic)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`Icon ${ic}`}
                          style={[styles.swatch, { backgroundColor: on ? color : colors.surfaceMuted }]}>
                          <Icon name={ic} size={18} color={on ? '#fff' : colors.textMuted} />
                        </PressableScale>
                      );
                    })}
                  </View>
                </>
              )}
              {shownDupes.length > 0 && (
                <Notice tone="warning" icon="copy-outline">
                  <Text variant="label">Similar open reports nearby</Text>
                  <Text variant="caption" muted style={{ marginBottom: spacing.sm }}>
                    If one of these is the same problem, add your “me too” instead — it carries more weight.
                  </Text>
                  {shownDupes.map((d) => (
                    <View key={d.id} style={styles.dupe}>
                      <View style={{ flex: 1 }}>
                        <Text variant="label" numberOfLines={1}>{d.title}</Text>
                        <Text variant="small" muted>{timeAgo(d.created_at)} · reported by {d.me_too_count + 1}</Text>
                      </View>
                      <StatusPill status={d.status} />
                      <Button
                        kind="secondary"
                        title="Me too"
                        haptic
                        onPress={async () => {
                          await setMeToo(d.id, user.id, true);
                          router.replace({ pathname: '/report/[id]', params: { id: d.id } });
                        }}
                      />
                    </View>
                  ))}
                </Notice>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Text variant="title">When and where</Text>
              <Text variant="label" muted>When did it happen?</Text>
              <View style={styles.swatches}>
                {WHEN.map((w, i) => (
                  <Chip key={w.label} label={w.label} selected={when === i} onPress={() => setWhen(i)} />
                ))}
              </View>
              <Text variant="label" muted>Town</Text>
              <View style={styles.swatches}>
                {TOWNS.map((t) => (
                  <Chip key={t.name} label={t.name} selected={town === t.name} onPress={() => setTown(town === t.name ? null : t.name)} />
                ))}
              </View>
              <TextInput style={input} placeholder="Place or landmark (optional)" placeholderTextColor={colors.textFaint} value={place} onChangeText={setPlace} maxLength={160} accessibilityLabel="Place or landmark" />
              <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
                <ToggleRow
                  icon="eye-off-outline"
                  title="Post anonymously"
                  subtitle="Your name won’t be shown. You can still follow and update the report."
                  value={anonymous}
                  onChange={setAnonymous}
                />
              </Card>
            </>
          )}
        </Animated.View>

        {error && (
          <Notice tone="danger"><Text>{error}</Text></Notice>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.background }]}>
        {step > 0 && <Button kind="secondary" title="Back" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
        {step < 3 ? (
          <Button title="Next" onPress={() => setStep((s) => s + 1)} disabled={!canNext} style={{ flex: 2 }} />
        ) : (
          <Button title="Post report" icon="send" haptic loading={busy} onPress={submit} style={{ flex: 2 }} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: GUTTER, paddingBottom: spacing.lg },
  bar: { height: 4, borderRadius: 2 },
  typeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  typeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mediaThumb: { width: 84, height: 84, borderRadius: radius.sm },
  videoBadge: { position: 'absolute', left: 6, bottom: 6 },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 280, borderRadius: radius.lg, overflow: 'hidden' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { transform: [{ scale: 1.08 }] },
  dupe: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingVertical: spacing.xs },
  footer: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: GUTTER, paddingTop: spacing.md },
});
