/**
 * Android Game Bundler
 *
 * Wraps the exact same self-contained web bundle the Web/Desktop builds produce
 * (index.html + assets/) inside a minimal native Android WebView app, then hands
 * the assembled Gradle project to the Electron main process to compile into an
 * installable, signed .apk.
 *
 * Design mirrors desktopGameBundler.ts: the project's text files are embedded here
 * as strings and sent over IPC; the heavy lifting (write files, ensure keystore,
 * run Gradle, copy the APK out) happens in electron/main.cjs `build-android-game`.
 *
 * Persistence: an Android game behaves like the desktop build — saves/loads and
 * persistent variables are written to the app's private files dir via a native
 * bridge that presents the SAME `window.electronAPI.storage` interface the engine
 * already uses on desktop (see preload-game.js). No localStorage size caps / OS
 * eviction. See `buildBridgeScript()` + `MAIN_ACTIVITY`.
 */

import { VNProject } from '../types/project';
import { BuildProgress } from './gameBundler';

const isElectron = typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined';

// Fixed Java/namespace package for the wrapper. The user-facing applicationId
// (package name) is separate and set per build — Android allows them to differ.
const WRAPPER_NAMESPACE = 'com.flourish.player';
const WRAPPER_PKG_PATH = 'com/flourish/player';

export type AndroidOrientation = 'landscape' | 'portrait' | 'auto';

export type AndroidArtifactFormat = 'apk' | 'aab';

export interface AndroidBuildOptions {
  appName: string;
  packageName: string; // applicationId, reverse-DNS
  versionName: string;
  versionCode: number;
  orientation: AndroidOrientation;
  iconDataUrl?: string; // optional custom launcher icon (PNG/JPEG data URL)
  // 'apk' = direct install / sideload (default). 'aab' = Android App Bundle for
  // the Google Play Store (the user publishes it themselves).
  format?: AndroidArtifactFormat;
  // For AAB builds: localized text written next to the bundle so the user has the
  // publishing steps + their signing key. The README template uses placeholders
  // {{keyFile}}, {{alias}}, {{password}} (filled by main.cjs, which holds the
  // keystore credentials).
  playStoreGuideText?: string;
  signingReadmeTemplate?: string;
}

/** Default a valid reverse-DNS applicationId from a project title. */
export function defaultPackageName(title: string): string {
  const slug = (title || 'game')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+/, ''); // package segments must start with a letter
  return `com.flourish.${slug || 'game'}`;
}

/** Android applicationId rules: dot-separated segments, each starts with a letter. */
export function isValidPackageName(pkg: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(pkg);
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * The JS bridge injected as the FIRST script in the Android index.html. It maps
 * the engine's expected `window.electronAPI.storage` (async, stores objects
 * directly) onto the native `AndroidStorage`/`AndroidApp` interfaces added via
 * addJavascriptInterface — giving file-based, desktop-style persistence.
 */
export function buildBridgeScript(): string {
  return `<script>(function(){
  if (typeof AndroidStorage === 'undefined') return; // only inside the Android wrapper
  window.electronAPI = window.electronAPI || {};
  window.electronAPI.isAndroid = true;
  window.electronAPI.storage = {
    getItem: function(key){ return new Promise(function(res){ try { var s = AndroidStorage.getItem(key); res(s == null ? null : JSON.parse(s)); } catch(e){ res(null); } }); },
    setItem: function(key, value){ return new Promise(function(res){ try { AndroidStorage.setItem(key, JSON.stringify(value)); } catch(e){} res(); }); },
    removeItem: function(key){ return new Promise(function(res){ try { AndroidStorage.removeItem(key); } catch(e){} res(); }); },
    clear: function(){ return new Promise(function(res){ try { AndroidStorage.clear(); } catch(e){} res(); }); },
    keys: function(){ return new Promise(function(res){ try { res(JSON.parse(AndroidStorage.keys() || '[]')); } catch(e){ res([]); } }); }
  };
  window.electronAPI.quitApp = function(){ try { AndroidApp.quit(); } catch(e){} };
})();</script>`;
}

/** Inject the bridge as the first thing inside <head> so it runs before the engine. */
function injectBridge(html: string): string {
  const bridge = buildBridgeScript();
  if (html.includes('<head>')) return html.replace('<head>', `<head>\n${bridge}`);
  // Fallbacks for unusual HTML shapes.
  if (html.includes('<head ')) return html.replace(/<head([^>]*)>/, `<head$1>\n${bridge}`);
  return bridge + html;
}

// ── Gradle project template ──────────────────────────────────────────────────
const AGP_VERSION = '8.5.2';

function settingsGradle(): string {
  return `pluginManagement {
  repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
  repositories { google(); mavenCentral() }
}
rootProject.name = "app"
include ":app"
`;
}

function rootBuildGradle(): string {
  return `plugins {
  id 'com.android.application' version '${AGP_VERSION}' apply false
}
`;
}

function gradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.caching=true
org.gradle.parallel=true
org.gradle.internal.repository.max.retries=4
org.gradle.internal.repository.initial.backoff=1000
systemProp.org.gradle.internal.http.connectionTimeout=60000
systemProp.org.gradle.internal.http.socketTimeout=60000
`;
}

function appBuildGradle(opts: AndroidBuildOptions): string {
  const orientation =
    opts.orientation === 'portrait' ? 'portrait' : opts.orientation === 'auto' ? 'fullSensor' : 'landscape';
  // Signing is supplied at build time via -P properties (the keystore is generated
  // + reused by the main process). If they aren't present (e.g. a debug invocation)
  // the release build simply isn't signed by this config.
  return `plugins { id 'com.android.application' }

android {
  namespace '${WRAPPER_NAMESPACE}'
  compileSdk 34

  defaultConfig {
    applicationId '${opts.packageName}'
    minSdk 24
    targetSdk 34
    versionCode ${Math.max(1, Math.floor(opts.versionCode || 1))}
    versionName '${opts.versionName || '1.0.0'}'
  }

  signingConfigs {
    release {
      if (project.hasProperty('flourishStoreFile')) {
        storeFile file(project.property('flourishStoreFile'))
        storePassword project.property('flourishStorePassword')
        keyAlias project.property('flourishKeyAlias')
        keyPassword project.property('flourishKeyPassword')
      }
    }
  }

  buildTypes {
    release {
      minifyEnabled false
      signingConfig signingConfigs.release
    }
  }

  // The game runs entirely from assets/www; AAPT must not compress media.
  androidResources {
    noCompress 'mp3', 'mp4', 'ogg', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'wav', 'm4a'
  }
}

// keep the per-orientation value available to the manifest placeholder
android.defaultConfig.manifestPlaceholders = [ screenOrientation: '${orientation}' ]
`;
}

function androidManifest(opts: AndroidBuildOptions): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application
      android:label="@string/app_name"
      android:icon="@mipmap/ic_launcher"
      android:hardwareAccelerated="true"
      android:allowBackup="true"
      android:theme="@android:style/Theme.Material.NoActionBar.Fullscreen">
    <activity
        android:name="${WRAPPER_NAMESPACE}.MainActivity"
        android:exported="true"
        android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize|uiMode"
        android:screenOrientation="\${screenOrientation}">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`;
}

