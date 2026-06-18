// Platform detection for the Flourish MOBILE build.
//
// This file exists ONLY in the mobile_version fork. It is the single source of
// truth for "are we running as the mobile (Android WebView) build of the editor?"
//
// `__MOBILE__` is injected at build time by vite.config.ts (define). It is `true`
// for every mobile build (web-preview or packaged APK). The native Android WebView
// additionally exposes `window.FlourishMobile` (the @JavascriptInterface bridge),
// which lets us tell "running inside the real APK" apart from "mobile layout in a
// desktop browser for testing".

declare const __MOBILE__: boolean;

/** True when this bundle was built as the mobile editor (layout + build-target trim). */
export const IS_MOBILE: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return typeof __MOBILE__ !== 'undefined' ? __MOBILE__ : false;
  } catch {
    return false;
  }
})();

/** True only when running inside the packaged Android WebView (native bridge present). */
export function isNativeAndroid(): boolean {
  return typeof window !== 'undefined' && !!(window as any).FlourishMobile;
}

/** True when running as the Electron desktop app (never in the mobile fork). */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/**
 * Coarse touch-primary check, used to bias UI toward touch affordances even when
 * previewing the mobile build in a desktop browser. Mobile build always counts.
 */
export function isTouchPrimary(): boolean {
  if (IS_MOBILE) return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
}
