// =============================================================================
//  Project Stats  —  a sample FlourishVNE EXTENSION (editor panel)
// =============================================================================
//
//  HOW TO INSTALL (no coding needed):
//    1. In the editor, open  Tools ▸ Plugin Manager.
//    2. Click  "Import from file"  and choose THIS file
//       (project-stats-panel.plugin.js).
//    3. Click  "Install Plugin".
//    4. Open it from  Tools ▸ Extension Panels ▸ 📊 Project Stats.
//       Drag the title bar to move it; drag the bottom-right corner to resize.
//
//  What it does: shows live counts for your project (scenes, commands,
//  characters, variables, and an approximate dialogue word count). The numbers
//  update on their own as you edit. This is an "editor extension" — it runs only
//  inside the editor on your machine and is never included in your exported game.
// =============================================================================

const manifest = {
  id: 'com.flourish.project-stats',
  name: 'Project Stats',
  version: '1.0.0',
  description: 'A live dashboard panel showing scene / command / character / variable counts.',
  author: 'FlourishVNE',
  category: 'utility',
  target: 'editor',            // editor extension → full trust, not shipped to players
  capabilities: ['ui-panels'],
};

const plugin = {
  manifest,

  onEnable(api) {
    api.registerPanel({
      id: 'stats',
      title: 'Project Stats',
      icon: '📊',

      // Free-form render: we get a real container + an editor context (ctx).
      render: (container, ctx) => {
        const root = document.createElement('div');
        root.style.cssText = 'font:13px system-ui,sans-serif;color:#c9d1d9;padding:14px;height:100%;box-sizing:border-box;';
        container.appendChild(root);

        const row = (label, value) =>
          '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #21262d;">' +
            '<span style="color:#8b949e;">' + label + '</span>' +
            '<strong style="color:#58a6ff;font-variant-numeric:tabular-nums;">' + value + '</strong>' +
          '</div>';

        const draw = () => {
          const p = ctx.getProject();
          if (!p) { root.innerHTML = '<em style="color:#8b949e;">No project loaded.</em>'; return; }

          const scenes = Object.values(p.scenes || {});
          let commandCount = 0;
          let dialogueWords = 0;
          scenes.forEach((s) => {
            const cmds = (s && s.commands) || [];
            commandCount += cmds.length;
            cmds.forEach((c) => {
              const text = c && typeof c.text === 'string' ? c.text : '';
              if (text) dialogueWords += text.trim().split(/\s+/).filter(Boolean).length;
            });
          });

          root.innerHTML =
            '<div style="font-weight:600;margin-bottom:8px;">📊 ' + (p.title || 'Untitled Project') + '</div>' +
            row('Scenes', scenes.length) +
            row('Commands', commandCount) +
            row('Characters', Object.keys(p.characters || {}).length) +
            row('Variables', Object.keys(p.variables || {}).length) +
            row('Approx. words', dialogueWords) +
            '<div style="margin-top:10px;font-size:11px;color:#6e7681;">Updates automatically as you edit.</div>';
        };

        draw();
        // Editor extensions are full-trust, so timers are allowed. Refresh periodically.
        const timer = setInterval(draw, 1500);

        // Cleanup runs when the panel window is closed.
        return () => clearInterval(timer);
      },
    });
  },
};
