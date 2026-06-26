/**
 * Plugin Manager UI Component
 * 
 * Provides a visual interface for installing, managing, enabling/disabling,
 * and configuring plugins in FlourishVNE.
 */

import React, { useState, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { VNPlugin, PluginManifest } from '../types/plugins';
import { PlusIcon, TrashIcon } from './icons';

/** Guess a mime type from a file name (for rebuilding data URLs from a .flourishext bundle). */
const mimeFromName = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
        svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4',
        json: 'application/json', txt: 'text/plain', css: 'text/css', js: 'text/javascript',
    };
    return map[ext] || 'application/octet-stream';
};
import {
    createPlugin,
    validatePluginManifest,
    PluginManagerService
} from '../features/plugins/PluginManagerService';

interface PluginManagerUIProps {
    onClose: () => void;
}

type TabView = 'installed' | 'install' | 'details';

/** A working starter plugin (custom command + custom screen effect + a hook) the user can load
 *  into the install box with one click. Mirrors docs/examples/sample.plugin.js. */
const SAMPLE_PLUGIN_SOURCE = `// Sample plugin — a custom command + a custom screen effect.
const manifest = {
  id: 'sample-plugin',
  name: 'Sample Plugin',
  version: '1.0.0',
  description: 'Example: a custom command, a custom screen effect, and a hook.',
  author: 'You',
  category: 'utility',
};

const plugin = {
  manifest,
  onEnable(api) {
    // Custom command → appears in the Command Palette under "Plugins".
    api.registerCommand({
      type: 'addPoints', displayName: 'Add Points', category: 'Sample Plugin',
      description: 'Adds an amount to a number variable.', icon: '+',
      parameters: [
        { name: 'variable', label: 'Variable', type: 'variable', required: true },
        { name: 'amount', label: 'Amount', type: 'number', defaultValue: 1 },
      ],
      handler: (params, api) => {
        const cur = Number(api.getVariable(params.variable)) || 0;
        api.setVariable(params.variable, cur + (Number(params.amount) || 0));
        api.notify('Added ' + params.amount, 'success');
      },
    });
    // Custom screen effect → appears in "Set Screen Overlay Effect".
    api.registerEffect({
      type: 'pulseVignette', displayName: 'Pulse Vignette',
      description: 'A soft pulsing vignette.', parameters: [],
      render: (ctx, info) => {
        const { width, height, intensity, timeMs } = info;
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 600);
        const r = Math.max(width, height) * 0.75;
        const g = ctx.createRadialGradient(width/2, height/2, r*0.4, width/2, height/2, r);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,' + (0.6 * intensity * pulse) + ')');
        ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
      },
    });
  },
  onRuntimeInit(api) { api.notify('Sample plugin ready', 'info'); },
};`;

/** Sample EXTENSION (target: 'editor') — contributes a floating editor panel. Demonstrates the Phase C
 *  Extensions layer: free-form render + project-scoped persistent storage. Open it from Tools →
 *  Extension Panels after enabling. Editor extensions run with full trust and aren't shipped to players. */
