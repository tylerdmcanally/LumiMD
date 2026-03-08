export const Colors = {
  primary: '#40C9D0',
  secondary: '#89D8C6',
  primaryDark: '#078A94',
  accent: '#0A99A4',
  warning: '#E8A838',
  error: '#D64545',
  success: '#4CAF79',
  surface: '#FDFCF9',
  background: '#FAFAF7',
  accentWarm: '#E07A5F',
  text: '#1F2D32',
  textMuted: '#4A5D64',
  border: 'rgba(38,35,28,0.10)',
  stroke: 'rgba(38,35,28,0.10)',
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
} as const;

export const spacing = (n: number) => n * 4;
