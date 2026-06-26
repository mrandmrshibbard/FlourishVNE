// =============================================================================
//  Custom UI Elements  —  a sample FlourishVNE EXTENSION (custom screen widgets)
// =============================================================================
//
//  HOW TO INSTALL (no coding needed):
//    1. Tools ▸ Plugin Manager ▸ "Import from file" ▸ choose this file.
//    2. Click "Install Plugin" (confirm the trust prompt).
//    3. Open a screen in the Menu / In-Game UI editor. The element palette now
//       has violet buttons: "📊 Stat Bar" and "🏷️ Nameplate". Add one, then edit
//       its properties in the Inspector. It renders on the canvas, in test-play,
//       and in exported games.
//
//  This extension is target:'both' — its widgets are RUNTIME contributions, so
//  the renderer ships inside exported games (editor-only extensions don't).
// =============================================================================

const manifest = {
  id: 'com.flourish.custom-elements',
  name: 'Custom UI Elements',
  version: '1.0.0',
  description: 'Adds custom screen widgets: a variable-bound Stat Bar and a styled Nameplate.',
  author: 'FlourishVNE',
  category: 'ui',
  target: 'both',
  capabilities: ['ui-panels'],
};

const plugin = {
  manifest,

  onEnable(api) {
    // Escape user text so a label can't inject HTML.
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ── Stat Bar: a labeled progress bar bound to a game variable ──
    api.registerUIElementType({
      type: 'statBar',
      displayName: 'Stat Bar',
      icon: '📊',
      defaultProps: { label: 'HP', variable: '', max: 100, color: '#22c55e', bgColor: '#1f2937', textColor: '#ffffff' },
      defaultSize: { width: 32, height: 7 },
      inspector: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'variable', label: 'Variable (name)', type: 'text', placeholder: 'e.g. hp' },
        { key: 'max', label: 'Max value', type: 'number', default: 100 },
        { key: 'color', label: 'Fill color', type: 'color', default: '#22c55e' },
        { key: 'bgColor', label: 'Track color', type: 'color', default: '#1f2937' },
        { key: 'textColor', label: 'Text color', type: 'color', default: '#ffffff' },
      ],
      // ctx.getVariable reads the live value in-game, or the variable's default in the editor.
      render: (props, ctx) => {
        const cur = Number(ctx.getVariable(props.variable)) || 0;
        const max = Number(props.max) || 100;
        const pct = Math.max(0, Math.min(100, (cur / (max || 1)) * 100));
        return (
          '<div style="width:100%;height:100%;position:relative;border-radius:6px;overflow:hidden;background:' + (props.bgColor || '#1f2937') + ';font:bold 12px sans-serif;">' +
            '<div style="position:absolute;top:0;left:0;bottom:0;width:' + pct + '%;background:' + (props.color || '#22c55e') + ';transition:width .3s;"></div>' +
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 8px;color:' + (props.textColor || '#fff') + ';text-shadow:0 1px 2px rgba(0,0,0,.6);">' +
              '<span>' + esc(props.label) + '</span><span>' + cur + ' / ' + max + '</span>' +
            '</div>' +
          '</div>'
        );
      },
    });

    // ── Nameplate: a styled name banner ──
    api.registerUIElementType({
      type: 'nameplate',
      displayName: 'Nameplate',
      icon: '🏷️',
      defaultProps: { name: 'Character', color: '#7c3aed', textColor: '#ffffff', align: 'left' },
      defaultSize: { width: 24, height: 8 },
      inspector: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'color', label: 'Background', type: 'color', default: '#7c3aed' },
        { key: 'textColor', label: 'Text color', type: 'color', default: '#ffffff' },
        { key: 'align', label: 'Align', type: 'select', default: 'left', options: [
          { label: 'Left', value: 'flex-start' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'flex-end' },
        ] },
      ],
      render: (props) => (
        '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + (props.align || 'flex-start') + ';padding:0 12px;border-radius:8px 8px 8px 0;background:' + (props.color || '#7c3aed') + ';color:' + (props.textColor || '#fff') + ';font:600 15px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);">' +
          esc(props.name) +
        '</div>'
      ),
    });
  },
};
