/* ============================================================================
 * FlourishVNE — Sample Plugin
 * ----------------------------------------------------------------------------
 * A plugin is a single .js file that defines two things:
 *   1. `manifest` — metadata about the plugin (id, name, version, …)
 *   2. `plugin`   — an object of optional lifecycle HOOKS (onEnable, onRuntimeTick, …)
 *
 * To try it:  Tools → Plugins → Install → paste this file (or "Import from file"),
 * then Enable it. The custom command appears in the Command Palette under
 * "🧩 Plugins", and the custom effect appears in the "Set Screen Overlay Effect"
 * command's effect dropdown (marked 🧩).
 *
 * SANDBOX: plugins run sandboxed — no window/document/fetch/timers/eval. Use the
 * `api` object passed to each hook to interact with the game. No imports/require.
 * ========================================================================== */

const manifest = {
  id: 'sample-plugin',                       // unique; letters/numbers/dots/hyphens
  name: 'Sample Plugin',
  version: '1.0.0',                          // semantic version (x.y.z)
  description: 'Example: a custom command, a custom screen effect, and runtime hooks.',
  author: 'FlourishVNE',
  category: 'utility',                       // commands | effects | ui | assets | gameplay | integration | utility
  engineVersion: '1.0.0',                    // optional: minimum engine version
};

const plugin = {
  manifest,

  /* Fired when the plugin is enabled (and once on load). Register your commands
   * and effects here using the `api`. */
  onEnable(api) {
    // --- 1) A custom COMMAND ---------------------------------------------------
    // Shows up in the Command Palette → "🧩 Plugins". Authors drop it into a scene,
    // fill its parameters in the inspector, and it runs at this point in the scene.
    api.registerCommand({
      type: 'addPoints',                     // becomes "sample-plugin.addPoints" internally
      displayName: 'Add Points',
      category: 'Sample Plugin',
      description: 'Adds an amount to a number variable.',
      icon: '➕',
      parameters: [
        { name: 'variable', label: 'Variable', type: 'variable', required: true },
        { name: 'amount',   label: 'Amount',   type: 'number',   defaultValue: 1 },
      ],
      // Runs at runtime. `api.getVariable/setVariable` read/write LIVE game state.
      // Return { advance: false } to pause the scene on this command (default advances).
      handler: (params, api) => {
        const current = Number(api.getVariable(params.variable)) || 0;
        api.setVariable(params.variable, current + (Number(params.amount) || 0));
        api.notify('Added ' + params.amount + ' points', 'success');
      },
    });

    // --- 2) A custom screen EFFECT --------------------------------------------
    // Shows up in "Set Screen Overlay Effect" → effect dropdown (🧩). The author
    // picks it, sets an intensity (and optional color), and `render` draws it every
    // frame as a full-screen overlay. The canvas is cleared before each call.
    api.registerEffect({
      type: 'pulseVignette',
      displayName: 'Pulse Vignette',
      description: 'A soft, pulsing vignette around the screen edges.',
      parameters: [],
      render: (ctx, info) => {
        // info = { width, height, intensity (0..1), color?, params?, timeMs }
        const { width, height, intensity, timeMs, color } = info;
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 600);        // gentle 0..1 oscillation
        const alpha = 0.6 * intensity * pulse;
        const r = Math.max(width, height) * 0.75;
        const grad = ctx.createRadialGradient(width / 2, height / 2, r * 0.4, width / 2, height / 2, r);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, hexToRgba(color || '#000000', alpha));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      },
    });
  },

  /* ---- Optional runtime hooks (all fire only during play) ------------------ */
  onRuntimeInit(api)               { api.notify('Sample plugin ready', 'info'); },
  onRuntimeTick(api, deltaMs)      { /* ~120ms heartbeat — keep this light */ },
  onSceneChange(api, fromId, toId) { /* react when the scene changes */ },
  onVariableChange(api, id, was, now) { /* react when a variable changes */ },
  onSave(api, saveData)            { /* read/augment the save record before it's stored */ },
  onLoadAfterSave(api, saveData)   { /* react right after a save is loaded */ },
};

/* Plain helper (no imports allowed). Closures keep it available to render() at runtime. */
function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return 'rgba(0,0,0,' + a + ')';
  return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
}
