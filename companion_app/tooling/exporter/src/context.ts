// Export context: collects warnings + referenced asset paths, resolves engine asset IDs → the
// relative `assets/...` paths stored in the project's asset collections, and tracks which optional
// subsystems the project uses (so the manifest can declare capabilities and tools can warn).
export interface Capabilities {
  scripts: boolean; plugins: boolean; miniGames: boolean; phone: boolean;
  inventory: boolean; maps: boolean; video: boolean; particles: boolean;
}

export class ExportContext {
  warnings: string[] = [];
  assetRefs = new Set<string>();
  capabilities: Capabilities = {
    scripts: false, plugins: false, miniGames: false, phone: false,
    inventory: false, maps: false, video: false, particles: false,
  };

  private fontByFamily = new Map<string, string>(); // fontFamily → fontUrl

  constructor(public project: any) {
    for (const f of Object.values<any>(project.fonts || {}))
      if (f?.fontFamily && f?.fontUrl) this.fontByFamily.set(f.fontFamily, f.fontUrl);
  }

  warn(msg: string): void { this.warnings.push(msg); }

  // ── completeness auditor ────────────────────────────────────────────────────────────────────
  // For each mapped kind (element:Button, command:Dialogue, action:GoToScreen, font, …) record any
  // property PRESENT in the real project data that the exporter does NOT consume. This is the safety
  // net that guarantees we never silently drop a feature: run the exporter on a project and every
  // unmapped property surfaces in the coverage report. `handled` is the list of keys we do map.
  coverageUnmapped = new Map<string, Set<string>>();       // kind -> unmapped property names
  coverageSeen = new Map<string, number>();                // kind -> how many instances audited
  private static readonly STRUCTURAL = new Set(['id', 'name', 'type']);

  // Properties we KNOW aren't in v1 yet, by design (Tier-3 systems, planned waves). Listing one here
  // moves it out of "unexpected gap — investigate" into "deferred — planned", so the completeness
  // report stays trustworthy: a surprise gap is a real bug, a deferred one is roadmap. Format: kind → keys.
  static readonly DEFERRED: Record<string, string[]> = {
    // Pre-migration hot-zone backup (superseded by the drag-drop system on regular screens).
    'screen': ['_legacyHotZone'],
  };
  // Whole Tier-3 field FAMILIES, matched by key prefix (the phone subsystem ~200 fields + player
  // inventory defaults live on VNProjectUI as phone*/inventory*). Listing every name is impractical.
  static readonly DEFERRED_PREFIXES: Record<string, string[]> = {
    inGameUI: ['phone', 'inventory'],
  };
  isDeferred(kind: string, key: string): boolean {
    if ((ExportContext.DEFERRED[kind] ?? []).includes(key)) return true;
    // element:* wildcard — drag-drop keys deferred on every element type
    if (kind.startsWith('element:') && (ExportContext.DEFERRED['element:*'] ?? []).includes(key)) return true;
    return (ExportContext.DEFERRED_PREFIXES[kind] ?? []).some((p) => key.startsWith(p));
  }

  audit(kind: string, src: any, handled: string[]): void {
    if (!src || typeof src !== 'object') return;
    this.coverageSeen.set(kind, (this.coverageSeen.get(kind) ?? 0) + 1);
    const known = new Set(handled);
    let unmapped = this.coverageUnmapped.get(kind);
    for (const k of Object.keys(src)) {
      if (ExportContext.STRUCTURAL.has(k) || known.has(k)) continue;
      if (src[k] == null) continue; // absent/null isn't a real drop
      if (!unmapped) { unmapped = new Set(); this.coverageUnmapped.set(kind, unmapped); }
      unmapped.add(k);
    }
  }

  // A custom project font's file path, by family name (generic families like "Poppins" → undefined).
  font(family: unknown): string | undefined {
    const url = typeof family === 'string' ? this.fontByFamily.get(family) : undefined;
    return url ? this.ref(url) : undefined;
  }

  // Register a relative asset path (rejecting web-style refs) and return it, or undefined.
  private ref(path: unknown): string | undefined {
    if (typeof path === 'string' && path && !/^(data:|https?:|flourish-asset:)/i.test(path)) {
      this.assetRefs.add(path);
      return path;
    }
    return undefined;
  }

  bg(id: unknown): string | undefined { return this.ref(this.project.backgrounds?.[id as string]?.imageUrl); }
  audio(id: unknown): string | undefined { return this.ref(this.project.audio?.[id as string]?.audioUrl); }
  image(id: unknown): string | undefined { return this.ref(this.project.images?.[id as string]?.imageUrl); }
  video(id: unknown): string | undefined { return this.ref(this.project.videos?.[id as string]?.videoUrl); }
  asset(path: unknown): string | undefined { return this.ref(path); } // direct URL (character images/fonts)
}
