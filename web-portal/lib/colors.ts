export const Colors = {
  primary: '#40C9D0',
  secondary: '#89D8C6',
  primaryDark: '#078A94',
  accent: '#0A99A4',
  warning: '#FBBF24',
  error: '#F87171',
  success: '#34D399',
  surface: '#FFFFFF',
  background: '#F8FAFB',
  text: '#1A2332',
  textMuted: '#4A5568',
  border: 'rgba(26,35,50,0.08)',
  stroke: 'rgba(26,35,50,0.08)',
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
} as const;

export const spacing = (n: number) => n * 4;

