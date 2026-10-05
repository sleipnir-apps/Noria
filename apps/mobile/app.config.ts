// Dynamic app config: derives the display name and the Android/iOS
// app identifiers from the APP_VARIANT env var so multiple builds can
// coexist on the same device (prod APK, staging APK, and one APK per
// PR preview).
//
// APP_VARIANT is set per EAS build profile (see apps/mobile/eas.json):
//   - unset            -> "n0md3l4pP"                / com.sleipnir.n0md3l4pppascal
//   - "staging"        -> "n0md3l4pP staging"        / com.sleipnir.n0md3l4pppascal.staging
//   - "pr-42"          -> "n0md3l4pP pr-42"          / com.sleipnir.n0md3l4pppascal.pr42
//
// The PR number is injected by the workflow (.github/workflows/mobile-build.yml)
// via EAS Build env vars, so each PR gets a separately installable APK.
import type { ExpoConfig } from "expo/config";

const BASE_NAME = "n0md3l4pP";
const BASE_PACKAGE = "com.sleipnir.n0md3l4pppascal";
const BASE_BUNDLE_ID = "com.sleipnir.n0md3l4pppascal";

export default (): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? "";
  const variantSuffix = variant.replace(/-/g, "");

  const config: ExpoConfig = {
    name: BASE_NAME,
    slug: "n0md3l4pp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./src/assets/images/icon.png",
    scheme: "n0md3l4pp",
    userInterfaceStyle: "automatic",
    ios: {
      bundleIdentifier: BASE_BUNDLE_ID,
      icon: "./src/assets/expo.icon",
    },
    android: {
      package: BASE_PACKAGE,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./src/assets/images/android-icon-foreground.png",
        backgroundImage: "./src/assets/images/android-icon-background.png",
        monochromeImage: "./src/assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./src/assets/images/favicon.png",
    },
    plugins: [
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
          faceIDPermission: "Allow $(PRODUCT_NAME) to access your Face ID biometric data.",
        },
      ],
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./src/assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      "expo-image",
      "expo-font",
      "expo-web-browser",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      appVariant: variant,
      eas: {
        projectId: "",
      },
    },
  };

  if (variant) {
    config.name = `${BASE_NAME} ${variant}`;
    config.android = {
      ...config.android,
      package: `${BASE_PACKAGE}.${variantSuffix}`,
    };
    config.ios = {
      ...config.ios,
      bundleIdentifier: `${BASE_BUNDLE_ID}.${variantSuffix}`,
    };
  }

  return config;
};
