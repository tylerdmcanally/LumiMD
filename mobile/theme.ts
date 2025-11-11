import { Theme, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Colors } from './components/ui';

export const navTheme = (scheme: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: Colors.primary,
      background: Colors.background,
      card: Colors.surface,
      text: Colors.text,
      border: Colors.stroke,
      notification: Colors.accent,
    }
  };
};
