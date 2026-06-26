// =============================================================================
//  Story Bible  —  a sample FlourishVNE EXTENSION (editor add-on)
// =============================================================================
//
//  HOW TO INSTALL (no coding needed):
//    1. In the editor, open  Tools ▸ Plugin Manager.
//    2. Click  "Import from file"  and choose THIS file (story-bible.plugin.js).
//    3. Click  "Install Plugin".
//    4. A floating 📖 button appears in the editor — DRAG it anywhere you like.
//       CLICK it to open your Story Bible.
//
//  What it does: a writer's "story bible" docked in the editor. Keep your
//  Synopsis, Chapters, Characters, Locations, Story Arcs — or add your own
//  sections, and sub-sections under them. Everything is saved with the project.
//  This is an "editor extension": it runs only in the editor on your machine and
//  is never included in your exported game.
// =============================================================================

const manifest = {
  id: 'com.flourish.story-bible',
  name: 'Story Bible',
  version: '1.0.0',
  description: 'A draggable floating button that opens a Story Bible (Synopsis, Characters, Locations, Story Arcs + your own sections / sub-sections). Saved with the project.',
  author: 'FlourishVNE',
  category: 'utility',
  target: 'editor',            // editor extension → full trust, not shipped to players
  capabilities: ['ui-panels'],
};

// Shared across the lifecycle hooks so we can tear our UI down cleanly on disable/uninstall.
let _cleanup = null;

