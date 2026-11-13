// "Report a problem" — built to be clear to anyone, without a tutorial:
// one plain question per screen, "Step X of 5" in words, tap-to-pick examples so nobody has to type,
// a Listen button that reads each screen aloud, Next always explains what's missing instead of greying out,
// and a final "Check and send" screen that says exactly what will be posted and what happens next.
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StackHeader } from '@/components/layout';
import { StatusPill } from '@/components/report-card';
import { ReportMap } from '@/components/report-map';
import type { LatLng } from '@/components/report-map.types';
import { Button, Card, Chip, Empty, Icon, Notice, PressableScale, Text, type IconName } from '@/components/ui';
import { EMERGENCY_NUMBERS } from '@/config';
import { nearestTown, TOWNS } from '@/lib/places';
import { usePref } from '@/lib/prefs';
import { useReadAloud } from '@/lib/read-aloud';
import { clearReportDraft, peekReportDraft } from '@/lib/report-draft';
import { ChoiceCard } from '@/components/choice-card';
import { MapPin } from '@/components/map-pin';
import { Sheet } from '@/components/sheet';
import {
  CATEGORIES,
  EXAMPLE_ICON,
  ISSUE_ICONS,
  PIN_COLORS,
  pinOf,
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
type Where = 'here' | 'map' | 'none';

/** One plain question per screen, plus a line that says what to do. Both are read aloud by Listen. */
const STEPS = [
  { short: 'Type', q: 'What is the problem about?', help: 'Tap the one that fits best. Not sure? Choose “Something else”.' },
  { short: 'Problem', q: 'What is wrong?', help: 'Tap an example, or write it in your own words. A photo helps, but you can skip it.' },
  { short: 'Place', q: 'Where is it?', help: 'This helps people find it. You decide if you share a place.' },
  { short: 'Time', q: 'When did you see it?', help: 'A rough idea is fine.' },
  { short: 'Check', q: 'Check and send', help: 'Make sure this is right. Tap “Change” to fix anything.' },
];
const LAST = STEPS.length - 1;

/** Everyday words for each type, instead of the short labels used elsewhere. */
const PLAIN: Record<Category, { label: string; hint: string; examples: string[] }> = {
  safety: {
    label: 'Feeling unsafe',
    hint: 'Dark streets, dangerous places, crime',
    examples: ['Street light not working', 'Dark, unsafe spot at night', 'Broken wall or fence', 'Stray dogs'],
  },
  transport: {
    label: 'Roads and buses',
    hint: 'Holes in the road, buses, traffic lights',
    examples: ['Hole in the road', 'Bus did not come', 'Traffic light not working', 'Footpath blocked'],
  },
  health: {
    label: 'Water and health',
    hint: 'No water, dirty water, drains, clinics',
    examples: ['No running water', 'Dirty water from the tap', 'Blocked drain', 'Lots of mosquitoes'],
  },
  environment: {
    label: 'Rubbish and nature',
    hint: 'Rubbish, flooding, trees, beaches',
    examples: ['Rubbish not collected', 'Flooding', 'Fallen tree', 'Dirty beach'],
  },
  other: {
    label: 'Something else',
    hint: 'Anything else near you',
    examples: ['Too much noise', 'Broken playground or bench', 'Abandoned car'],
  },
};

const WHEN = [
  { label: 'Just now', hours: 0 },
  { label: 'Earlier today', hours: 4 },
  { label: 'Yesterday', hours: 24 },
  { label: 'This week', hours: 72 },
  { label: 'It keeps happening', hours: -1 },
];

const NEED: Record<number, string> = {
  0: 'Tap one of the choices to continue.',
  1: 'Tap an example, or write a few words about the problem.',
  2: 'Choose one of the options. To share a place, tap the map to put the pin there.',
};

export default function NewReport() {
  const { user, isGuest, limits } = useSession();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const anonDefault = usePref('anonymousDefault');
  const reader = useReadAloud();
  const scroller = useRef<ScrollViewInstance>(null);

  // A report drafted by the assistant, if the person came from there.
  const [draft] = useState(peekReportDraft);
  useEffect(() => clearReportDraft(), []);
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category | null>(draft?.category ?? null);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [media, setMedia] = useState<Picked[]>(draft?.media ?? []);
  const [where, setWhere] = useState<Where | null>(null);
  const [locating, setLocating] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [pinSheet, setPinSheet] = useState(false);
  const [pinColor, setPinColor] = useState<string | null>(null);
  const [pinIcon, setPinIcon] = useState<IconName | null>(null);
  const [when, setWhen] = useState(0);
  // undefined = suggest the nearest town to the pin; null = none chosen.
  const [townChoice, setTown] = useState<string | null | undefined>(undefined);
  const [place, setPlace] = useState('');
  const [anonymous, setAnonymous] = useState(anonDefault);
  const [dupes, setDupes] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const cat = category ? CATEGORIES.find((c) => c.value === category) ?? null : null;
  const plain = category ? PLAIN[category] : null;
  const color = pinColor ?? cat?.color ?? colors.primary;
  // Like a traffic app: the pin's picture follows the problem (a tapped example), unless the person picks one.
  const autoIcon = category ? (EXAMPLE_ICON[title] ?? ISSUE_ICONS[category][0].icon) : null;
  const icon = pinIcon ?? autoIcon;
  const pin = category ? pinOf({ category, pin_color: color, pin_icon: icon }) : null;
  const sharePlace = where === 'here' || where === 'map';
  const town = townChoice === undefined ? (point && sharePlace ? nearestTown(point).name : null) : townChoice;

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
  const shownDupes = category && point && sharePlace ? dupes : [];

  if (isGuest || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Report a problem" />
        <Empty icon="lock-closed-outline" title="Sign in to report a problem" body="Guests can look at reports but can’t send one." />
      </View>
    );
  }
  if (limits.no_reports) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Report a problem" />
        <Empty
          icon="pause-circle-outline"
          title="Reporting is paused for your account"
          body={`A moderator has paused new reports from you for now.${limits.reason ? ` Reason: ${limits.reason}` : ''} You can still read reports and say “me too”.`}
        />
      </View>
    );
  }

  const ready = (s: number) => {
    if (s === 0) return !!category;
    if (s === 1) return title.trim().length >= 3;
    if (s === 2) return where === 'none' || (sharePlace && !!point);
    return true;
  };

  const goTo = (s: number) => {
    reader.stop();
    setHint(null);
    setError(null);
    setStep(s);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const next = () => {
    if (!ready(step)) {
      setHint(NEED[step]);
      return;
    }
    goTo(step + 1);
  };

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
      if (!perm.granted) return setError('To take a photo, the app needs to use your camera. You can allow this in your phone’s settings.');
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled) setMedia((m) => [...m, ...res.assets].slice(0, 6));
  };

  const chooseWhere = async (w: Where) => {
    setHint(null);
    setError(null);
    setWhere(w);
    if (w !== 'here') return;
    setLocating(true);
    const pos = await getPositionWithTimeout();
    setLocating(false);
    if (pos) setPoint(pos);
    else {
      setWhere('map');
      setError('We couldn’t find where you are. Tap the map to put the pin where the problem is.');
    }
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
          lat: sharePlace ? point?.lat ?? null : null,
          lng: sharePlace ? point?.lng ?? null : null,
          town,
          place_name: place.trim() || null,
          occurred_at: w.hours >= 0 ? new Date(Date.now() - w.hours * 3600_000).toISOString() : null,
          is_anonymous: anonymous,
          pin_color: pinColor,
          pin_icon: icon,
          media: uploaded,
        })
        .select('id')
        .single();
      if (e) throw e;
      reader.stop();
      router.replace({ pathname: '/report/[id]', params: { id: data.id } });
    } catch (e) {
      setError(`Your report wasn’t sent. Check your internet and tap “Send report” again. (${e instanceof Error ? e.message : 'Unknown error'})`);
    } finally {
      setBusy(false);
    }
  };

  const input = [type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }];
  const s = STEPS[step];
  const whenLabel = WHEN[when].label;
  const placeLabel = !sharePlace
    ? 'Not shared'
    : [place.trim(), town].filter(Boolean).join(', ') || 'Pin on the map';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <StackHeader title="Report a problem" />

      {/* Progress: said in words as well as shown as bars. */}
      <View style={styles.progressWrap} accessible accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${s.q}`}>
        <Text variant="label" muted>Step {step + 1} of {STEPS.length}</Text>
        <View style={styles.progress}>
          {STEPS.map((x, i) => (
            <View key={x.short} style={[styles.bar, { backgroundColor: i <= step ? colors.primary : colors.surfaceSunken }]} />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scroller}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <Animated.View key={step} entering={FadeIn.duration(180)} style={{ gap: spacing.lg }}>
          <View style={styles.questionRow}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="title" accessibilityRole="header">{s.q}</Text>
              <Text muted>{s.help}</Text>
            </View>
            <PressableScale
              onPress={() => reader.toggle(`${s.q}. ${s.help}`)}
              accessibilityRole="button"
              accessibilityLabel={reader.speaking ? 'Stop reading' : 'Read this aloud'}
              style={[styles.listen, { backgroundColor: reader.speaking ? colors.primary : colors.primarySoft }]}>
              <Icon name={reader.speaking ? 'stop' : 'volume-high'} size={20} color={reader.speaking ? colors.onPrimary : colors.primary} />
              <Text variant="small" color={reader.speaking ? colors.onPrimary : colors.primary} style={{ fontWeight: '600' }}>
                {reader.speaking ? 'Stop' : 'Listen'}
              </Text>
            </PressableScale>
          </View>

          {draft && step < 2 && (
            <Notice icon="chatbubble-ellipses-outline">
              <Text>The assistant filled this in from your chat{draft.media.length ? ', with your photos' : ''}. Check it and change anything that’s wrong. Nothing is sent until the last step.</Text>
            </Notice>
          )}

          {step === 0 && (
            <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
              {CATEGORIES.map((c) => (
                <ChoiceCard
                  key={c.value}
                  icon={c.icon}
                  iconBg={c.color}
                  title={PLAIN[c.value].label}
                  hint={PLAIN[c.value].hint}
                  selected={category === c.value}
                  onPress={() => {
                    if (category !== c.value) {
                        setTitle('');
                        setPinIcon(null);
                      }
                    setCategory(c.value);
                    setHint(null);
                  }}
                />
              ))}
              {category === 'safety' && (
                <Notice tone="danger" icon="call">
                  <Text variant="label">In danger right now? Don’t use this — call for help.</Text>
                  <Text variant="caption" muted>
                    {EMERGENCY_NUMBERS.map((e) => `${e.label} ${e.numbers.join(' or ')}`).join(' · ')}
                  </Text>
                </Notice>
              )}
            </View>
          )}

          {step === 1 && plain && (
            <>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Tap one</Text>
                <View style={styles.wrap}>
                  {plain.examples.map((ex) => (
                    <Chip
                      key={ex}
                      label={ex}
                      icon={title === ex ? 'checkmark' : undefined}
                      selected={title === ex}
                      onPress={() => {
                        setTitle(ex);
                        setHint(null);
                      }}
                    />
                  ))}
                </View>
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Or write it in your own words</Text>
                <TextInput
                  style={input}
                  placeholder="For example: Light broken outside the school"
                  placeholderTextColor={colors.textFaint}
                  value={title}
                  onChangeText={(t) => {
                    setTitle(t);
                    setHint(null);
                  }}
                  maxLength={120}
                  accessibilityLabel="What is wrong, in a few words"
                />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Anything else? <Text variant="label" muted>(you can skip this)</Text></Text>
                <TextInput
                  style={[input, { minHeight: 110, textAlignVertical: 'top', paddingTop: spacing.md }]}
                  placeholder="How long has it been like this? Is anyone in danger?"
                  placeholderTextColor={colors.textFaint}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  maxLength={4000}
                  accessibilityLabel="More details, optional"
                />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Add a photo <Text variant="label" muted>(you can skip this)</Text></Text>
                {media.length > 0 && (
                  <View style={styles.wrap}>
                    {media.map((m, i) => (
                      <View key={m.uri}>
                        <Image source={{ uri: m.uri }} style={styles.mediaThumb} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
                        {m.type === 'video' && <Icon name="videocam" size={16} color="#fff" style={styles.videoBadge} />}
                        <PressableScale
                          onPress={() => setMedia((all) => all.filter((_, j) => j !== i))}
                          accessibilityLabel={`Remove photo ${i + 1}`}
                          accessibilityRole="button"
                          style={[styles.remove, { backgroundColor: colors.overlay }]}>
                          <Icon name="close" size={16} color="#fff" />
                        </PressableScale>
                      </View>
                    ))}
                  </View>
                )}
                {media.length < 6 && (
                  <View style={styles.twoButtons}>
                    {Platform.OS !== 'web' && <Button kind="secondary" icon="camera" title="Take a photo" onPress={() => pickMedia(true)} style={{ flex: 1 }} />}
                    <Button kind="secondary" icon="images" title="Choose a photo" onPress={() => pickMedia(false)} style={{ flex: 1 }} />
                  </View>
                )}
                <Text variant="caption" muted>Try not to show people’s faces or car number plates.</Text>
              </View>
              {pin && (
                <View style={{ gap: spacing.sm }}>
                  <Text variant="label">Map pin <Text variant="label" muted>(you can change it)</Text></Text>
                  <PressableScale
                    onPress={() => setPinSheet(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Map pin: ${pin.label}. Change the picture or colour`}
                    style={[styles.pinCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
                    <MapPin color={pin.color} icon={pin.icon} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{pin.label}</Text>
                      <Text variant="caption" muted>This is how your report shows on the map.</Text>
                    </View>
                    <Text variant="label" color={colors.primary}>Change</Text>
                  </PressableScale>
                </View>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
                <ChoiceCard
                  icon="navigate"
                  title="I am there now"
                  hint="Use where my phone is"
                  selected={where === 'here'}
                  busy={locating}
                  onPress={() => chooseWhere('here')}
                />
                <ChoiceCard icon="map" title="Show it on the map" hint="Tap the map where the problem is" selected={where === 'map'} onPress={() => chooseWhere('map')} />
                <ChoiceCard
                  icon="eye-off"
                  title="Don’t share a place"
                  hint="The report won’t appear on the map"
                  selected={where === 'none'}
                  onPress={() => chooseWhere('none')}
                />
              </View>

              {sharePlace && (
                <>
                  <Text variant="label">
                    {point ? 'Is the pin in the right place? Tap the map to move it.' : 'Tap the map where the problem is.'}
                  </Text>
                  <View style={styles.mapBox}>
                    <ReportMap
                      initial={point ? { ...point, zoom: 16 } : undefined}
                      pick={{
                        value: point,
                        color,
                        icon: icon ?? undefined,
                        onPick: (p) => {
                          setPoint(p);
                          setHint(null);
                        },
                      }}
                      layers
                    />
                  </View>
                  <TextInput
                    style={input}
                    placeholder="Nearby place, e.g. next to the bus stop (optional)"
                    placeholderTextColor={colors.textFaint}
                    value={place}
                    onChangeText={setPlace}
                    maxLength={160}
                    accessibilityLabel="Nearby place or landmark, optional"
                  />
                </>
              )}

              {shownDupes.length > 0 && (
                <Notice tone="warning" icon="people">
                  <Text variant="label">Someone may have already reported this</Text>
                  <Text variant="caption" muted style={{ marginBottom: spacing.sm }}>
                    If one of these is the same problem, tap “Same problem”. Many people saying “me too” gets it noticed faster.
                  </Text>
                  {shownDupes.map((d) => (
                    <View key={d.id} style={styles.dupe}>
                      <View style={{ flex: 1, minWidth: 160 }}>
                        <Text variant="label" numberOfLines={2}>{d.title}</Text>
                        <Text variant="small" muted>{timeAgo(d.created_at)} · {d.me_too_count + 1} {d.me_too_count ? 'people' : 'person'}</Text>
                      </View>
                      <StatusPill status={d.status} />
                      <Button
                        kind="secondary"
                        title="Same problem"
                        haptic
                        onPress={async () => {
                          await setMeToo(d.id, user.id, true);
                          reader.stop();
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
              <View style={styles.wrap}>
                {WHEN.map((w, i) => (
                  <Chip key={w.label} label={w.label} icon={when === i ? 'checkmark' : undefined} selected={when === i} onPress={() => setWhen(i)} />
                ))}
              </View>
              <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
                <Text variant="label">Should people see your name?</Text>
                <ChoiceCard icon="person" title="Show my name" hint="People can see you reported it" selected={!anonymous} onPress={() => setAnonymous(false)} />
                <ChoiceCard
                  icon="eye-off"
                  title="Hide my name"
                  hint="Nobody sees who reported it. You can still follow it."
                  selected={anonymous}
                  onPress={() => setAnonymous(true)}
                />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">
                  Which town? <Text variant="label" muted>{town && townChoice === undefined ? '(we guessed from the pin)' : '(you can skip this)'}</Text>
                </Text>
                <View style={styles.wrap}>
                  {TOWNS.map((t) => (
                    <Chip key={t.name} label={t.name} selected={town === t.name} onPress={() => setTown(town === t.name ? null : t.name)} />
                  ))}
                </View>
              </View>
            </>
          )}

          {step === LAST && cat && plain && (
            <>
              <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
                <ReviewRow icon={cat.icon} iconBg={cat.color} label="The problem" value={`${title.trim()}\n${plain.label}`} onChange={() => goTo(1)} />
                {pin && <ReviewRow icon={pin.icon} iconBg={pin.color} label="Map pin" value={pin.label} onChange={() => { goTo(1); setPinSheet(true); }} />}
                <ReviewRow icon="images" label="Photos" value={media.length ? `${media.length} added` : 'None'} onChange={() => goTo(1)} />
                <ReviewRow icon="location" label="Place" value={placeLabel} onChange={() => goTo(2)} />
                <ReviewRow icon="time" label="When" value={whenLabel} onChange={() => goTo(3)} />
                <ReviewRow icon={anonymous ? 'eye-off' : 'person'} label="Your name" value={anonymous ? 'Hidden' : 'Shown'} onChange={() => goTo(3)} last />
              </Card>
              <Card style={{ gap: spacing.md }}>
                <Text variant="bodyStrong">What happens after you send it</Text>
                <NextLine n={1} text="Your report appears in the app for everyone to see." />
                <NextLine n={2} text="People who see the same problem can say “me too”." />
                <NextLine n={3} text="You can follow it in the Reports tab and see when it changes." />
              </Card>
            </>
          )}
        </Animated.View>

        {error && (
          <Notice tone="danger"><Text>{error}</Text></Notice>
        )}
      </ScrollView>

      {/* Sits right above the buttons so it's seen the moment Next is pressed. */}
      {hint && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.hint} accessibilityLiveRegion="polite" role="alert">
          <Notice tone="warning" icon="hand-left">
            <Text>{hint}</Text>
          </Notice>
        </Animated.View>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.background }]}>
        {step > 0 && <Button kind="secondary" icon="arrow-back" title="Back" onPress={() => goTo(step - 1)} style={{ flex: 1 }} />}
        {step < LAST ? (
          <Button
            title="Next"
            icon="arrow-forward"
            onPress={next}
            style={[{ flex: 2 }, !ready(step) && { opacity: 0.6 }]}
            accessibilityLabel={ready(step) ? 'Next' : `Next. ${NEED[step]}`}
          />
        ) : (
          <Button title="Send report" icon="send" haptic loading={busy} onPress={submit} style={{ flex: 2 }} />
        )}
      </View>
      {category && pin && (
        <Sheet visible={pinSheet} onClose={() => setPinSheet(false)} title="Map pin">
          <View style={{ gap: spacing.lg }}>
            <View style={[styles.pinPreview, { backgroundColor: colors.surfaceMuted }]}>
              <MapPin color={pin.color} icon={pin.icon} size={52} label={`Preview: ${pin.label}`} />
              <Text variant="bodyStrong">{pin.label}</Text>
            </View>
            <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel="Picture">
              <Text variant="label">Picture</Text>
              {chunk(ISSUE_ICONS[category], 4).map((row, ri) => (
                <View key={ri} style={styles.iconRow}>
                  {row.map((x) => {
                    if (!x) return <View key={`gap${ri}`} style={{ flex: 1 }} />;
                    const on = icon === x.icon;
                    return (
                      <PressableScale
                        key={x.icon + x.label}
                        onPress={() => setPinIcon(x.icon)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={x.label}
                        style={[styles.iconChoice, { backgroundColor: on ? colors.primarySoft : 'transparent', borderColor: on ? colors.primary : colors.separator }]}>
                        <View style={[styles.iconDot, { backgroundColor: on ? pin.color : colors.surfaceMuted }]}>
                          <Icon name={x.icon} size={22} color={on ? '#fff' : colors.textMuted} />
                        </View>
                        <Text variant="small" numberOfLines={2} style={{ textAlign: 'center' }}>{x.label}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel="Colour">
              <Text variant="label">Colour</Text>
              <View style={styles.wrap}>
                {PIN_COLORS.map((c) => (
                  <PressableScale
                    key={c}
                    onPress={() => setPinColor(c)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: color === c }}
                    accessibilityLabel={`Colour ${COLOR_NAME[c] ?? c}`}
                    style={[styles.swatch, { backgroundColor: c }]}>
                    {color === c && <Icon name="checkmark" size={18} color="#fff" />}
                  </PressableScale>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                kind="secondary"
                title="Reset"
                onPress={() => {
                  setPinIcon(null);
                  setPinColor(null);
                }}
                style={{ flex: 1 }}
              />
              <Button title="Done" icon="checkmark" onPress={() => setPinSheet(false)} style={{ flex: 1 }} />
            </View>
          </View>
        </Sheet>
      )}
    </KeyboardAvoidingView>
  );
}

function ReviewRow({
  icon,
  iconBg,
  label,
  value,
  onChange,
  last,
}: {
  icon: IconName;
  iconBg?: string;
  label: string;
  value: string;
  onChange: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.review, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <View style={[styles.reviewIcon, { backgroundColor: iconBg ?? colors.surfaceMuted }]}>
        <Icon name={icon} size={18} color={iconBg ? '#fff' : colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="small" muted>{label}</Text>
        <Text variant="bodyStrong">{value}</Text>
      </View>
      <PressableScale onPress={onChange} accessibilityRole="button" accessibilityLabel={`Change ${label.toLowerCase()}`} style={styles.change}>
        <Text variant="label" color={colors.primary}>Change</Text>
      </PressableScale>
    </View>
  );
}

function NextLine({ n, text }: { n: number; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View style={[styles.num, { backgroundColor: colors.primarySoft }]}>
        <Text variant="label" color={colors.primary}>{n}</Text>
      </View>
      <Text style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

/** Split a list into rows of n, padding the last row so every cell keeps the same width. */
function chunk<T>(items: T[], n: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push([...items.slice(i, i + n), ...Array(Math.max(0, i + n - items.length)).fill(null)]);
  return rows;
}

const COLOR_NAME: Record<string, string> = {
  '#D64545': 'red',
  '#E8664A': 'orange',
  '#E3A008': 'yellow',
  '#2E9D5B': 'green',
  '#0E7C74': 'teal',
  '#2F6FDB': 'blue',
  '#7A5AF8': 'purple',
  '#6B7A86': 'grey',
};

const styles = StyleSheet.create({
  pinCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  pinPreview: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.md },
  iconRow: { flexDirection: 'row', gap: spacing.xs },
  iconChoice: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingVertical: spacing.sm, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 1 },
  iconDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  progressWrap: { paddingHorizontal: GUTTER, paddingBottom: spacing.lg, gap: spacing.sm, width: '100%', maxWidth: 760, alignSelf: 'center' },
  progress: { flexDirection: 'row', gap: spacing.xs },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  listen: { minWidth: 64, minHeight: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: spacing.sm },
  input: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  twoButtons: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  mediaThumb: { width: 92, height: 92, borderRadius: radius.sm },
  videoBadge: { position: 'absolute', left: 6, bottom: 6 },
  remove: { position: 'absolute', top: 4, right: 4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 280, borderRadius: radius.lg, overflow: 'hidden' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dupe: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingVertical: spacing.xs },
  review: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 64 },
  reviewIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  change: { minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hint: { paddingHorizontal: GUTTER, paddingTop: spacing.sm, width: '100%', maxWidth: 760, alignSelf: 'center' },
  footer: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: GUTTER, paddingTop: spacing.md },
});
