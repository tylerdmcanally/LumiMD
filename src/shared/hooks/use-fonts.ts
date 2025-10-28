import { useCallback, useEffect, useState } from 'react';
import * as Font from 'expo-font';
import {
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';

export const useAppFonts = () => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        await Font.loadAsync({
          Manrope_300Light,
          Manrope_400Regular,
          Manrope_500Medium,
          Manrope_600SemiBold,
          Manrope_700Bold,
        });
        setLoaded(true);
      } catch (error) {
        console.warn('Failed to load fonts', error);
      }
    };

    load();
  }, []);

  return loaded;
};
