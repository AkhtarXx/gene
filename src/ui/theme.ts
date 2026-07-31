/**
 * Design tokens — dark-first, single accent, motion curves.
 * Critique gate (ui-3d-design skill): hierarchy / consistency / feedback /
 * motion-purpose / density / a11y / perf / cohesion.
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

export const color = {
  bg: '#070A12',
  surface0: 'rgba(255,255,255,0.04)',
  surface1: 'rgba(255,255,255,0.07)',
  surface2: 'rgba(255,255,255,0.11)',
  border: 'rgba(255,255,255,0.10)',
  text: '#EAF0FF',
  textDim: 'rgba(234,240,255,0.62)',
  // single accent — electric cyan/violet gradient family
  accent: '#5EEAD4',
  accent2: '#8B5CF6',
  userBubble: 'rgba(94,234,212,0.16)',
  aiBubble: 'rgba(139,92,246,0.14)',
  success: '#34D399',
  warn: '#FBBF24',
  danger: '#F87171',
} as const;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' as const },
  mono: { fontSize: 13, fontWeight: '400' as const },
} as const;
