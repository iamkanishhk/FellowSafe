const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Makes an incoming SOS able to take over the screen.
 *
 * A full-screen intent only becomes a call-style takeover if the launched
 * activity opts in at the manifest level, and Android 14+ also gates the
 * notification on holding USE_FULL_SCREEN_INTENT. Neither is expressible in
 * app.json, so this plugin edits the generated manifest during prebuild.
 */
module.exports = function withFullScreenIntent(config) {
  return withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults;

    const application = manifest.application?.[0];
    if (application) {
      for (const activity of application.activity ?? []) {
        const name = activity.$?.["android:name"] ?? "";
        if (name === ".MainActivity" || name.endsWith(".MainActivity")) {
          activity.$["android:showWhenLocked"] = "true";
          activity.$["android:turnScreenOn"] = "true";
        }
      }
    }

    const permissions = manifest["uses-permission"] ?? [];
    const alreadyDeclared = permissions.some(
      (entry) =>
        entry.$?.["android:name"] === "android.permission.USE_FULL_SCREEN_INTENT",
    );
    if (!alreadyDeclared) {
      permissions.push({
        $: { "android:name": "android.permission.USE_FULL_SCREEN_INTENT" },
      });
    }
    manifest["uses-permission"] = permissions;

    return config;
  });
};
