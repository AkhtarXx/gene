const { withPodfileProperties } = require('@expo/config-plugins');

/**
 * op-sqlite links its own SQLite pod. Because expo-dev-client pulls in
 * expo-updates (which also links SQLite), an iOS build would fail with
 * duplicate-symbol errors unless we tell expo-updates to defer to the
 * third-party pod. This sets `expo.updates.useThirdPartySQLitePod=true`
 * in ios/Podfile.properties.json at prebuild time.
 */
module.exports = function withThirdPartySqlite(config) {
  return withPodfileProperties(config, (cfg) => {
    cfg.modResults['expo.updates.useThirdPartySQLitePod'] = 'true';
    return cfg;
  });
};
