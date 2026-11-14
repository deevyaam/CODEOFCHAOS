// App mark: a map pin with a wave — the island and its community.
import Svg, { Circle, Path } from 'react-native-svg';

export function Logo({ size = 64, color = '#FFFFFF', accent = '#F2836A' }: { size?: number; color?: string; accent?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Ansam Moris">
      <Path
        d="M32 4c-11 0-20 8.6-20 19.6C12 38 32 60 32 60s20-22 20-36.4C52 12.6 43 4 32 4z"
        fill={color}
      />
      <Path d="M19 27c3.5-3 6.5-3 10 0s6.5 3 10 0 4.5-2.4 6-1.8" stroke="#0E7C74" strokeWidth={3.2} strokeLinecap="round" fill="none" />
      <Circle cx={32} cy={18} r={5} fill={accent} />
    </Svg>
  );
}