const SAMPLE_EXTENSION_SOURCE = `// Sample extension — adds a "Notepad" panel to the editor.
const manifest = {
  id: 'sample-extension',
  name: 'Notepad Panel',
  version: '1.0.0',
  description: 'Adds a floating notepad panel to the editor. Notes are saved with the project.',
  author: 'You',
  category: 'utility',
  // 'both' = editor add-ons (panel/tool/database, editor-only) PLUS a custom UI element that ships in games.
  target: 'both',
  capabilities: ['ui-panels'],
};

const plugin = {
  manifest,
  onEnable(api) {
    api.registerPanel({
      id: 'notepad',
      title: 'Notepad',
      icon: '📝',
      // Free-form render: you get a real container + an editor context. Do anything here.
      render: (container, ctx) => {
        const ta = document.createElement('textarea');
        ta.value = ctx.getStorage('notes') || '';
        ta.placeholder = 'Project notes…';
        ta.style.cssText = 'width:100%;height:100%;box-sizing:border-box;border:none;outline:none;resize:none;padding:10px;font:13px sans-serif;background:#0d1117;color:#c9d1d9;';
        ta.addEventListener('input', () => ctx.setStorage('notes', ta.value));
        container.appendChild(ta);
      },
    });
    // A menu/tool action → appears under Tools ▸ Extension Tools.
    if (api.registerMenuItem) {
      api.registerMenuItem({
        id: 'notes-wordcount', label: 'Notepad: word count', icon: '🔢',
        run: (ctx) => {
          const notes = ctx.getStorage('notes') || '';
          const words = notes.trim() ? notes.trim().split(/\\s+/).length : 0;
          ctx.notify('Notepad has ' + words + ' words.', 'info');
        },
      });
    }
    // A custom database category → appears under Tools ▸ Extension Data.
    if (api.registerDatabaseCategory) {
      api.registerDatabaseCategory({
        id: 'cards', name: 'Cards', icon: '🃏', recordLabel: 'Card', titleField: 'name',
        fields: [
          { key: 'name', label: 'Name', type: 'text', placeholder: 'Card name' },
          { key: 'cost', label: 'Cost', type: 'number', default: 1 },
          { key: 'rarity', label: 'Rarity', type: 'select', default: 'common', options: [
            { label: 'Common', value: 'common' }, { label: 'Rare', value: 'rare' }, { label: 'Legendary', value: 'legendary' },
          ] },
          { key: 'art', label: 'Art', type: 'asset' },
          { key: 'description', label: 'Description', type: 'textarea' },
        ],
      });
    }
    // A custom SCREEN element → appears in the menu/UI editor element palette AND ships in games.
    if (api.registerUIElementType) {
      api.registerUIElementType({
        type: 'badge', displayName: 'Badge', icon: '🏷️',
        defaultProps: { label: 'NEW', color: '#e11d48', textColor: '#ffffff' },
        defaultSize: { width: 14, height: 8 },
        inspector: [
          { key: 'label', label: 'Label', type: 'text' },
          { key: 'color', label: 'Background', type: 'color', default: '#e11d48' },
          { key: 'textColor', label: 'Text color', type: 'color', default: '#ffffff' },
        ],
        // Returns an HTML string (sandbox-safe — no DOM). Fills the element box.
        render: (props) => '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:8px;font:bold 14px sans-serif;background:' + (props.color || '#e11d48') + ';color:' + (props.textColor || '#fff') + ';">' + String(props.label == null ? '' : props.label) + '</div>',
      });
    }
  },
};`;

const CATEGORY_LABELS: Record<string, string> = {
    commands: '⚡ Commands',
    effects: '✨ Effects',
    ui: '🎨 UI',
    assets: '📁 Assets',
    gameplay: '🎮 Gameplay',
    integration: '🔗 Integration',
    utility: '🔧 Utility',
};

