/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  icon: 'https://github.com/expo.png',
  entitlements: {
    "com.apple.security.application-groups": ["group.com.lumimd.app"]
  },
  // Note: Version syncing is handled by withWidgetVersionSync.js config plugin
  // which runs after @bacons/apple-targets and ensures widget version matches parent
});