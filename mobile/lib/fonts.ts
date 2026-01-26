/**
 * Font loading utilities for LumiMD
 * Uses Plus Jakarta Sans for display/heading text
 */

import * as Font from 'expo-font';

export const customFonts = {
  'PlusJakartaSans-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
  'PlusJakartaSans-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
};

export async function loadFonts(): Promise<void> {
  await Font.loadAsync(customFonts);
}

export function useFontsLoaded(): boolean {
  const [fontsLoaded] = Font.useFonts(customFonts);
  return fontsLoaded;
}
