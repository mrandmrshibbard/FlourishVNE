package com.flourish.vne.mobile;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * The Flourish MOBILE editor shell: a single full-screen WebView that loads the
 * built editor web app from assets/www and exposes two native bridges —
 *
 *   AndroidStorage  → key/value, file-backed; mapped onto window.electronAPI.storage
 *                     so the in-app test-play engine persists saves like desktop.
 *   FlourishFiles   → app-private .flourish project files (list/read/write/delete)
 *                     plus share-out via the system sheet; mapped onto
 *                     window.FlourishMobile in the injected bridge script.
 *
 * Incoming .flourish files (opened/shared from another app) are copied into the
 * private projects dir and the web app is notified via window.__onProjectImported.
 */
public class MainActivity extends Activity {
    private WebView webView;
    private boolean pageReady = false;
    private String pendingImportName = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
        WebView.setWebContentsDebuggingEnabled(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingImportName != null) {
                    notifyImported(pendingImportName);
                    pendingImportName = null;
                }
            }
        });
        webView.addJavascriptInterface(new StorageBridge(this), "AndroidStorage");
        webView.addJavascriptInterface(new FilesBridge(this), "FlourishFiles");
        webView.addJavascriptInterface(new AppBridge(this), "AndroidApp");
        setContentView(webView);

        handleIncoming(getIntent());
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncoming(intent);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() { super.onPause(); if (webView != null) webView.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }

    private File projectsDir() {
        File dir = new File(getFilesDir(), "projects");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    /** Copy an opened/shared .flourish into the private projects dir; notify the web app. */
    private void handleIncoming(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) {
            Object extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (extra instanceof Uri) uri = (Uri) extra;
        }
        if (uri == null) return;
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return;
            byte[] data = readAll(in);
            String name = deriveName(uri);
            File out = new File(projectsDir(), name);
            FileOutputStream fos = new FileOutputStream(out);
            fos.write(data); fos.close();
            if (pageReady) notifyImported(name);
            else pendingImportName = name;
        } catch (Throwable t) { /* ignore malformed import */ }
    }

    private String deriveName(Uri uri) {
        String n = null;
        try {
            String last = uri.getLastPathSegment();
            if (last != null) {
                int slash = last.lastIndexOf('/');
                n = slash >= 0 ? last.substring(slash + 1) : last;
            }
        } catch (Throwable t) {}
        if (n == null || n.isEmpty()) n = "imported";
        n = n.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!n.toLowerCase().endsWith(".flourish")) n = n + ".flourish";
        // Avoid clobbering an existing project of the same name.
        File dir = projectsDir();
        if (new File(dir, n).exists()) {
            String base = n.substring(0, n.length() - ".flourish".length());
            int i = 2;
            while (new File(dir, base + "-" + i + ".flourish").exists()) i++;
            n = base + "-" + i + ".flourish";
        }
        return n;
    }

    private void notifyImported(final String name) {
        if (webView == null) return;
        final String js = "window.__onProjectImported && window.__onProjectImported(" + JSONObject.quote(name) + ");";
        webView.post(new Runnable() { public void run() { webView.evaluateJavascript(js, null); } });
    }

    // ── key/value storage (mirrors electronAPI.storage), file-backed ──
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
                return new String(readAll(new FileInputStream(f)), "UTF-8");
            } catch (Throwable t) { return null; }
        }
        @JavascriptInterface
        public synchronized void setItem(String key, String value) {
            try { FileOutputStream out = new FileOutputStream(fileFor(key)); out.write(value.getBytes("UTF-8")); out.close(); } catch (Throwable t) {}
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

    // ── app-private .flourish project files (binary, base64 over the bridge) ──
    public static class FilesBridge {
        private final MainActivity act;
        FilesBridge(Context ctx) { this.act = (MainActivity) ctx; }

        private static String safeName(String name) {
            String n = name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (!n.toLowerCase().endsWith(".flourish")) n = n + ".flourish";
            return n;
        }

        /** JSON array of { name, size, modified } for every saved project. */
        @JavascriptInterface
        public synchronized String list() {
            JSONArray arr = new JSONArray();
            try {
                File[] fs = act.projectsDir().listFiles();
                if (fs != null) for (File f : fs) {
                    if (!f.getName().toLowerCase().endsWith(".flourish")) continue;
                    JSONObject o = new JSONObject();
                    o.put("name", f.getName());
                    o.put("size", f.length());
                    o.put("modified", f.lastModified());
                    arr.put(o);
                }
            } catch (Throwable t) {}
            return arr.toString();
        }

        /** Base64 of the .flourish bytes, or null if missing. */
        @JavascriptInterface
        public synchronized String read(String name) {
            try {
                File f = new File(act.projectsDir(), safeName(name));
                if (!f.exists()) return null;
                return Base64.encodeToString(readAll(new FileInputStream(f)), Base64.NO_WRAP);
            } catch (Throwable t) { return null; }
        }

        /** Write base64 .flourish bytes; returns the (possibly sanitized) stored name. */
        @JavascriptInterface
        public synchronized String write(String name, String base64) {
            try {
                String stored = safeName(name);
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                FileOutputStream out = new FileOutputStream(new File(act.projectsDir(), stored));
                out.write(data); out.close();
                return stored;
            } catch (Throwable t) { return null; }
        }

        @JavascriptInterface
        public synchronized boolean delete(String name) {
            try { File f = new File(act.projectsDir(), safeName(name)); return f.exists() && f.delete(); } catch (Throwable t) { return false; }
        }

        /** Copy the project to share_out/ and fire the system share sheet. */
        @JavascriptInterface
        public void share(final String name) {
            try {
                final String stored = safeName(name);
                File src = new File(act.projectsDir(), stored);
                if (!src.exists()) return;
                File outDir = new File(act.getFilesDir(), "share_out");
                if (!outDir.exists()) outDir.mkdirs();
                File dst = new File(outDir, stored);
                FileOutputStream fos = new FileOutputStream(dst);
                fos.write(readAll(new FileInputStream(src))); fos.close();
                final Uri uri = FileProvider.getUriForFile(act, "com.flourish.vne.mobile.fileprovider", dst);
                act.runOnUiThread(new Runnable() { public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("application/octet-stream");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    act.startActivity(Intent.createChooser(send, "Share " + stored));
                } });
            } catch (Throwable t) {}
        }
    }

    public static class AppBridge {
        private final Activity activity;
        AppBridge(Context ctx) { this.activity = (Activity) ctx; }
        @JavascriptInterface
        public void quit() { activity.runOnUiThread(new Runnable() { public void run() { activity.finishAffinity(); } }); }
    }
}
