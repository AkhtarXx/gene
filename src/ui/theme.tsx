import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { services } from '../services';

/**
 * Design tokens — dark-first with a full light palette, single accent family,
 * motion curves. Screens read tokens through useTheme(); non-React code can
 * use the static palettes below.
 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

// spring used for press / entrance (stiffness 180, damping 20)
export const spring = { damping: 20, stiffness: 180 } as const;

// timing for non-spring (ms) — never exceed 500 unless hero entrance
export const dur = { fast: 180, base: 280, slow: 420 } as const;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 12, fontWeight: '400' as const },
  mono: { fontSize: 13, fontWeight: '400' as const },
} as const;

export interface Palette {
  bg: string;
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;
  accent2: string;
  accentText: string;
  userBubble: string;
  aiBubble: string;
  success: string;
  warn: string;
  danger: string;
  backdrop: string;
}

export const darkPalette: Palette = {
  bg: '#070A12',
  surface0: 'rgba(255,255,255,0.04)',
  surface1: 'rgba(255,255,255,0.07)',
  surface2: 'rgba(255,255,255,0.11)',
  border: 'rgba(255,255,255,0.10)',
  text: '#EAF0FF',
  textDim: 'rgba(234,240,255,0.62)',
  accent: '#5EEAD4',
  accent2: '#8B5CF6',
  accentText: '#06251F',
  userBubble: 'rgba(94,234,212,0.16)',
  aiBubble: 'rgba(139,92,246,0.14)',
  success: '#34D399',
  warn: '#FBBF24',
  danger: '#F87171',
  backdrop: 'rgba(0,0,0,0.75)',
};

export const lightPalette: Palette = {
  bg: '#F6F8FC',
  surface0: 'rgba(13,40,60,0.04)',
  surface1: 'rgba(255,255,255,0.85)',
  surface2: 'rgba(13,40,60,0.07)',
  border: 'rgba(13,40,60,0.12)',
  text: '#0B1220',
  textDim: 'rgba(11,18,32,0.62)',
  accent: '#0D9488',
  accent2: '#7C3AED',
  accentText: '#FFFFFF',
  userBubble: 'rgba(13,148,136,0.14)',
  aiBubble: 'rgba(124,58,237,0.10)',
  success: '#059669',
  warn: '#D97706',
  danger: '#DC2626',
  backdrop: 'rgba(11,18,32,0.55)',
};

/** Dark palette kept as the static default for non-React consumers. */
export const color = darkPalette;

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  theme: 'dark' | 'light';
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  color: Palette;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  mode: 'system',
  setMode: () => {},
  color: darkPalette,
});

const THEME_SETTING_KEY = 'theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Restore the persisted preference once.
  useEffect(() => {
    let cancelled = false;
    services.store
      .getSetting(THEME_SETTING_KEY)
      .then((value) => {
        if (!cancelled && (value === 'dark' || value === 'light' || value === 'system')) {
          setModeState(value);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    services.store.setSetting(THEME_SETTING_KEY, next).catch(() => {});
  };

  const theme = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  const value = useMemo(
    () => ({ theme, mode, setMode, color: theme === 'light' ? lightPalette : darkPalette }),
    [theme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
