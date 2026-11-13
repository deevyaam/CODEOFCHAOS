import { Image } from 'expo-image';
import { View } from 'react-native';

import type { Profile } from '@/lib/session';
import { BUCKETS, publicUrl } from '@/lib/supabase';

import { Icon, Text, type IconName } from './ui';

export const AVATAR_COLORS = ['#0E7C74', '#E8664A', '#2F6FDB', '#7A5AF8', '#D64545', '#2E9D5B', '#B76E00', '#4B5563'];
export const AVATAR_ICONS: IconName[] = ['person', 'happy', 'leaf', 'boat', 'sunny', 'flower', 'paw', 'bicycle', 'football', 'musical-notes', 'heart', 'star'];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({
  profile,
  name,
  size = 40,
}: {
  profile: Pick<Profile, 'avatar_kind' | 'avatar_path' | 'avatar_icon' | 'avatar_color' | 'updated_at'> | null;
  name: string;
  size?: number;
}) {
  const bg = profile?.avatar_color ?? AVATAR_COLORS[name.length % AVATAR_COLORS.length];
  const common = { width: size, height: size, borderRadius: size / 2 };
  if (profile?.avatar_kind === 'photo' && profile.avatar_path) {
    return (
      <Image
        source={{ uri: `${publicUrl(BUCKETS.avatars, profile.avatar_path)}?v=${profile.updated_at ?? ''}` }}
        style={common}
        contentFit="cover"
        accessibilityLabel={`${name}'s photo`}
      />
    );
  }
  return (
    <View style={[common, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel={name}>
      {profile?.avatar_kind === 'icon' && profile.avatar_icon ? (
        <Icon name={profile.avatar_icon as IconName} size={size * 0.52} color="#fff" />
      ) : (
        <Text variant="label" color="#fff" style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}
