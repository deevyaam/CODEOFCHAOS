// Design tokens: colours, type, radius, spacing and shadows for light and dark.
// Shadows are soft (low opacity, high blur, larger Y offset). Containers have no borders.

export type Scheme = 'light' | 'dark';

const palette = {
  lagoon50: '#E6F5F4',
  lagoon100: '#C3E8E5',
  lagoon400: '#2AA39A',
  lagoon600: '#0E7C74',
  lagoon700: '#0A615B',
  coral400: '#F2836A',
  coral500: '#E8664A',
  sand50: '#FBF8F3',
  sand100: '#F4EFE6',
  ink900: '#0F1B22',
  ink800: '#18262E',
  ink700: '#22323B',
  ink600: '#2C3D47',
  slate500: '#5E6E77',
  slate400: '#8B99A1',
  slate300: '#B8C3C9',
};

export const colors = {
  light: {
    background: palette.sand50,
    surface: '#FFFFFF',
    surfaceMuted: palette.sand100,
    surfaceSunken: '#EEE8DD',
    text: palette.ink900,
    textMuted: palette.slate500,
    textFaint: palette.slate400,
    primary: palette.lagoon600,
    primaryPressed: palette.lagoon700,
    primarySoft: palette.lagoon50,
    onPrimary: '#FFFFFF',
    accent: palette.coral500,
    danger: '#C8372D',
    dangerSoft: '#FBE7E4',
    warning: '#B76E00',
    warningSoft: '#FFF2D6',
    success: '#2E7D32',
    successSoft: '#E5F3E6',
    separator: 'rgba(15,27,34,0.08)',
    placeholderHighlight: '#FFE9A8',
    tabBar: 'rgba(255,255,255,0.72)',
    overlay: 'rgba(15,27,34,0.35)',
  },
  dark: {
    background: '#0B1418',
    surface: palette.ink800,
    surfaceMuted: palette.ink700,
    surfaceSunken: '#111D22',
    text: '#EEF3F4',
    textMuted: palette.slate300,
    textFaint: palette.slate400,
    primary: '#4CC3B8',
    primaryPressed: palette.lagoon400,
    primarySoft: 'rgba(76,195,184,0.14)',
    onPrimary: '#04201D',
    accent: palette.coral400,
    danger: '#FF8A7E',
    dangerSoft: 'rgba(255,138,126,0.14)',
    warning: '#F5B451',
    warningSoft: 'rgba(245,180,81,0.14)',
    success: '#7BD389',
    successSoft: 'rgba(123,211,137,0.14)',
    separator: 'rgba(238,243,244,0.08)',
    placeholderHighlight: '#5A4A12',
    tabBar: 'rgba(24,38,46,0.72)',
    overlay: 'rgba(0,0,0,0.55)',
  },
} as const;

export type Colors = { [K in keyof typeof colors.light]: string };

/** Soft shadows, written as CSS box-shadow strings (supported on iOS, Android and web). */
export const shadows = {
  light: {
    card: '0px 10px 28px rgba(15, 27, 34, 0.07)',
    raised: '0px 16px 40px rgba(15, 27, 34, 0.12)',
    float: '0px 14px 36px rgba(15, 27, 34, 0.16)',
  },
  dark: {
    card: '0px 12px 30px rgba(0, 0, 0, 0.35)',
    raised: '0px 18px 44px rgba(0, 0, 0, 0.45)',
    float: '0px 16px 40px rgba(0, 0, 0, 0.55)',
  },
} as const;

export type Shadows = { [K in keyof typeof shadows.light]: string };

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Horizontal gutter used by every screen at phone width. */
export const GUTTER = 16;

export type Weight = 400 | 600 | 700;

/** Google Sans type scale. */
export const typeScale = {
  display: { size: 32, line: 38, weight: 700 as Weight, tracking: -0.4 },
  title: { size: 24, line: 30, weight: 700 as Weight, tracking: -0.2 },
  headline: { size: 19, line: 25, weight: 600 as Weight, tracking: 0 },
  body: { size: 16, line: 23, weight: 400 as Weight, tracking: 0 },
  bodyStrong: { size: 16, line: 23, weight: 600 as Weight, tracking: 0 },
  label: { size: 14, line: 19, weight: 600 as Weight, tracking: 0.1 },
  caption: { size: 13, line: 18, weight: 400 as Weight, tracking: 0.1 },
  small: { size: 12, line: 16, weight: 400 as Weight, tracking: 0.2 },
} as const;

export type TypeVariant = keyof typeof typeScale;

export const googleSansFamily: Record<Weight, string> = {
  400: 'GoogleSans_400Regular',
  600: 'GoogleSans_600SemiBold',
  700: 'GoogleSans_700Bold',
};
