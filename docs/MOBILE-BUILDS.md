# Customer and cook mobile builds

## Implementation

`v2/apps/native` is an Expo 58.0.23 / React Native 0.88.1 application with two role configurations. Both use React Native WebView 14.0.1 for the shared account workspace; this is a hybrid application, not a second independent implementation of order business logic.

| Variant | Android application ID | iOS bundle ID |
| --- | --- | --- |
| CUSTOMER | ca.sofreh.customer | ca.sofreh.customer |
| COOK | ca.sofreh.cook | ca.sofreh.cook |

The web workspace uses the same database, cart, order identifiers and status rules as the native shell. A user-initiated message bridge requests foreground device location and returns coordinates only to the loaded Sofreh page. It does not grant background location or send device coordinates to the order API. Navigation is restricted to the configured application origin.

## Local preparation

Use Node 24 and an HTTPS account-server origin. From `v2`:

```powershell
$env:SOFREH_APP_ORIGIN='https://sofreh-v2.vercel.app'
node scripts/prepare-native.mjs CUSTOMER
node scripts/prepare-native.mjs COOK
```

The existing Vercel origin above now has an explicitly configured persistent account runtime in production. Deployment access protection remains enabled. Verify public/native reachability before a functional native release; compilation against that URL does not establish the shared-account acceptance journey. Keep the build origin aligned with the approved account-server origin if hosting changes.

Preparation writes only to `%LOCALAPPDATA%\ElegantRuntime\Sofreh\native\shared`. Role variants are prepared sequentially in that one directory to avoid duplicating the dependency tree. The helper sets the process-level Expo home override supported by the pinned CLI, disables telemetry, isolates temporary/cache output and generates Android source without accepting SDK licenses or creating cloud accounts. Its final console path identifies the internal project; it is not an APK/IPA download.

To export JavaScript from that runtime directory, retain the selected `SOFREH_APP_ROLE`, `SOFREH_APP_ORIGIN`, local Expo home and temporary-directory settings, then invoke the installed Expo CLI with Node 24:

```text
node node_modules/expo/bin/cli export --platform all --output-dir dist --max-workers 2
```

Hermes exports and generated Gradle identifiers verify bundling/configuration. They do not compile, sign, install or visually test an application. The source provides one project lockfile for reproducible dependency selection.

## Binary and device acceptance

The manually dispatched `Internal mobile builds` GitHub workflow compiles both roles on standard Linux/macOS runners. It uses no Expo/Apple account or signing secret, keeps build/cache output under the runner's temporary `ElegantRuntime/Sofreh` directory and retains internal build artifacts for one day. The Android artifact uses the generated development signing key for testing; the iOS artifact targets a simulator and cannot be installed on a physical iPhone. A successful workflow is build evidence only. Its default Vercel origin must still pass the hosted-account journey before the resulting apps are useful for acceptance.

`Internal iPhone simulator launch` takes a build run number, installs its role-specific app artifacts on temporary iPhone simulators, checks that each process remains running and captures screenshots for review. It does not remove hosting access protection or mark an account journey as accepted. Screenshots and launch metadata remain internal workflow artifacts with one-day retention.

The mobile build workflow also offers `ios-device`. It compiles for physical-device iOS and packages an unsigned IPA for a separately approved signing/testing flow. That file is not directly installable or a store release. The script checks the executable's iOS platform before packaging; simulator apps cannot be relabeled as device builds. Cloud upload, re-signing, entitlements and device execution must be verified independently.

## Recorded build evidence

At source revision `4ef17a1`, [build run 42727389972](https://github.com/Mehrdad-KHE/sofreh/actions/runs/42727389972) compiled both Android APKs and both iOS simulator apps. [Run 42727392986](https://github.com/Mehrdad-KHE/sofreh/actions/runs/42727392986) compiled both unsigned physical-device IPAs. [Simulator run 42729483463](https://github.com/Mehrdad-KHE/sofreh/actions/runs/42729483463) installed and launched both roles on iPhone SE (3rd generation), iOS 26.5. Both captured screens were opened for visual inspection.

The simulator showed the native retry screen because the protected Vercel host redirected away from the allowed origin. It did not establish a functional hosted account journey. A previous successful launch job had concealed an escape into Safari; inspecting its screenshots exposed the issue. The corrected WebView sends all navigation attempts through an explicit origin policy before allowing them. Process survival and successful compilation therefore remain distinct from visual and functional acceptance. One-day artifacts can expire; the workflows and versioned source are the reproducible record.

Android compilation requires an appropriate Android SDK/JDK toolchain. Keep Gradle caches, Android user state and generated binaries under the same local runtime root. Install both variants on the agreed Galaxy S22 and exercise registration, permission denial/grant, ordering, cook acceptance, completion, reload and reconnect.

iOS compilation requires a supported macOS/Xcode environment. The Windows CLI can export iOS JavaScript but does not generate the iOS native project. An unsigned simulator build can cover navigation and layout without an iPhone. Actual-device cloud testing then requires a compatible device build and an available testing/signing flow; no Apple membership, cloud account, signed IPA or completed device test is implied by these source files.

Browser Web Push and native remote push are distinct. The backend/service worker implements browser subscriptions; the native shell does not yet implement APNs/FCM registration and delivery. Native push credentials and foreground/background/locked-device coverage remain release requirements. Store links must be added only after actual distribution exists.

References: [Expo WebView](https://docs.expo.dev/versions/latest/sdk/webview/), [Expo location](https://docs.expo.dev/versions/latest/sdk/location/), [continuous native generation](https://docs.expo.dev/workflow/continuous-native-generation/), [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/).
