// Illustrated shoreline: sky follows the real sun elevation, the sun/moon move along an arc,
// the moon shows its phase, clouds follow cloud cover and drift with the wind, rain falls when it rains,
// and the palm sways with the wind. "Static" style or Reduce Motion freezes everything.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { dayProgress, moonPhase, rainIntensity, sunElevation, type Forecast } from '@/lib/weather';

const W = 360;
const H = 160;

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function skyColors(elev: number, cloud: number): [string, string] {
  // night < -6°, twilight -6..6°, day > 6°
  let top: string;
  let bottom: string;
  if (elev < -6) [top, bottom] = ['#0B1530', '#1D2E55'];
  else if (elev < 6) {
    const t = (elev + 6) / 12;
    top = mix('#1D2E55', '#3E7CC9', t);
    bottom = mix('#F08A5D', '#BFE3F2', t);
  } else [top, bottom] = ['#3E8FD8', '#BFE6F5'];
  const grey = cloud / 100;
  return [mix(top, elev < -6 ? '#2A3140' : '#8C9AA8', grey * 0.6), mix(bottom, elev < -6 ? '#3A4250' : '#C9D2DA', grey * 0.6)];
}

export function WeatherScene({ forecast, animate }: { forecast: Forecast; animate: boolean }) {
  const now = new Date();
  const { current } = forecast;
  const today = forecast.daily[0];
  const elev = sunElevation(now, forecast.lat, forecast.lng);
  const progress = today ? dayProgress(now, today.sunrise, today.sunset) : 0.5;
  const phase = moonPhase(now);
  const rain = rainIntensity(current.code, current.precip);
  const [skyTop, skyBottom] = skyColors(elev, current.cloud);
  const isNight = elev < -2;

  // Sun follows a 0..1 arc across the day; the moon uses the mirrored arc at night.
  const arcT = isNight ? (((progress % 1) + 1) % 1) : Math.min(1, Math.max(0, progress));
  const bodyX = 30 + arcT * (W - 60);
  const bodyY = 104 - Math.sin(arcT * Math.PI) * 76;

  const cloudCount = Math.round((current.cloud / 100) * 5);
  const windFactor = Math.min(1, current.wind / 40);

  // Animation drivers (UI thread).
  const drift = useSharedValue(0);
  const wave = useSharedValue(0);
  const fall = useSharedValue(0);
  const sway = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      [drift, wave, fall, sway].forEach((v) => {
        cancelAnimation(v);
        v.set(0);
      });
      return;
    }
    const linear = Easing.linear;
    drift.set(withRepeat(withTiming(1, { duration: 60000 / (0.4 + windFactor), easing: linear }), -1));
    wave.set(withRepeat(withTiming(1, { duration: 6000, easing: linear }), -1));
    fall.set(withRepeat(withTiming(1, { duration: 700, easing: linear }), -1));
    sway.set(withRepeat(withTiming(1, { duration: 2600 - windFactor * 1200, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => [drift, wave, fall, sway].forEach((v) => cancelAnimation(v));
  }, [animate, windFactor, drift, wave, fall, sway]);

  const cloudsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: `${-drift.value * 50}%` }] }));
  const waveStyle = useAnimatedStyle(() => ({ transform: [{ translateX: `${-wave.value * (100 / 12)}%` }] }));
  const rainStyle = useAnimatedStyle(() => ({ transform: [{ translateY: fall.value * 40 }] }));
  const palmStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(sway.value - 0.5) * (2 + windFactor * 8)}deg` }],
  }));

  const clouds = useMemo(
    () =>
      Array.from({ length: cloudCount }, (_, i) => ({
        x: (i * 97 + 20) % W,
        y: 18 + ((i * 23) % 40),
        s: 0.7 + ((i * 37) % 10) / 20,
      })),
    [cloudCount],
  );
  const drops = useMemo(
    () => Array.from({ length: Math.round(rain * 50) }, (_, i) => ({ x: (i * 53) % W, y: (i * 29) % 120 - 40 })),
    [rain],
  );

  const cloudFill = isNight ? '#59647A' : rain > 0.3 ? '#9AA6B2' : '#FFFFFF';

  return (
    <View style={styles.root} accessible accessibilityRole="image" accessibilityLabel="Illustration of the current weather on the shore">
      {/* Sky, sun or moon, hills, sand */}
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={skyTop} />
            <Stop offset="1" stopColor={skyBottom} />
          </LinearGradient>
          <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isNight ? '#123049' : '#2BA6B5'} />
            <Stop offset="1" stopColor={isNight ? '#0B2236' : '#167F8F'} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#sky)" />
        {isNight &&
          [12, 48, 90, 150, 210, 260, 300, 335].map((x, i) => (
            <Circle key={x} cx={x} cy={14 + ((i * 17) % 50)} r={i % 3 === 0 ? 1.2 : 0.8} fill="#fff" opacity={1 - current.cloud / 120} />
          ))}
        {isNight ? <Moon x={bodyX} y={bodyY} phase={phase} /> : <Circle cx={bodyX} cy={bodyY} r={13} fill="#FFD66B" opacity={1 - current.cloud / 160} />}
        {/* distant mountain */}
        <Path d={`M0 104 L40 84 L70 92 L110 62 L132 72 L160 58 L196 96 L360 100 L360 112 L0 112 Z`} fill={isNight ? '#1C2B3A' : '#4C7A6A'} opacity={0.9} />
        <Rect x={0} y={104} width={W} height={34} fill="url(#sea)" />
        <Path d={`M0 140 Q120 128 230 136 T360 132 L360 160 L0 160 Z`} fill={isNight ? '#5E5646' : '#EBD9B0'} />
      </Svg>

      {/* Waves (two copies side by side so the loop is seamless) */}
      <Animated.View style={[styles.layer, { top: '64%', width: '200%' }, waveStyle]} pointerEvents="none">
        <Svg width="100%" height={14} viewBox="0 0 720 14" preserveAspectRatio="none">
          <Path
            d={Array.from({ length: 12 }, (_, i) => `M${i * 60} 7 q15 -6 30 0 t30 0`).join(' ')}
            stroke="#FFFFFF"
            strokeOpacity={0.45}
            strokeWidth={1.6}
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Clouds */}
      {clouds.length > 0 && (
        <Animated.View style={[styles.layer, { top: 0, width: '200%', height: '60%' }, cloudsStyle]} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox={`0 0 ${W * 2} 96`} preserveAspectRatio="none">
            {[0, W].map((offset) => (
              <G key={offset}>
                {clouds.map((c, i) => (
                  <G key={i} transform={`translate(${c.x + offset} ${c.y}) scale(${c.s})`} opacity={0.92}>
                    <Circle cx={0} cy={10} r={11} fill={cloudFill} />
                    <Circle cx={14} cy={4} r={14} fill={cloudFill} />
                    <Circle cx={30} cy={10} r={11} fill={cloudFill} />
                    <Rect x={0} y={10} width={30} height={11} fill={cloudFill} />
                  </G>
                ))}
              </G>
            ))}
          </Svg>
        </Animated.View>
      )}

      {/* Rain */}
      {drops.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, rainStyle]} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {drops.map((d, i) => (
              <Path key={i} d={`M${d.x} ${d.y} l-3 9`} stroke="#DCEBFA" strokeOpacity={0.7} strokeWidth={1.2} />
            ))}
          </Svg>
        </Animated.View>
      )}

      {/* Palm tree, pivoting at its base */}
      <Animated.View style={[styles.palm, palmStyle]} pointerEvents="none">
        <Svg width={70} height={96} viewBox="0 0 70 96">
          <Path d="M36 96 C34 70 38 46 46 26" stroke={isNight ? '#2B2620' : '#7A5634'} strokeWidth={5} fill="none" strokeLinecap="round" />
          {['M46 26 C30 14 14 18 6 30', 'M46 26 C58 10 66 12 70 22', 'M46 26 C40 6 28 2 18 6', 'M46 26 C62 22 68 34 66 44', 'M46 26 C30 26 22 38 22 48'].map((d) => (
            <Path key={d} d={d} stroke={isNight ? '#1F3A2C' : '#2F7D4F'} strokeWidth={5} fill="none" strokeLinecap="round" />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

function Moon({ x, y, phase }: { x: number; y: number; phase: number }) {
  // Draw the lit part: terminator is an ellipse whose x-radius follows cos(phase).
  const r = 11;
  const k = Math.cos(phase * 2 * Math.PI); // 1 new, -1 full
  const waxing = phase < 0.5;
  const rx = Math.abs(k) * r;
  const outer = waxing ? 1 : 0; // sweep for the lit limb
  const inner = k > 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  const d = `M${x} ${y - r} A${r} ${r} 0 0 ${outer} ${x} ${y + r} A${rx} ${r} 0 0 ${inner} ${x} ${y - r} Z`;
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill="#C9CED8" opacity={0.18} />
      <Path d={d} fill="#F4F1E1" />
    </G>
  );
}

const styles = StyleSheet.create({
  root: { height: 160, overflow: 'hidden' },
  layer: { position: 'absolute', left: 0 },
  palm: { position: 'absolute', right: 18, bottom: 6, width: 70, height: 96, transformOrigin: '50% 100%' },
});
