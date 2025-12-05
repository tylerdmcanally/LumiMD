import React from 'react';
import { Platform } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

type KeepDeviceAwakeProps = {
  tag?: string;
};

/**
 * Keeps the device awake while mounted.
 * Render conditionally (e.g., only while recording) to control activation.
 */
export function KeepDeviceAwake({ tag = 'default' }: KeepDeviceAwakeProps) {
  try {
    useKeepAwake(tag);
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[KeepDeviceAwake] Unable to enable keep-awake on this platform',
        Platform.OS,
        error,
      );
    }
  }

  return null;
}

