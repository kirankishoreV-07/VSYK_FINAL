/**
 * VSYK CHITS Design System Constants
 * Extracted pixel-perfectly from all HTML design reference files.
 */

// ── Brand Colors ──────────────────────────────────────────────
export const Colors = {
  primary: '#01789E',           // Deep Navy Blue
  primaryContainer: '#01789E',
  secondary: '#10D7CD',         // Vibrant Teal Accent
  secondaryContainer: '#10D7CD',
  background: '#F8FAFC',        // Soft Off-White
  surface: '#FFFFFF',           // Pure White cards
  onSurface: '#0b1c30',
  onSurfaceVariant: '#3f484e',
  onBackground: '#0b1c30',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  outline: '#6f787e',
  outlineVariant: '#bec8ce',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  surfaceContainer: '#F1F5F9',
  surfaceContainerLow: '#F1F5F9',
  surfaceContainerHigh: '#E2E8F0',
  surfaceContainerLowest: '#FFFFFF',
  primaryFixed: '#c1e8ff',
  primaryFixedDim: '#7cd1fb',
  inverseSurface: '#213145',
  inverseOnSurface: '#eaf1ff',
} as const;

// ── Spacing (4px grid) ───────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  containerPadding: 20,
  gutter: 16,
} as const;

// ── Shadows ──────────────────────────────────────────────────
export const Shadows = {
  /** The signature VSYK blue-tinted premium shadow */
  blueTint: {
    shadowColor: '#01789E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  /** Premium card shadow */
  premium: {
    shadowColor: '#01789E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  /** Subtle card shadow */
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

// ── Border Radii ─────────────────────────────────────────────
export const Radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
  full: 9999,
} as const;

// ── Typography ───────────────────────────────────────────────
export const Typography = {
  displayLg: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.96,
  },
  headlineLg: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.32,
  },
  headlineMd: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 24,
    lineHeight: 32,
  },
  bodyXl: {
    fontFamily: 'Inter_400Regular',
    fontSize: 20,
    lineHeight: 30,
  },
  bodyMd: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  bodySm: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  labelMd: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  labelSm: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    lineHeight: 14,
  },
} as const;
