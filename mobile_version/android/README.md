# Flourish Mobile — Android wrapper

This is the native Android shell that packages the **Flourish editor** itself
(not an exported game) into an installable APK. It is a single full-screen
`WebView` that loads the built editor from `app/src/main/assets/www`.

## How it fits together

```
mobile_version/
  src/ …            the editor React app (mobile fork)
  dist/             produced by `npm run build:full`
  android/          THIS wrapper project
    app/src/main/assets/www/   ← filled by `npm run android:sync` (from dist/)
```

## Build steps

```bash
# from mobile_version/
npm install
npm run android:build        # = build:full + android:sync  → fills assets/www
cd android
gradle assembleRelease       # or ./gradlew assembleRelease once a wrapper is added
```

The unsigned/signed APK lands in `app/build/outputs/apk/release/`.

### Gradle

This project has **no committed Gradle wrapper jar**. Use either:

- the Gradle that Flourish's desktop build already downloads
  (`electron/androidToolchain.cjs` fetches Gradle 8.7), or
- a system Gradle ≥ 8.5, then run `gradle wrapper` once to vendor a wrapper.

### Signing

Release signing is supplied via `-P` properties (matches the game-export flow):

```bash
gradle assembleRelease \
  -PflourishStoreFile=/path/to/keystore.jks \
  -PflourishStorePassword=… -PflourishKeyAlias=… -PflourishKeyPassword=…
```

Without them the release APK is built unsigned.

## Native bridges (injected by `scripts/sync-android-www.cjs`)

| Native interface | Web API | Purpose |
|---|---|---|
| `AndroidStorage` | `window.electronAPI.storage` | engine test-play saves (desktop-style, file-backed) |
| `FlourishFiles` | `window.FlourishMobile` | app-private `.flourish` projects: list / read / write / delete / share |
| `AndroidApp` | `window.electronAPI.quitApp` | exit |

Incoming `.flourish` files (opened or shared from another app) are copied into
the private `projects/` dir and the web app is notified via
`window.__onProjectImported(name)`.

## Not yet done (later rounds)

- On-device **game export to APK** (needs a remote build service — Gradle can't
  run on the phone). Web export works fully on-device.
- Committed Gradle wrapper + launcher icon set + automated build IPC.