const plugin = {
  manifest,

  onEnable(api) {
    const FAB_ID = 'flourish-story-bible-fab';
    const WIN_ID = 'flourish-story-bible-window';

    // Idempotent: remove any previous instance (onEnable also runs on every project load).
    const existingFab = document.getElementById(FAB_ID); if (existingFab) existingFab.remove();
    const existingWin = document.getElementById(WIN_ID); if (existingWin) existingWin.remove();

    const uid = () => 'sb-' + Math.random().toString(36).slice(2, 9);

    // ---- Load (or seed) the data, persisted in project-scoped extension storage ----
    const DEFAULT = {
      fab: { x: Math.max(20, window.innerWidth - 90), y: 130 },
      win: { x: 160, y: 110, w: 640, h: 460, open: false },
      selected: null,
      sections: [
        { id: uid(), name: 'Synopsis', content: '', subsections: [] },
        { id: uid(), name: 'Chapters', content: '', subsections: [] },
        { id: uid(), name: 'Characters', content: '', subsections: [] },
        { id: uid(), name: 'Locations', content: '', subsections: [] },
        { id: uid(), name: 'Story Arcs', content: '', subsections: [] },
      ],
    };
    let data = api.getStorage('bible');
    if (!data || !Array.isArray(data.sections)) data = DEFAULT;
    if (!data.fab) data.fab = DEFAULT.fab;
    if (!data.win) data.win = DEFAULT.win;

    let saveTimer = null;
    const save = () => { try { api.setStorage('bible', data); } catch (e) { /* ignore */ } };
    const saveSoon = () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); };

    // ---- A small drag helper (used by both the button and the window header) ----
    const makeDraggable = (el, handle, onMove) => {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY;
        const r = el.getBoundingClientRect();
        const ox = r.left, oy = r.top;
        let moved = false;
        const mv = (ev) => {
          const nx = ox + (ev.clientX - sx), ny = oy + (ev.clientY - sy);
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
          el.style.left = nx + 'px'; el.style.top = ny + 'px';
          if (onMove) onMove(nx, ny, moved);
        };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    };

    // ---- Floating button ----
    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.textContent = '📖';
    fab.title = 'Story Bible (drag to move, click to open)';
    fab.style.cssText = 'position:fixed;z-index:9500;width:46px;height:46px;border-radius:50%;border:1px solid #30363d;background:#21262d;color:#fff;font-size:20px;cursor:grab;box-shadow:0 4px 16px rgba(0,0,0,0.45);';
    fab.style.left = data.fab.x + 'px';
    fab.style.top = data.fab.y + 'px';
    document.body.appendChild(fab);

    let fabMoved = false;
    makeDraggable(fab, fab, (x, y, moved) => { fabMoved = moved; if (moved) { data.fab = { x, y }; saveSoon(); } });
    fab.addEventListener('click', () => { if (fabMoved) { fabMoved = false; return; } toggleWindow(); });

    // ---- Window ----
    let win = null;

    const closeWindow = () => {
      if (win) { if (win.__ro) { try { win.__ro.disconnect(); } catch (e) {} } win.remove(); win = null; }
    };
    const toggleWindow = () => { data.win.open = !data.win.open; saveSoon(); if (data.win.open) openWindow(); else closeWindow(); };

    function openWindow() {
      closeWindow();
      const btnMini = 'border:none;background:transparent;color:#8b949e;cursor:pointer;font-size:13px;padding:0 4px;line-height:1;';

      win = document.createElement('div');
      win.id = WIN_ID;
      win.style.cssText = 'position:fixed;z-index:9499;display:flex;flex-direction:column;background:#161b22;border:1px solid #30363d;border-radius:10px;box-shadow:0 12px 48px rgba(0,0,0,0.55);overflow:hidden;color:#c9d1d9;font:13px system-ui,sans-serif;min-width:440px;min-height:280px;resize:both;';
      win.style.left = data.win.x + 'px'; win.style.top = data.win.y + 'px';
      win.style.width = data.win.w + 'px'; win.style.height = data.win.h + 'px';

      // Header (drag handle + close)
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:#21262d;border-bottom:1px solid #30363d;user-select:none;cursor:move;';
      const title = document.createElement('span');
      title.textContent = '📖 Story Bible'; title.style.cssText = 'font-weight:600;flex:1;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕'; closeBtn.style.cssText = btnMini + 'font-size:15px;';
      closeBtn.addEventListener('click', () => { data.win.open = false; saveSoon(); closeWindow(); });
      header.appendChild(title); header.appendChild(closeBtn);
      win.appendChild(header);
      makeDraggable(win, header, (x, y) => { data.win.x = x; data.win.y = y; saveSoon(); });

      // Body: sidebar (sections tree) + editor pane
      const body = document.createElement('div');
      body.style.cssText = 'flex:1;display:flex;min-height:0;';
      const side = document.createElement('div');
      side.style.cssText = 'width:210px;flex-shrink:0;border-right:1px solid #30363d;overflow:auto;padding:8px;';
      const mainPane = document.createElement('div');
      mainPane.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;padding:10px;gap:8px;overflow:auto;';
      body.appendChild(side); body.appendChild(mainPane);
      win.appendChild(body);

      const findSection = (id) => data.sections.find((s) => s.id === id) || null;

      // Sidebar = top-level sections only (the picker). Click one to edit it on the right.
      const renderSide = () => {
        side.innerHTML = '';
        data.sections.forEach((sec) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:2px;padding:5px 6px;border-radius:6px;' + (data.selected === sec.id ? 'background:#1f6feb33;' : '');
          const label = document.createElement('span');
          label.textContent = sec.name;
          label.style.cssText = 'flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;';
          label.addEventListener('click', () => { data.selected = sec.id; saveSoon(); renderAll(); });
          const del = document.createElement('button');
          del.textContent = '×'; del.title = 'Delete section'; del.style.cssText = btnMini;
          del.addEventListener('click', () => { if (confirm('Delete section "' + sec.name + '" and everything in it?')) { data.sections = data.sections.filter((x) => x !== sec); if (data.selected === sec.id) data.selected = null; save(); renderAll(); } });
          row.appendChild(label); row.appendChild(del);
          side.appendChild(row);
        });

        const addSec = document.createElement('button');
        addSec.textContent = '+ Add Section';
        addSec.style.cssText = 'margin-top:8px;width:100%;padding:6px;border:1px dashed #30363d;border-radius:6px;background:transparent;color:#8b949e;cursor:pointer;';
        addSec.addEventListener('click', () => { const s = { id: uid(), name: 'New Section', content: '', subsections: [] }; data.sections.push(s); data.selected = s.id; save(); renderAll(); });
        side.appendChild(addSec);
      };

      // One editable card = a title field + a text area. Used for the section itself AND each sub-section.
      const makeCard = (item, opts) => {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;flex-direction:column;gap:6px;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px;';
        const top = document.createElement('div');
        top.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const name = document.createElement('input');
        name.value = item.name;
        name.placeholder = 'Title';
        name.style.cssText = 'flex:1;font-size:14px;font-weight:600;background:transparent;border:none;border-bottom:1px solid #30363d;color:#c9d1d9;padding:4px 2px;outline:none;';
        name.addEventListener('input', () => { item.name = name.value; saveSoon(); if (opts && opts.onRename) opts.onRename(); });
        top.appendChild(name);
        if (opts && opts.onDelete) {
          const del = document.createElement('button');
          del.textContent = '×'; del.title = 'Delete'; del.style.cssText = btnMini + 'font-size:16px;';
          del.addEventListener('click', opts.onDelete);
          top.appendChild(del);
        }
        const ta = document.createElement('textarea');
        ta.value = item.content || '';
        ta.placeholder = 'Write here…';
        ta.style.cssText = 'width:100%;box-sizing:border-box;min-height:90px;resize:vertical;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;padding:8px;outline:none;font:13px system-ui,sans-serif;line-height:1.5;';
        ta.addEventListener('input', () => { item.content = ta.value; saveSoon(); });
        card.appendChild(top); card.appendChild(ta);
        return card;
      };

      // Right pane = the selected section's own card, then a card per sub-section, then an Add button.
      const renderMain = () => {
        mainPane.innerHTML = '';
        const sec = data.selected ? findSection(data.selected) : null;
        if (!sec) {
          const empty = document.createElement('div');
          empty.style.cssText = 'color:#6e7681;margin:auto;text-align:center;';
          empty.textContent = 'Select a section on the left, or add one, to start writing.';
          mainPane.appendChild(empty);
          return;
        }
        // The section's own block (renaming it updates the sidebar).
        mainPane.appendChild(makeCard(sec, { onRename: renderSide }));
        // Each sub-section as its own editable block, inline.
        sec.subsections.forEach((sub) => {
          mainPane.appendChild(makeCard(sub, { onDelete: () => { sec.subsections = sec.subsections.filter((x) => x !== sub); save(); renderMain(); } }));
        });
        // Add another sub-section.
        const add = document.createElement('button');
        add.textContent = '+ Add Section';
        add.style.cssText = 'width:100%;padding:8px;border:1px dashed #30363d;border-radius:8px;background:transparent;color:#8b949e;cursor:pointer;';
        add.addEventListener('click', () => { sec.subsections.push({ id: uid(), name: 'New Section', content: '' }); save(); renderMain(); });
        mainPane.appendChild(add);
      };

      const renderAll = () => { renderSide(); renderMain(); };
      renderAll();

      // Persist size when the user drags the resize corner.
      try {
        const ro = new ResizeObserver(() => { data.win.w = win.offsetWidth; data.win.h = win.offsetHeight; saveSoon(); });
        ro.observe(win);
        win.__ro = ro;
      } catch (e) { /* ResizeObserver may be unavailable; size just won't persist */ }

      document.body.appendChild(win);
    }

    if (data.win.open) openWindow();

    // Tear-down for disable / uninstall.
    _cleanup = () => { if (saveTimer) clearTimeout(saveTimer); closeWindow(); fab.remove(); };
  },

  onDisable() { try { if (_cleanup) _cleanup(); } catch (e) {} _cleanup = null; },
  onUninstall() { try { if (_cleanup) _cleanup(); } catch (e) {} _cleanup = null; },
};
