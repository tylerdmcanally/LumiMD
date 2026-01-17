const jestExpoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...jestExpoPreset,
  setupFiles: ['<rootDir>/jest/react-native-setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.(spec|test).(ts|tsx|js|jsx)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo'],
        plugins: ['@babel/plugin-transform-flow-strip-types'],
      },
    ],
    ...jestExpoPreset.transform,
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|expo|expo-modules-core|expo-router|@expo|@expo/vector-icons|@react-native-firebase)/)',
  ],
  moduleNameMapper: {
    ...(jestExpoPreset.moduleNameMapper || {}),
    '^react-native$': '<rootDir>/jest/react-native.js',
    '^react-native/jest/mock$': '<rootDir>/jest/react-native-mock.js',
    '^react-native/Libraries/vendor/core/ErrorUtils$': '<rootDir>/jest/react-native-error-utils.js',
    '^react-native/Libraries/BatchedBridge/NativeModules$':
      '<rootDir>/jest/react-native-native-modules.js',
    '^react-native/Libraries/Animated/NativeAnimatedHelper$':
      '<rootDir>/jest/react-native-native-animated-helper.js',
    '^expo-linear-gradient$': '<rootDir>/jest/expo-linear-gradient.js',
    '^expo-keep-awake$': '<rootDir>/jest/expo-keep-awake.js',
  },
};
