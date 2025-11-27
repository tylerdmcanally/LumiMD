/**
 * LumiMD Design System - Design Tokens
 * Premium UI/UX - Soft, approachable, professional
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const colors = {
  // Brand Colors (cyan ➝ mint gradient)
  brand: {
    primary: '#40C9D0',
    primaryLight: '#5DD3D9',
    primaryDark: '#078A94',
    secondary: '#89D8C6',
    accent: '#0A99A4',
    primaryPale: '#E1F9FA',
    accentLight: '#BEE7DF',
  },

  // Background & Surface
  background: {
    default: '#F8FAFB',
    subtle: '#F3F5F7',
    white: '#FFFFFF',
  },

  // Text Hierarchy
  text: {
    primary: '#1A2332',
    secondary: '#4A5568',
    tertiary: '#6B7280',
    muted: '#9CA3AF',
    inverse: '#FFFFFF',
  },

  // Status Colors (soft, approachable)
  status: {
    success: '#34D399',
    successLight: '#D1FAE5',
    successDark: '#059669',
    warning: '#FBBF24',
    warningLight: '#FEF3C7',
    warningDark: '#D97706',
    error: '#F87171',
    errorLight: '#FEE2E2',
    errorDark: '#DC2626',
    info: '#60A5FA',
    infoLight: '#DBEAFE',
    infoDark: '#2563EB',
  },

  // Semantic Colors
  semantic: {
    border: 'rgba(26, 35, 50, 0.08)',
    borderLight: 'rgba(26, 35, 50, 0.04)',
    divider: 'rgba(26, 35, 50, 0.06)',
    overlay: 'rgba(26, 35, 50, 0.40)',
    hover: 'rgba(64, 201, 208, 0.10)',
    pressed: 'rgba(64, 201, 208, 0.18)',
    focus: 'rgba(64, 201, 208, 0.26)',
  },

  // Gradient Definitions
  gradients: {
    primary: 'linear-gradient(135deg, #40C9D0 0%, #89D8C6 100%)',
    primarySoft: 'linear-gradient(135deg, #5DD3D9 0%, #89D8C6 100%)',
    accent: 'linear-gradient(135deg, #0A99A4 0%, #078A94 100%)',
    warm: 'linear-gradient(135deg, #FEF3C7 0%, #FBBF24 100%)',
    cool: 'linear-gradient(135deg, #DBEAFE 0%, #60A5FA 100%)',
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
  // Font Families
  fontFamily: {
    sans: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Display", sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace',
  },

  // Font Sizes
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
  },

  // Font Weights
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line Heights
  lineHeight: {
    tight: 1.2,
    snug: 1.4,
    normal: 1.6,
    relaxed: 1.8,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.02em',
    tight: '-0.01em',
    normal: '0',
    wide: '0.01em',
    wider: '0.05em',
  },
} as const;

// ============================================================================
// SPACING & SIZING
// ============================================================================

export const spacing = {
  // Base unit: 8px (4pt grid system)
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  7: '1.75rem',  // 28px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
  24: '6rem',    // 96px
} as const;

export const sizing = {
  // Common UI element sizes
  input: {
    sm: '36px',
    md: '44px',
    lg: '52px',
  },
  button: {
    sm: '36px',
    md: '44px',
    lg: '52px',
  },
  icon: {
    xs: '16px',
    sm: '20px',
    md: '24px',
    lg: '32px',
    xl: '40px',
  },
  avatar: {
    sm: '32px',
    md: '40px',
    lg: '48px',
    xl: '64px',
  },
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.5rem',    // 24px
  '2xl': '2rem',   // 32px
  full: '9999px',
} as const;

// ============================================================================
// SHADOWS & DEPTH
// ============================================================================

export const shadows = {
  // Elevation shadows
  sm: '0 2px 8px rgba(64, 201, 208, 0.05)',
  base: '0 4px 16px rgba(64, 201, 208, 0.07)',
  md: '0 4px 20px rgba(64, 201, 208, 0.09)',
  lg: '0 8px 32px rgba(64, 201, 208, 0.13)',
  xl: '0 12px 40px rgba(64, 201, 208, 0.17)',
  '2xl': '0 20px 60px rgba(64, 201, 208, 0.21)',

  // Named shadows
  elevated: '0 4px 20px rgba(64, 201, 208, 0.09)',
  floating: '0 12px 40px rgba(64, 201, 208, 0.13)',
  hover: '0 8px 32px rgba(64, 201, 208, 0.17)',

  // Inner shadows
  inner: 'inset 0 2px 4px rgba(26, 35, 50, 0.06)',
  innerLg: 'inset 0 4px 8px rgba(26, 35, 50, 0.08)',

  // No shadow
  none: 'none',
} as const;

// ============================================================================
// ANIMATIONS & TRANSITIONS
// ============================================================================

export const animations = {
  // Duration
  duration: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Easing Functions
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // Transform presets
  transform: {
    scaleUp: 'scale(1.02)',
    scaleDown: 'scale(0.98)',
    liftUp: 'translateY(-4px)',
    liftUpLg: 'translateY(-8px)',
  },

  // Keyframes
  keyframes: {
    fadeIn: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    fadeInUp: {
      from: { opacity: 0, transform: 'translateY(8px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    slideInRight: {
      from: { transform: 'translateX(100%)' },
      to: { transform: 'translateX(0)' },
    },
    shimmer: {
      '0%': { backgroundPosition: '-200% 0' },
      '100%': { backgroundPosition: '200% 0' },
    },
    pulse: {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.5 },
    },
  },
} as const;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

export const layout = {
  // Container widths
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1440px',
  },

  // Sidebar
  sidebar: {
    width: '280px',
    widthCollapsed: '80px',
  },

  // Top bar
  topBar: {
    height: '72px',
  },

  // Grid gaps
  gap: {
    sm: '24px',
    md: '32px',
    lg: '40px',
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

// ============================================================================
// Z-INDEX LAYERS
// ============================================================================

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  overlay: 400,
  modal: 500,
  popover: 600,
  toast: 700,
  tooltip: 800,
} as const;

// ============================================================================
// ACCESSIBILITY
// ============================================================================

export const a11y = {
  // Minimum touch target sizes
  minTouchTarget: '44px',

  // Focus ring
  focusRing: {
    width: '2px',
    offset: '2px',
    color: colors.semantic.focus,
  },

  // Contrast ratios (WCAG AA)
  contrastRatio: {
    normal: 4.5,
    large: 3,
  },
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a CSS variable reference
 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/**
 * Create a consistent transition string
 */
export function transition(
  property: string | string[],
  duration: keyof typeof animations.duration = 'base',
  easing: keyof typeof animations.easing = 'default'
): string {
  const props = Array.isArray(property) ? property : [property];
  return props
    .map((prop) => `${prop} ${animations.duration[duration]} ${animations.easing[easing]}`)
    .join(', ');
}

/**
 * Create a media query for responsive breakpoints
 */
export function mediaQuery(breakpoint: keyof typeof layout.breakpoints): string {
  return `@media (min-width: ${layout.breakpoints[breakpoint]})`;
}

