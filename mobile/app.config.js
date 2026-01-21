const appJson = require('./app.json');

module.exports = ({ config }) => {
  const baseConfig = appJson.expo ?? config;
  const buildNumber = process.env.EAS_BUILD_NUMBER
    ?? baseConfig?.ios?.buildNumber
    ?? '1';

  return {
    ...baseConfig,
    ios: {
      ...baseConfig.ios,
      buildNumber: String(buildNumber),
    },
  };
};