const PluginManagerUI: React.FC<PluginManagerUIProps> = ({ onClose }) => {
    const { t } = useTranslation('editorTools');
    const { project, dispatch } = useProject();
    const plugins = useMemo(() => Object.values(project.plugins || {}) as VNPlugin[], [project.plugins]);
    const [activeTab, setActiveTab] = useState<TabView>('installed');
    const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
    const [installSource, setInstallSource] = useState('');
    const [installError, setInstallError] = useState('');
    const [consoleLog, setConsoleLog] = useState<string[]>([]);
    const [pendingInstall, setPendingInstall] = useState<PluginManifest | null>(null);
    const [pendingInstallResources, setPendingInstallResources] = useState<Record<string, string>>({});

    const selectedPlugin = selectedPluginId ? (project.plugins || {})[selectedPluginId] : null;

    // Get the plugin manager service
    const pluginManager = useMemo(() => PluginManagerService.getInstance(), []);

    // Count enabled/disabled
    const enabledCount = plugins.filter(p => p.state === 'enabled').length;
    const disabledCount = plugins.filter(p => p.state !== 'enabled').length;

    // Install is gated behind a trust prompt: peek the manifest, show what's being installed + its
    // capabilities, and only load it after the user confirms (full-trust local model, explicit opt-in).
    const handleInstallPlugin = useCallback(() => {
        setInstallError('');
        const source = installSource.trim();
        if (!source) {
            setInstallError(t('pluginManager.installErrorEmpty'));
            return;
        }
        const manifest = pluginManager.peekManifest(source);
        if (!manifest) {
            setInstallError(t('pluginManager.installErrorFormat'));
            return;
        }
        setPendingInstall(manifest);
    }, [installSource, pluginManager, t]);

    const confirmInstall = useCallback(() => {
        const source = installSource.trim();
        const resources = pendingInstallResources;
        setPendingInstall(null);
        try {
            const result = pluginManager.loadPlugin(source, project, dispatch, resources);
            if (result) {
                setPendingInstallResources({});
                setConsoleLog(prev => [...prev, `✓ Installed "${result.manifest.name}" v${result.manifest.version}`]);
                setInstallSource('');
                setActiveTab('installed');
            } else {
                setInstallError(t('pluginManager.installErrorFormat'));
            }
        } catch (err: any) {
            setInstallError(err.message || 'Installation failed.');
            setConsoleLog(prev => [...prev, `✖ Install failed: ${err.message}`]);
        }
    }, [installSource, pendingInstallResources, pluginManager, project, dispatch, t]);

    const handleEnablePlugin = useCallback((pluginId: string) => {
        try {
            pluginManager.enablePlugin(pluginId, project, dispatch);
            setConsoleLog(prev => [...prev, `✓ Enabled plugin "${pluginId}"`]);
        } catch (err: any) {
            setConsoleLog(prev => [...prev, `✖ Enable failed: ${err.message}`]);
        }
    }, [pluginManager, project, dispatch]);

    const handleDisablePlugin = useCallback((pluginId: string) => {
        try {
            pluginManager.disablePlugin(pluginId, project, dispatch);
            setConsoleLog(prev => [...prev, `✓ Disabled plugin "${pluginId}"`]);
        } catch (err: any) {
            setConsoleLog(prev => [...prev, `✖ Disable failed: ${err.message}`]);
        }
    }, [pluginManager, project, dispatch]);

    const handleUninstallPlugin = useCallback((pluginId: string) => {
        try {
            pluginManager.uninstallPlugin(pluginId, dispatch);
            setConsoleLog(prev => [...prev, `✓ Uninstalled plugin "${pluginId}"`]);
            if (selectedPluginId === pluginId) {
                setSelectedPluginId(null);
                setActiveTab('installed');
            }
        } catch (err: any) {
            setConsoleLog(prev => [...prev, `✖ Uninstall failed: ${err.message}`]);
        }
    }, [pluginManager, selectedPluginId, dispatch]);

    const viewDetails = useCallback((pluginId: string) => {
        setSelectedPluginId(pluginId);
        setActiveTab('details');
    }, []);

    const handleExportPlugin = useCallback((pluginId: string) => {
        const plugin = (project.plugins || {})[pluginId];
        if (!plugin) return;
        try {
            const blob = new Blob([plugin.source], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${pluginId}.plugin.js`;
            a.click();
            URL.revokeObjectURL(url);
            setConsoleLog(prev => [...prev, `✓ Exported "${pluginId}"`]);
        } catch (err: any) {
            setConsoleLog(prev => [...prev, `✖ Export failed: ${err.message}`]);
        }
    }, [project.plugins]);

    const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const isZip = /\.(flourishext|zip)$/i.test(file.name);
        if (isZip) {
            // .flourishext bundle: read entry.js (the source) + resources/* (rebuilt as data URLs).
            try {
                const zip = await JSZip.loadAsync(file);
                const entry = zip.file('entry.js') || zip.file(/\.js$/i)[0];
                if (!entry) throw new Error('Bundle has no entry.js');
                const source = await entry.async('string');
                const resources: Record<string, string> = {};
                const tasks: Promise<void>[] = [];
                zip.forEach((path, zf) => {
                    if (zf.dir || !path.startsWith('resources/')) return;
                    const name = path.slice('resources/'.length);
                    if (!name) return;
                    tasks.push(zf.async('base64').then(b64 => { resources[name] = `data:${mimeFromName(name)};base64,${b64}`; }));
                });
                await Promise.all(tasks);
                setInstallSource(source);
                setPendingInstallResources(resources);
                setInstallError('');
                setActiveTab('install');
            } catch (err: any) {
                setInstallError(`Couldn't read bundle: ${err.message}`);
                setActiveTab('install');
            }
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setInstallSource(String(reader.result || ''));
            setPendingInstallResources({});
            setInstallError('');
            setActiveTab('install');
        };
        reader.readAsText(file);
    }, []);

    // Export an installed extension as a shareable .flourishext bundle (manifest.json + entry.js + resources/).
    const handleExportBundle = useCallback(async (pluginId: string) => {
        const plugin = (project.plugins || {})[pluginId];
        if (!plugin) return;
        try {
            const zip = new JSZip();
            zip.file('manifest.json', JSON.stringify(plugin.manifest, null, 2));
            zip.file('entry.js', plugin.source);
            const res = plugin.resources || {};
            for (const [name, dataUrl] of Object.entries(res) as [string, string][]) {
                const comma = dataUrl.indexOf(',');
                const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
                zip.file(`resources/${name}`, b64, { base64: true });
            }
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${pluginId}.flourishext`;
            a.click();
            URL.revokeObjectURL(url);
            setConsoleLog(prev => [...prev, `✓ Exported bundle "${pluginId}.flourishext"`]);
        } catch (err: any) {
            setConsoleLog(prev => [...prev, `✖ Bundle export failed: ${err.message}`]);
        }
    }, [project.plugins]);

    // Attach resource files to an installed extension (so an Export bundles them).
    const handleAddResources = useCallback(async (pluginId: string, files: FileList | null) => {
        const plugin = (project.plugins || {})[pluginId];
        if (!plugin || !files || files.length === 0) return;
        const next: Record<string, string> = { ...(plugin.resources || {}) };
        const readOne = (f: File) => new Promise<void>(resolve => {
            const r = new FileReader();
            r.onload = () => { next[f.name] = String(r.result || ''); resolve(); };
            r.onerror = () => resolve();
            r.readAsDataURL(f);
        });
        await Promise.all(Array.from(files).map(readOne));
        dispatch({ type: 'SET_PLUGIN_RESOURCES', payload: { pluginId, resources: next } });
        setConsoleLog(prev => [...prev, `✓ Added ${files.length} resource(s) to "${pluginId}"`]);
    }, [project.plugins, dispatch]);

    const handleRemoveResource = useCallback((pluginId: string, name: string) => {
        const plugin = (project.plugins || {})[pluginId];
        if (!plugin) return;
        const next = { ...(plugin.resources || {}) };
        delete next[name];
        dispatch({ type: 'SET_PLUGIN_RESOURCES', payload: { pluginId, resources: next } });
    }, [project.plugins, dispatch]);

    const renderInstalled = () => (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {plugins.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-4xl mb-3">🧩</div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('pluginManager.noPluginsYet')}</p>
                    <button
                        onClick={() => setActiveTab('install')}
                        className="mt-3 bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors"
                    >
                        {t('pluginManager.installPluginCta')}
                    </button>
                </div>
            ) : (
                plugins.map(plugin => (
                    <div
                        key={plugin.manifest.id}
                        className="rounded-lg p-3 border transition-colors hover:border-violet-500/30"
                        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}
                    >
                        <div className="flex items-start gap-3">
                            <div className="text-2xl">
                                {plugin.manifest.category ? CATEGORY_LABELS[plugin.manifest.category]?.charAt(0) || '🧩' : '🧩'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                        {plugin.manifest.name}
                                    </span>
                                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                        v{plugin.manifest.version}
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                                        plugin.state === 'enabled' ? 'bg-emerald-500/20 text-emerald-300' :
                                        plugin.state === 'disabled' ? 'bg-slate-500/20 text-slate-300' :
                                        'bg-red-500/20 text-red-300'
                                    }`}>
                                        {plugin.state}
                                    </span>
                                </div>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                    {plugin.manifest.description}
                                </p>
                                {plugin.manifest.author && (
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        by {plugin.manifest.author}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {plugin.state === 'enabled' ? (
                                    <button
                                        onClick={() => handleDisablePlugin(plugin.manifest.id)}
                                        className="text-xs px-2 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 transition-colors"
                                    >
                                        {t('pluginManager.disable')}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleEnablePlugin(plugin.manifest.id)}
                                        className="text-xs px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                                    >
                                        {t('pluginManager.enable')}
                                    </button>
                                )}
                                <button
                                    onClick={() => viewDetails(plugin.manifest.id)}
                                    className="text-xs px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 transition-colors"
                                >
                                    {t('pluginManager.details')}
                                </button>
                                <button
                                    onClick={() => handleUninstallPlugin(plugin.manifest.id)}
                                    className="text-xs px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 transition-colors"
                                >
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    const renderInstallTab = () => (
        <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto">
                <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {t('pluginManager.installTitle')}
                </h3>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('pluginManager.installDescription')} <code className="bg-slate-800 px-1 rounded">manifest</code> {t('pluginManager.installDescriptionMid')} <strong>{t('pluginManager.installDescriptionLoadExample')}</strong> {t('pluginManager.installDescriptionEnd')} <code className="bg-slate-800 px-1 rounded">{t('pluginManager.installDescriptionDocs')}</code> {t('pluginManager.installDescriptionDocsEnd')}
                </p>

                <textarea
                    value={installSource}
                    onChange={e => { setInstallSource(e.target.value); setInstallError(''); }}
                    placeholder={`// Example Plugin Template
const manifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'A custom plugin',
  author: 'Your Name',
  category: 'utility',
  capabilities: [],
};

function onLoad(api) {
  console.log('Plugin loaded!');
}

function onEnable(api) {
  console.log('Plugin enabled!');
}

function onDisable(api) {
  console.log('Plugin disabled!');
}

// Export plugin interface
const plugin = { manifest, onLoad, onEnable, onDisable };`}
                    className="w-full h-80 resize-none p-3 rounded-lg text-xs font-mono leading-5 outline-none"
                    style={{
                        background: '#0d1117',
                        color: '#c9d1d9',
                        border: installError ? '1px solid #f85149' : '1px solid var(--border-subtle)',
                    }}
                />

                {installError && (
                    <div className="mt-2 p-2 rounded text-xs text-red-400 bg-red-500/10 border border-red-500/20">
                        ✖ {installError}
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-3">
                    <button
                        onClick={() => { setInstallSource(SAMPLE_PLUGIN_SOURCE); setInstallError(''); }}
                        className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                    >
                        {t('pluginManager.loadExample')}
                    </button>
                    <button
                        onClick={() => { setInstallSource(SAMPLE_EXTENSION_SOURCE); setInstallError(''); }}
                        className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                        title={t('pluginManager.loadExamplePanelHint', 'Loads a sample editor extension (a Notepad panel). Open it from Tools → Extension Panels.')}
                    >
                        {t('pluginManager.loadExamplePanel', 'Load Example Panel')}
                    </button>
                    <label className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors cursor-pointer">
                        {t('pluginManager.importFromFile')}
                        <input type="file" accept=".js,.txt,.flourishext,.zip" onChange={handleImportFile} className="hidden" />
                    </label>
                    <button
                        onClick={() => { setInstallSource(''); setInstallError(''); }}
                        className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                    >
                        {t('pluginManager.clear')}
                    </button>
                    <button
                        onClick={handleInstallPlugin}
                        className="text-xs px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
                    >
                        <PlusIcon className="w-3 h-3 inline mr-1" />
                        {t('pluginManager.installButton')}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderDetails = () => {
        if (!selectedPlugin) {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('pluginManager.noPluginSelected')}</p>
                </div>
            );
        }

        const m = selectedPlugin.manifest;
        const ownedCommands = pluginManager.getRegisteredCommands().filter(c => c.type.startsWith(m.id + '.'));
        const ownedEffects = pluginManager.getRegisteredEffects().filter(e => e.type.startsWith(m.id + '.'));
        const settingsSchema = (m as any).settings as Array<{ name: string; label?: string; type: string; defaultValue?: any; options?: Array<{ label: string; value: string }> }> | undefined;

        return (
            <div className="flex-1 overflow-y-auto p-4">
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Plugin Header */}
                    <div className="flex items-start gap-3">
                        <div className="text-3xl">
                            {m.category ? CATEGORY_LABELS[m.category]?.charAt(0) || '🧩' : '🧩'}
                        </div>
                        <div>
                            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{m.name}</h3>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.description}</p>
                        </div>
                    </div>

                    {/* Metadata Table */}
                    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
                        <table className="w-full text-xs">
                            <tbody>
                                {[
                                    [t('pluginManager.metaId'), m.id],
                                    [t('pluginManager.metaVersion'), m.version],
                                    [t('pluginManager.metaAuthor'), m.author || '—'],
                                    [t('pluginManager.metaCategory'), m.category ? CATEGORY_LABELS[m.category] || m.category : '—'],
                                    [t('pluginManager.metaState'), selectedPlugin.state],
                                    [t('pluginManager.metaCapabilities'), (m.capabilities || []).join(', ') || '—'],
                                ].map(([label, value], i) => (
                                    <tr key={label} className={i % 2 === 0 ? '' : ''} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-elevated)' }}>
                                        <td className="px-3 py-1.5 font-semibold w-32" style={{ color: 'var(--text-secondary)' }}>{label}</td>
                                        <td className="px-3 py-1.5" style={{ color: 'var(--text-primary)' }}>{value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Registered Commands (live from the plugin manager) */}
                    {ownedCommands.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.registeredCommandsTitle')}</h4>
                            <div className="space-y-1">
                                {ownedCommands.map(cmd => (
                                    <div key={cmd.type} className="p-2 rounded text-xs border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}>
                                        <span className="font-bold text-sky-300">{cmd.displayName}</span>
                                        {cmd.description && <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{cmd.description}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Registered Effects (live from the plugin manager) */}
                    {ownedEffects.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.registeredEffectsTitle')}</h4>
                            <div className="space-y-1">
                                {ownedEffects.map(eff => (
                                    <div key={eff.type} className="p-2 rounded text-xs border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}>
                                        <span className="font-bold text-violet-300">{eff.displayName}</span>
                                        {eff.description && <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{eff.description}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Plugin Settings (from optional manifest.settings schema) */}
                    {settingsSchema && settingsSchema.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.settingsTitle')}</h4>
                            <div className="space-y-2 p-2 rounded border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}>
                                {settingsSchema.map(field => {
                                    const current = selectedPlugin.config?.[field.name] ?? field.defaultValue ?? '';
                                    const setField = (value: any) => {
                                        dispatch({ type: 'UPDATE_PLUGIN_CONFIG', payload: { pluginId: m.id, config: { ...selectedPlugin.config, [field.name]: value } } });
                                    };
                                    return (
                                        <label key={field.name} className="block text-xs">
                                            <span className="block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{field.label || field.name}</span>
                                            {field.type === 'boolean' ? (
                                                <input type="checkbox" checked={!!current} onChange={e => setField(e.target.checked)} />
                                            ) : field.type === 'select' ? (
                                                <select value={String(current)} onChange={e => setField(e.target.value)} className="w-full bg-slate-900 text-white px-2 py-1 rounded border border-slate-700">
                                                    {(field.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            ) : (
                                                <input type={field.type === 'number' ? 'number' : 'text'} value={String(current)} onChange={e => setField(field.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} className="w-full bg-slate-900 text-white px-2 py-1 rounded border border-slate-700" />
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Plugin Config */}
                    {selectedPlugin.config && Object.keys(selectedPlugin.config).length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.configurationTitle')}</h4>
                            <pre className="p-2 rounded text-xs font-mono overflow-x-auto" style={{ background: '#0d1117', color: '#c9d1d9' }}>
                                {JSON.stringify(selectedPlugin.config, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Exported-game inclusion */}
                    <div>
                        <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.buildInclusionTitle', 'Exported game')}</h4>
                        {m.target === 'editor' ? (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('pluginManager.editorOnlyNote', 'Editor extension — runs only in the editor and is never included in exported games.')}
                            </p>
                        ) : (
                            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedPlugin.includeInBuild !== false}
                                    onChange={e => dispatch({ type: 'SET_PLUGIN_BUILD_INCLUDED', payload: { pluginId: m.id, included: e.target.checked } })}
                                />
                                {t('pluginManager.includeInBuild', 'Include this plugin in exported games')}
                            </label>
                        )}
                        {(m.target === 'editor' || m.target === 'both') && (
                            <label className="flex items-center gap-2 text-xs cursor-pointer mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedPlugin.hideInTestPlay === true}
                                    onChange={e => dispatch({ type: 'SET_PLUGIN_HIDE_IN_TESTPLAY', payload: { pluginId: m.id, hidden: e.target.checked } })}
                                />
                                {t('pluginManager.hideInTestPlay', 'Hide this extension during test play')}
                            </label>
                        )}
                    </div>

                    {/* Bundled resources (for .flourishext) */}
                    <div>
                        <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.resourcesTitle', 'Resources')}</h4>
                        <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('pluginManager.resourcesHint', 'Files bundled with this extension. The code reads them with game.getResource(name) / api.getResource(name).')}</p>
                        {Object.keys(selectedPlugin.resources || {}).length > 0 ? (
                            <div className="flex flex-col gap-1 mb-2">
                                {Object.keys(selectedPlugin.resources || {}).map(name => (
                                    <div key={name} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-primary)' }}>
                                        <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{name}</span>
                                        <button onClick={() => handleRemoveResource(m.id, name)} className="text-[var(--text-muted)] hover:text-red-400">✕</button>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('pluginManager.resourcesNone', 'No resources.')}</div>}
                        <label className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors cursor-pointer inline-block">
                            {t('pluginManager.addResources', '+ Add files')}
                            <input type="file" multiple onChange={e => { handleAddResources(m.id, e.target.files); e.target.value = ''; }} className="hidden" />
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        {selectedPlugin.state === 'enabled' ? (
                            <button
                                onClick={() => handleDisablePlugin(m.id)}
                                className="text-xs px-3 py-1.5 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 transition-colors"
                            >
                                {t('pluginManager.detailsDisable')}
                            </button>
                        ) : (
                            <button
                                onClick={() => handleEnablePlugin(m.id)}
                                className="text-xs px-3 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                            >
                                {t('pluginManager.detailsEnable')}
                            </button>
                        )}
                        <button
                            onClick={() => handleExportPlugin(m.id)}
                            className="text-xs px-3 py-1.5 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 transition-colors"
                            title={t('pluginManager.detailsExportJsHint', 'Export the code as a single .js file')}
                        >
                            {t('pluginManager.detailsExport')}
                        </button>
                        <button
                            onClick={() => handleExportBundle(m.id)}
                            className="text-xs px-3 py-1.5 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 transition-colors"
                            title={t('pluginManager.detailsExportBundleHint', 'Export as a .flourishext bundle (code + resources)')}
                        >
                            {t('pluginManager.detailsExportBundle', 'Export .flourishext')}
                        </button>
                        <button
                            onClick={() => { handleUninstallPlugin(m.id); setActiveTab('installed'); }}
                            className="text-xs px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 transition-colors"
                        >
                            {t('pluginManager.detailsUninstall')}
                        </button>
                        <button
                            onClick={() => setActiveTab('installed')}
                            className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors ml-auto"
                        >
                            {t('pluginManager.detailsBack')}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="rounded-xl overflow-hidden flex flex-col" style={{ width: '80vw', height: '75vh', maxWidth: '1100px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🧩</span>
                        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('pluginManager.title')}</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-violet, #7c3aed)', color: '#fff' }}>
                            {t('pluginManager.activeCount', { count: enabledCount })}
                        </span>
                        {disabledCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-600 text-white">
                                {t('pluginManager.inactiveCount', { count: disabledCount })}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="text-xs px-3 py-1 rounded hover:bg-red-500/20 text-red-400 transition-colors">
                        {t('pluginManager.close')}
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                    {([
                        { key: 'installed' as TabView, label: t('pluginManager.tabInstalled'), icon: '📦' },
                        { key: 'install' as TabView, label: t('pluginManager.tabInstallPlugin'), icon: '➕' },
                    ]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
                                activeTab === tab.key
                                    ? 'border-violet-500 text-violet-300'
                                    : 'border-transparent hover:text-white'
                            }`}
                            style={{ color: activeTab === tab.key ? undefined : 'var(--text-secondary)' }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                    {activeTab === 'details' && (
                        <div className="px-4 py-2 text-xs font-semibold border-b-2 border-violet-500 text-violet-300">
                            {t('pluginManager.tabDetails')}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {activeTab === 'installed' && renderInstalled()}
                    {activeTab === 'install' && renderInstallTab()}
                    {activeTab === 'details' && renderDetails()}
                </div>

                {/* Console Log */}
                {consoleLog.length > 0 && (
                    <div className="h-24 border-t flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="flex items-center justify-between px-3 py-1" style={{ background: 'var(--bg-elevated)' }}>
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('pluginManager.logLabel')}</span>
                            <button onClick={() => setConsoleLog([])} className="text-xs text-slate-400 hover:text-white transition-colors">{t('pluginManager.clearLog')}</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs" style={{ background: '#0d1117', color: '#8b949e' }}>
                            {consoleLog.map((line, i) => (
                                <div key={i} className={
                                    line.startsWith('✖') ? 'text-red-400' :
                                    line.startsWith('✓') ? 'text-emerald-400' :
                                    'text-slate-300'
                                }>{line}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Install trust prompt — discloses what's being installed before any code runs. */}
            {pendingInstall && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPendingInstall(null)}>
                    <div className="w-[440px] max-w-[92vw] rounded-xl border p-4 flex flex-col gap-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }} onClick={e => e.stopPropagation()}>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {t('pluginManager.trustTitle', 'Install')} “{pendingInstall.name}”?
                        </div>
                        <div className="text-xs flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
                            <div>v{pendingInstall.version} · {t('pluginManager.trustBy', 'by')} {pendingInstall.author || 'unknown'}</div>
                            {pendingInstall.description && <div style={{ color: 'var(--text-muted)' }}>{pendingInstall.description}</div>}
                            <div className="mt-1">
                                {t('pluginManager.trustType', 'Type')}: <strong>{pendingInstall.target === 'editor' ? t('pluginManager.trustTypeEditor', 'Editor extension') : pendingInstall.target === 'both' ? t('pluginManager.trustTypeBoth', 'Editor + game') : t('pluginManager.trustTypeRuntime', 'Game (runtime) plugin')}</strong>
                            </div>
                            {pendingInstall.capabilities && pendingInstall.capabilities.length > 0 && (
                                <div>{t('pluginManager.trustCapabilities', 'Capabilities')}: {pendingInstall.capabilities.join(', ')}</div>
                            )}
                        </div>
                        <div className="text-[11px] rounded p-2" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                            {pendingInstall.target === 'editor' || pendingInstall.target === 'both'
                                ? t('pluginManager.trustWarnEditor', '⚠️ This add-on runs code in your editor with full access to your machine. Only install add-ons from sources you trust.')
                                : t('pluginManager.trustWarnRuntime', '⚠️ This plugin runs code inside your game. Only install add-ons from sources you trust.')}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setPendingInstall(null)} className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white">{t('common:cancel', 'Cancel')}</button>
                            <button onClick={confirmInstall} className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white">{t('pluginManager.trustInstall', 'Install')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PluginManagerUI;