function stringsXml(opts: AndroidBuildOptions): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">${xmlEscape(opts.appName || 'Visual Novel')}</string>
</resources>
`;
}

// MainActivity: a full-screen WebView that loads the bundled game from assets and
// exposes the native storage + app bridges. No layout XML, no AndroidX — pure
// framework, so the project needs zero dependencies.
const MAIN_ACTIVITY = `package ${WRAPPER_NAMESPACE};

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        try { ws.setAllowFileAccessFromFileURLs(true); } catch (Throwable t) {}
        try { ws.setAllowUniversalAccessFromFileURLs(true); } catch (Throwable t) {}
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new StorageBridge(this), "AndroidStorage");
        webView.addJavascriptInterface(new AppBridge(this), "AndroidApp");
        setContentView(webView);
        hideSystemUi();
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() { super.onPause(); if (webView != null) webView.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }

    // ── File-backed storage bridge (mirrors electronAPI.storage) ──
    public static class StorageBridge {
        private final File dir;
        StorageBridge(Context ctx) {
            dir = new File(ctx.getFilesDir(), "saves");
            if (!dir.exists()) dir.mkdirs();
        }
        private File fileFor(String key) {
            String safe = key.replaceAll("[^A-Za-z0-9._-]", "_");
            return new File(dir, safe + ".json");
        }
        @JavascriptInterface
        public synchronized String getItem(String key) {
            try {
                File f = fileFor(key);
                if (!f.exists()) return null;
                FileInputStream in = new FileInputStream(f);
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
                in.close();
                return new String(bos.toByteArray(), "UTF-8");
            } catch (Throwable t) { return null; }
        }
        @JavascriptInterface
        public synchronized void setItem(String key, String value) {
            try {
                FileOutputStream out = new FileOutputStream(fileFor(key));
                out.write(value.getBytes("UTF-8"));
                out.close();
            } catch (Throwable t) {}
        }
        @JavascriptInterface
        public synchronized void removeItem(String key) {
            try { File f = fileFor(key); if (f.exists()) f.delete(); } catch (Throwable t) {}
        }
        @JavascriptInterface
        public synchronized void clear() {
            try { File[] fs = dir.listFiles(); if (fs != null) for (File f : fs) f.delete(); } catch (Throwable t) {}
        }
        @JavascriptInterface
        public synchronized String keys() {
            JSONArray arr = new JSONArray();
            try {
                File[] fs = dir.listFiles();
                if (fs != null) for (File f : fs) {
                    String n = f.getName();
                    if (n.endsWith(".json")) arr.put(n.substring(0, n.length() - 5));
                }
            } catch (Throwable t) {}
            return arr.toString();
        }
    }

    // ── App bridge (ExitGame) ──
    public static class AppBridge {
        private final Activity activity;
        AppBridge(Context ctx) { this.activity = (Activity) ctx; }
        @JavascriptInterface
        public void quit() { activity.runOnUiThread(new Runnable() { public void run() { activity.finishAffinity(); } }); }
    }
}
`;

/** A simple default launcher icon (rounded square + first letter) drawn via canvas. */
async function generateDefaultIcon(appName: string): Promise<ArrayBuffer | null> {
  try {
    const size = 432;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#ff7eb3');
    grad.addColorStop(1, '#8a2be2');
    ctx.fillStyle = grad;
    const r = 96;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(size - r, 0); ctx.arcTo(size, 0, size, r, r);
    ctx.lineTo(size, size - r); ctx.arcTo(size, size, size - r, size, r);
    ctx.lineTo(r, size); ctx.arcTo(0, size, 0, size - r, r);
    ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(size * 0.5)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((appName || 'V').trim().charAt(0).toUpperCase() || 'V', size / 2, size / 2 + size * 0.04);
    const dataUrl = canvas.toDataURL('image/png');
    const { dataURLToBlob } = await import('./gameBundler');
    return await dataURLToBlob(dataUrl).arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Build an installable APK. Generates the same web bundle as the other targets,
 * wraps it in the WebView project, and hands it to the main process to compile.
 * Assumes the Android toolchain is already installed (the UI handles the download
 * gate first). Returns the saved APK path + folder.
 */
export async function buildAndroidGame(
  project: VNProject,
  onProgress: (progress: BuildProgress) => void,
  options: AndroidBuildOptions
): Promise<{ path: string; folder: string }> {
  if (!isElectron) {
    throw new Error('Android builds are only available in the desktop version of Flourish Visual Novel Engine.');
  }
  const api = (window as any).electronAPI;
  if (!api?.buildAndroidGame) {
    throw new Error('This version of Flourish does not support Android builds. Please update the desktop app.');
  }

  onProgress({ step: 'prepare', progress: 8, message: 'Preparing Android build...' });

  const { generateStandaloneHTML, collectAllAssets, buildLeanProject, dataURLToBlob, resolveProjectAssets } =
    await import('./gameBundler');

  // Same web bundle as Web/Desktop.
  const resolvedProject = await resolveProjectAssets(project, onProgress);
  const assetUrls = collectAllAssets(resolvedProject);
  const leanProject = buildLeanProject(resolvedProject, assetUrls);
  let htmlContent = await generateStandaloneHTML(leanProject);
  htmlContent = injectBridge(htmlContent);

  onProgress({ step: 'assets', progress: 22, message: 'Collecting assets...' });

  const wwwRoot = 'app/src/main/assets/www';
  const androidFiles: Record<string, string | ArrayBuffer> = {
    'settings.gradle': settingsGradle(),
    'build.gradle': rootBuildGradle(),
    'gradle.properties': gradleProperties(),
    'app/build.gradle': appBuildGradle(options),
    'app/src/main/AndroidManifest.xml': androidManifest(options),
    'app/src/main/res/values/strings.xml': stringsXml(options),
    [`app/src/main/java/${WRAPPER_PKG_PATH}/MainActivity.java`]: MAIN_ACTIVITY,
    [`${wwwRoot}/index.html`]: htmlContent,
  };

  // Game assets → assets/www/assets/
  const assetEntries = Object.entries(assetUrls);
  let i = 0;
  for (const [name, dataUrl] of assetEntries) {
    i++;
    onProgress({ step: 'assets', progress: 22 + (i / Math.max(1, assetEntries.length)) * 16, message: `Processing asset ${i}/${assetEntries.length}...` });
    if (dataUrl.startsWith('data:')) {
      androidFiles[`${wwwRoot}/assets/${name}`] = await dataURLToBlob(dataUrl).arrayBuffer();
    }
  }

  // Launcher icon (custom or generated) → a couple of mipmap densities.
  onProgress({ step: 'generate', progress: 40, message: 'Preparing app icon...' });
  let iconBuf: ArrayBuffer | null = null;
  if (options.iconDataUrl && options.iconDataUrl.startsWith('data:')) {
    iconBuf = await dataURLToBlob(options.iconDataUrl).arrayBuffer();
  } else {
    iconBuf = await generateDefaultIcon(options.appName);
  }
  if (iconBuf) {
    for (const density of ['mipmap-xxxhdpi', 'mipmap-xhdpi', 'mipmap-hdpi', 'mipmap-mdpi']) {
      androidFiles[`app/src/main/res/${density}/ic_launcher.png`] = iconBuf;
    }
  }

  // Stream native build progress.
  if (api.onAndroidBuildProgress) {
    api.onAndroidBuildProgress((data: BuildProgress) => onProgress(data));
  }

  onProgress({ step: 'build', progress: 48, message: options.format === 'aab' ? 'Building app bundle (.aab)...' : 'Building APK...' });
  const result = await api.buildAndroidGame(project, androidFiles, options);
  if (!result || !result.success) {
    throw new Error((result && result.error) || 'The Android build failed.');
  }
  onProgress({ step: 'complete', progress: 100, message: 'Build complete!' });
  return { path: result.path, folder: result.folder };
}
