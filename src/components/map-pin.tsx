// The teardrop map pin used everywhere a report is shown: the phone map, the report form preview and cards.
// The point of the drop is at the bottom centre, so maps should anchor it there ({ x: 0.5, y: 1 }).
import { View } from 'react-native';

import { Icon, type IconName } from './ui';

export function MapPin({ color, icon, size = 34, label }: { color: string; icon: IconName; size?: number; label?: string }) {
  const border = Math.max(2, Math.round(size / 12));
  return (
    <View
      // A square turned 45° is √2 × size from corner to corner: leave room above it and end exactly at its point.
      style={{ width: size * 1.42, height: size * 1.42, paddingTop: size * 0.21, alignItems: 'center' }}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}>
      <View
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          borderWidth: border,
          borderColor: '#fff',
          borderTopLeftRadius: size / 2,
          borderTopRightRadius: size / 2,
          borderBottomLeftRadius: size / 2,
          borderBottomRightRadius: 0,
          transform: [{ rotate: '45deg' }],
          boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View style={{ transform: [{ rotate: '-45deg' }] }}>
          <Icon name={icon} size={size * 0.48} color="#fff" />
        </View>
      </View>
    </View>
  );
}
