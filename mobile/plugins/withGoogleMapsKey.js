const {
  withAndroidManifest,
  withInfoPlist,
  AndroidConfig,
} = require("expo/config-plugins");

const KEY_META = "com.google.android.geo.API_KEY";

/**
 * Injects a Google Maps API key from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` into the
 * native manifests. No-op when the key is unset, so the app still builds and the
 * live map simply falls back to a coordinates panel.
 *
 * Registration order matters: `react-native-maps` removes this meta-data when its
 * `androidGoogleMapsApiKey` prop is absent, and Android manifest mods run in
 * reverse registration order. This plugin is therefore registered *before*
 * `react-native-maps` in `app.json` so it applies after that removal.
 */
module.exports = function withGoogleMapsKey(config) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return config;

  config = withAndroidManifest(config, (cfg) => {
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      KEY_META,
      apiKey,
    );
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.GMSApiKey = apiKey;
    return cfg;
  });

  return config;
};
