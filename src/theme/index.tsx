import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useColorScheme, type TextStyle } from 'react-native';

import { usePref } from '@/lib/prefs';

import {
  colors,
  googleSansFamily,
  shadows,
  typeScale,
  type Colors,
  type Scheme,
  type Shadows,
  type TypeVariant,
} from './tokens';

export * from './tokens';

type Theme = {
  scheme: Scheme;
  colors: Colors;
  shadows: Shadows;
  type: (variant: TypeVariant) => TextStyle;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = usePref('appearance');
  const font = usePref('font');
  const device = useColorScheme();
  const scheme: Scheme =
    appearance === 'device' ? (device === 'dark' ? 'dark' : 'light') : appearance;

  const value = useMemo<Theme>(() => {
    const useGoogleSans = font === 'google-sans';
    return {
      scheme,
      colors: colors[scheme],
      shadows: shadows[scheme],
      type: (variant) => {
        const t = typeScale[variant];
        return {
          fontSize: t.size,
          lineHeight: t.line,
          letterSpacing: t.tracking,
          // Custom font files carry their own weight; the phone font uses fontWeight.
          ...(useGoogleSans
            ? { fontFamily: googleSansFamily[t.weight] }
            : {
                fontFamily: Platform.select({ web: 'system-ui, sans-serif', default: undefined }),
                fontWeight: String(t.weight) as TextStyle['fontWeight'],
              }),
        };
      },
    };
  }, [scheme, font]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
