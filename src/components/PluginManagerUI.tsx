/**
 * Plugin Manager UI Component
 * 
 * Provides a visual interface for installing, managing, enabling/disabling,
 * and configuring plugins in FlourishVNE.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNPlugin, PluginManifest } from '../types/plugins';
import { PlusIcon, TrashIcon } from './icons';
import {
    createPlugin,
    validatePluginManifest,
    PluginManagerService
} from '../features/plugins/PluginManagerService';

interface PluginManagerUIProps {
    onClose: () => void;
}

type TabView = 'installed' | 'install' | 'details';

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
    const { project, dispatch } = useProject();
    const plugins = useMemo(() => Object.values(project.plugins || {}) as VNPlugin[], [project.plugins]);
    const [activeTab, setActiveTab] = useState<TabView>('installed');
    const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
    const [installSource, setInstallSource] = useState('');
    const [installError, setInstallError] = useState('');
    const [consoleLog, setConsoleLog] = useState<string[]>([]);

    const selectedPlugin = selectedPluginId ? (project.plugins || {})[selectedPluginId] : null;

    // Get the plugin manager service
    const pluginManager = useMemo(() => PluginManagerService.getInstance(), []);

    // Count enabled/disabled
    const enabledCount = plugins.filter(p => p.state === 'enabled').length;
    const disabledCount = plugins.filter(p => p.state !== 'enabled').length;

    const handleInstallPlugin = useCallback(() => {
        setInstallError('');
        const source = installSource.trim();
        if (!source) {
            setInstallError('Please paste plugin source code.');
            return;
        }

        try {
            const result = pluginManager.loadPlugin(source, project, dispatch);
            if (result) {
                setConsoleLog(prev => [...prev, `✓ Installed "${result.manifest.name}" v${result.manifest.version}`]);
                setInstallSource('');
                setActiveTab('installed');
            } else {
                setInstallError('Failed to load plugin. Check the source code format.');
            }
        } catch (err: any) {
            setInstallError(err.message || 'Installation failed.');
            setConsoleLog(prev => [...prev, `✖ Install failed: ${err.message}`]);
        }
    }, [installSource, pluginManager, project, dispatch]);

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

    const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setInstallSource(String(reader.result || ''));
            setInstallError('');
            setActiveTab('install');
        };
        reader.readAsText(file);
        e.target.value = '';
    }, []);

    const renderInstalled = () => (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {plugins.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-4xl mb-3">🧩</div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No plugins installed yet.</p>
                    <button
                        onClick={() => setActiveTab('install')}
                        className="mt-3 bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors"
                    >
                        Install a Plugin
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
                                        Disable
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleEnablePlugin(plugin.manifest.id)}
                                        className="text-xs px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                                    >
                                        Enable
                                    </button>
                                )}
                                <button
                                    onClick={() => viewDetails(plugin.manifest.id)}
                                    className="text-xs px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 transition-colors"
                                >
                                    Details
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
                    Install Plugin from Source
                </h3>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Paste the plugin source code below. Plugins must export a <code className="bg-slate-800 px-1 rounded">manifest</code> object
                    and optional lifecycle hooks. See the documentation for the full plugin API.
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
                    <label className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors cursor-pointer">
                        Import from file…
                        <input type="file" accept=".js,.txt" onChange={handleImportFile} className="hidden" />
                    </label>
                    <button
                        onClick={() => { setInstallSource(''); setInstallError(''); }}
                        className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={handleInstallPlugin}
                        className="text-xs px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
                    >
                        <PlusIcon className="w-3 h-3 inline mr-1" />
                        Install Plugin
                    </button>
                </div>
            </div>
        </div>
    );

    const renderDetails = () => {
        if (!selectedPlugin) {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No plugin selected.</p>
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
                                    ['ID', m.id],
                                    ['Version', m.version],
                                    ['Author', m.author || '—'],
                                    ['Category', m.category ? CATEGORY_LABELS[m.category] || m.category : '—'],
                                    ['State', selectedPlugin.state],
                                    ['Capabilities', (m.capabilities || []).join(', ') || '—'],
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
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Registered Commands</h4>
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
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Registered Effects</h4>
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
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Settings</h4>
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
                            <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Configuration</h4>
                            <pre className="p-2 rounded text-xs font-mono overflow-x-auto" style={{ background: '#0d1117', color: '#c9d1d9' }}>
                                {JSON.stringify(selectedPlugin.config, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        {selectedPlugin.state === 'enabled' ? (
                            <button
                                onClick={() => handleDisablePlugin(m.id)}
                                className="text-xs px-3 py-1.5 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 transition-colors"
                            >
                                Disable
                            </button>
                        ) : (
                            <button
                                onClick={() => handleEnablePlugin(m.id)}
                                className="text-xs px-3 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                            >
                                Enable
                            </button>
                        )}
                        <button
                            onClick={() => handleExportPlugin(m.id)}
                            className="text-xs px-3 py-1.5 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 transition-colors"
                        >
                            Export
                        </button>
                        <button
                            onClick={() => { handleUninstallPlugin(m.id); setActiveTab('installed'); }}
                            className="text-xs px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 transition-colors"
                        >
                            Uninstall
                        </button>
                        <button
                            onClick={() => setActiveTab('installed')}
                            className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors ml-auto"
                        >
                            ← Back
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
                        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Plugin Manager</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-violet, #7c3aed)', color: '#fff' }}>
                            {enabledCount} active
                        </span>
                        {disabledCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-600 text-white">
                                {disabledCount} inactive
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="text-xs px-3 py-1 rounded hover:bg-red-500/20 text-red-400 transition-colors">
                        Close
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                    {([
                        { key: 'installed' as TabView, label: 'Installed', icon: '📦' },
                        { key: 'install' as TabView, label: 'Install Plugin', icon: '➕' },
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
                            🔍 Plugin Details
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
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Log</span>
                            <button onClick={() => setConsoleLog([])} className="text-xs text-slate-400 hover:text-white transition-colors">Clear</button>
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
        </div>
    );
};

export default PluginManagerUI;
