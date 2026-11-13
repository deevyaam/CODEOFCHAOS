import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ScrollView, StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme';

export function MediaStrip({ items, height = 200 }: { items: { url: string; type: 'image' | 'video' }[]; height?: number }) {
  if (!items.length) return null;
  if (items.length === 1) return <MediaItemView item={items[0]} style={{ height, width: '100%' }} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {items.map((m) => (
        <MediaItemView key={m.url} item={m} style={{ height, width: height * 1.3 }} />
      ))}
    </ScrollView>
  );
}

function MediaItemView({ item, style }: { item: { url: string; type: 'image' | 'video' }; style: object }) {
  if (item.type === 'video') return <Video url={item.url} style={style} />;
  return <Image source={{ uri: item.url }} style={[styles.media, style]} contentFit="cover" accessibilityLabel="Attached photo" />;
}

function Video({ url, style }: { url: string; style: object }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={[styles.media, style]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="cover" fullscreenOptions={{ enable: true }} />
    </View>
  );
}

const styles = StyleSheet.create({
  media: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#0002' },
});
