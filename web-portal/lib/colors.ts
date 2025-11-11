export const Colors = {
  primary: '#0A99A4',
  primaryDark: '#064E6D',
  accent: '#A3D8D0',
  warning: '#FFD166',
  error: '#FF6B6B',
  success: '#34D399',
  surface: '#FFFFFF',
  background: '#F9FAFB',
  text: '#1E293B',
  textMuted: '#64748B',
  border: 'rgba(0,0,0,0.06)',
  stroke: 'rgba(0,0,0,0.06)',
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
} as const;

export const spacing = (n: number) => n * 4;

