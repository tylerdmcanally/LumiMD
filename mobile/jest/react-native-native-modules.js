const mockNativeModules = {
  UIManager: {},
  Linking: {},
  NativeUnimoduleProxy: {
    modulesConstants: {
      mockDefinition: {
        ExponentConstants: {
          experienceUrl: { mock: '' },
        },
      },
    },
    viewManagersMetadata: {},
  },
};

module.exports = {
  __esModule: true,
  default: mockNativeModules,
};
