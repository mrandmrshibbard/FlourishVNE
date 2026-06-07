/**
 * Script Editor Component
 * 
 * A full-featured script editor with syntax highlighting (textarea-based),
 * script management, validation, and test execution.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNScript, ScriptParam } from '../types/scripting';
import { createDefaultScript, validateScript, executeScript, ScriptRuntimeContext } from '../features/scripting/ScriptExecutor';
import { VNID } from '../types';
import { PlusIcon, TrashIcon, PencilIcon } from './icons';

interface ScriptEditorProps {
    onClose: () => void;
}

/** `game` API reference shown in the editor's reference panel. Clicking a row inserts the snippet. */
const API_REFERENCE: Array<{ group: string; items: Array<{ sig: string; snippet: string; desc: string }> }> = [
    { group: 'Variables', items: [
        { sig: 'getVariable(name)', snippet: 'game.getVariable("")', desc: 'Read a variable value.' },
        { sig: 'setVariable(name, value)', snippet: 'game.setVariable("", )', desc: 'Set a variable value.' },
        { sig: 'getVariables()', snippet: 'game.getVariables()', desc: 'All variables as a { name: value } map.' },
        { sig: 'args.NAME', snippet: 'game.args.', desc: 'Read a script parameter (read-only).' },
    ]},
    { group: 'Flow', items: [
        { sig: 'jumpToScene(name)', snippet: 'game.jumpToScene("")', desc: 'Jump to a scene by name/id.' },
        { sig: 'jumpToLabel(label)', snippet: 'game.jumpToLabel("")', desc: 'Jump to a label in the current scene.' },
        { sig: 'runScript(name, args?)', snippet: 'game.runScript("")', desc: 'Run another script (script-to-script).' },
        { sig: 'callCommonEvent(name, args?)', snippet: 'game.callCommonEvent("")', desc: 'Invoke a Common Event.' },
        { sig: 'await wait(seconds)', snippet: 'await game.wait(1)', desc: 'Pause this script (timers are blocked).' },
    ]},
    { group: 'Presentation', items: [
        { sig: 'showDialogue(name, text)', snippet: 'game.showDialogue("", "")', desc: 'Show a dialogue line.' },
        { sig: 'notify(msg, type?)', snippet: 'game.notify("", "info")', desc: 'Toast: info | success | warning | error.' },
        { sig: 'playSFX(name, vol?)', snippet: 'game.playSFX("")', desc: 'Play a sound effect.' },
        { sig: 'playMusic(name, loop?, vol?)', snippet: 'game.playMusic("", true)', desc: 'Play background music.' },
        { sig: 'stopMusic(fade?)', snippet: 'game.stopMusic(1)', desc: 'Stop music (fade seconds).' },
    ]},
    { group: 'Inventory', items: [
        { sig: 'getItemCount(item)', snippet: 'game.getItemCount("")', desc: 'How many the player owns.' },
        { sig: 'hasItem(item)', snippet: 'game.hasItem("")', desc: 'True if owned (count > 0).' },
        { sig: 'addItem(item, n?)', snippet: 'game.addItem("", 1)', desc: 'Give the player an item.' },
        { sig: 'removeItem(item, n?)', snippet: 'game.removeItem("", 1)', desc: 'Take an item away.' },
        { sig: 'getItems()', snippet: 'game.getItems()', desc: 'All items with counts.' },
    ]},
    { group: 'Project & Math', items: [
        { sig: 'getScenes()', snippet: 'game.getScenes()', desc: 'List of scene names.' },
        { sig: 'getCharacters()', snippet: 'game.getCharacters()', desc: 'List of { id, name }.' },
        { sig: 'currentScene / currentSceneId', snippet: 'game.currentScene', desc: 'Current scene name / id.' },
        { sig: 'random(min, max)', snippet: 'game.random(1, 10)', desc: 'Random integer (inclusive).' },
        { sig: 'clamp(v, min, max)', snippet: 'game.clamp(, 0, 100)', desc: 'Clamp a number.' },
        { sig: 'lerp(a, b, t)', snippet: 'game.lerp(0, 1, 0.5)', desc: 'Linear interpolate.' },
        { sig: 'log(...args)', snippet: 'game.log()', desc: 'Console output (Script Editor console).' },
    ]},
];

const ScriptEditor: React.FC<ScriptEditorProps> = ({ onClose }) => {
    const { project, dispatch } = useProject();
    const scripts = useMemo(() => Object.values(project.scripts || {}) as VNScript[], [project.scripts]);
    const [selectedScriptId, setSelectedScriptId] = useState<VNID | null>(scripts[0]?.id || null);
    const [editingCode, setEditingCode] = useState('');
    const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [newScriptName, setNewScriptName] = useState('');
    const [showApi, setShowApi] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Insert an API snippet at the textarea cursor (lightweight autocomplete substitute).
    const insertSnippet = useCallback((snippet: string) => {
        const ta = textareaRef.current;
        const start = ta ? ta.selectionStart : editingCode.length;
        const end = ta ? ta.selectionEnd : editingCode.length;
        const next = editingCode.substring(0, start) + snippet + editingCode.substring(end);
        setEditingCode(next);
        requestAnimationFrame(() => {
            if (!ta) return;
            ta.focus();
            const pos = start + snippet.length;
            ta.selectionStart = ta.selectionEnd = pos;
        });
    }, [editingCode]);

    const selectedScript = selectedScriptId ? (project.scripts || {})[selectedScriptId] : null;

    // Sync code when selection changes
    useEffect(() => {
        if (selectedScript) {
            setEditingCode(selectedScript.code);
            setValidationErrors([]);
        }
    }, [selectedScriptId]);

    const handleCreateScript = useCallback(() => {
        const name = newScriptName.trim() || `Script ${scripts.length + 1}`;
        const script = createDefaultScript(name);
        dispatch({ type: 'ADD_SCRIPT', payload: { script } });
        setSelectedScriptId(script.id);
        setEditingCode(script.code);
        setNewScriptName('');
        setShowNewDialog(false);
    }, [dispatch, newScriptName, scripts.length]);

    const handleDeleteScript = useCallback((scriptId: VNID) => {
        dispatch({ type: 'DELETE_SCRIPT', payload: { scriptId } });
        if (selectedScriptId === scriptId) {
            const remaining = scripts.filter(s => s.id !== scriptId);
            setSelectedScriptId(remaining[0]?.id || null);
        }
    }, [dispatch, selectedScriptId, scripts]);

    const handleSaveCode = useCallback(() => {
        if (!selectedScriptId) return;
        dispatch({
            type: 'UPDATE_SCRIPT',
            payload: { scriptId: selectedScriptId, updates: { code: editingCode } }
        });
        setConsoleOutput(prev => [...prev, '✓ Script saved.']);
    }, [dispatch, selectedScriptId, editingCode]);

    const handleValidate = useCallback(() => {
        const result = validateScript(editingCode);
        const messages: string[] = [];
        result.errors.forEach(e => messages.push(`✖ Line ${e.line}: ${e.message}`));
        result.warnings.forEach(w => messages.push(`⚠ Line ${w.line}: ${w.message}`));
        if (result.isValid && result.warnings.length === 0) {
            messages.push('✓ Script is valid.');
        }
        setValidationErrors(result.errors.map(e => `Line ${e.line}: ${e.message}`));
        setConsoleOutput(prev => [...prev, ...messages]);
    }, [editingCode]);

    const handleTestRun = useCallback(() => {
        if (!selectedScript) return;
        setIsRunning(true);
        setConsoleOutput(prev => [...prev, `▶ Running "${selectedScript.name}"...`]);

        // Build a mock runtime context for testing
        const testContext: ScriptRuntimeContext = {
            project,
            variables: Object.entries(project.variables).reduce((acc, [id, v]) => {
                const variable = v as any;
                acc[id] = variable.type === 'boolean' ? false : variable.type === 'number' ? 0 : '';
                return acc;
            }, {} as Record<VNID, string | number | boolean>),
            currentSceneId: project.startSceneId,
            // Seed game.args from the script's declared parameter defaults for the test run.
            args: (selectedScript.params || []).reduce((acc, p) => { acc[p.name] = p.defaultValue; return acc; }, {} as Record<string, string | number | boolean>),
            onSetVariable: (name, value) => {
                setConsoleOutput(prev => [...prev, `  ↳ setVariable("${name}", ${JSON.stringify(value)})`]);
            },
            onJumpToScene: (name) => {
                setConsoleOutput(prev => [...prev, `  ↳ jumpToScene("${name}")`]);
            },
            onJumpToLabel: (label) => {
                setConsoleOutput(prev => [...prev, `  ↳ jumpToLabel("${label}")`]);
            },
            onShowDialogue: (char, text) => {
                setConsoleOutput(prev => [...prev, `  ↳ showDialogue("${char}", "${text}")`]);
            },
            onPlaySFX: (name, vol) => {
                setConsoleOutput(prev => [...prev, `  ↳ playSFX("${name}", vol=${vol ?? 1})`]);
            },
            onPlayMusic: (name, loop, vol) => {
                setConsoleOutput(prev => [...prev, `  ↳ playMusic("${name}", loop=${loop}, vol=${vol ?? 1})`]);
            },
            onStopMusic: (fade) => {
                setConsoleOutput(prev => [...prev, `  ↳ stopMusic(fade=${fade ?? 1})`]);
            },
            onNotify: (msg, type) => {
                setConsoleOutput(prev => [...prev, `  ↳ notify("${msg}", "${type || 'info'}")`]);
            },
            onRunScript: (name, a) => {
                setConsoleOutput(prev => [...prev, `  ↳ runScript("${name}"${a ? `, ${JSON.stringify(a)}` : ''})  [not executed in test]`]);
            },
            onCallCommonEvent: (name, a) => {
                setConsoleOutput(prev => [...prev, `  ↳ callCommonEvent("${name}"${a ? `, ${JSON.stringify(a)}` : ''})  [not executed in test]`]);
            },
        };

        // Temporarily override console.log to capture script output
        const origLog = console.log;
        console.log = (...args: any[]) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            if (msg.startsWith('[Script]')) {
                setConsoleOutput(prev => [...prev, `  ${msg}`]);
            }
            origLog.apply(console, args);
        };

        const testScript: VNScript = { ...selectedScript, code: editingCode };
        const result = executeScript(testScript, testContext);

        console.log = origLog;

        if (result.success) {
            setConsoleOutput(prev => [...prev, `✓ Completed in ${result.duration.toFixed(1)}ms`]);
            if (result.returnValue !== undefined) {
                setConsoleOutput(prev => [...prev, `  Return: ${JSON.stringify(result.returnValue)}`]);
            }
        } else {
            setConsoleOutput(prev => [...prev, `✖ Error: ${result.error}`, ...(result.stack ? [`  ${result.stack.split('\n')[0]}`] : [])]);
        }

        setIsRunning(false);
    }, [selectedScript, editingCode, project]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSaveCode();
        }
        // Tab key inserts spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = textareaRef.current;
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newCode = editingCode.substring(0, start) + '  ' + editingCode.substring(end);
            setEditingCode(newCode);
            // Restore cursor position
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 2;
            });
        }
    }, [handleSaveCode, editingCode]);

    const handleToggleEnabled = useCallback((scriptId: VNID, enabled: boolean) => {
        dispatch({ type: 'UPDATE_SCRIPT', payload: { scriptId, updates: { enabled } } });
    }, [dispatch]);

    const handleUpdateTrigger = useCallback((trigger: VNScript['trigger']) => {
        if (!selectedScriptId) return;
        dispatch({ type: 'UPDATE_SCRIPT', payload: { scriptId: selectedScriptId, updates: { trigger } } });
    }, [dispatch, selectedScriptId]);

    // ── Script parameters (exposed to the script as read-only game.args) ──
    const updateParams = useCallback((params: ScriptParam[]) => {
        if (!selectedScriptId) return;
        dispatch({ type: 'UPDATE_SCRIPT', payload: { scriptId: selectedScriptId, updates: { params } } });
    }, [dispatch, selectedScriptId]);

    const handleAddParam = useCallback(() => {
        if (!selectedScript) return;
        const newParam: ScriptParam = {
            id: `sp-${Math.random().toString(36).substring(2, 9)}`,
            name: `param${(selectedScript.params?.length || 0) + 1}`,
            type: 'string',
            defaultValue: '',
            description: '',
        };
        updateParams([...(selectedScript.params || []), newParam]);
    }, [selectedScript, updateParams]);

    const handleUpdateParam = useCallback((idx: number, patch: Partial<ScriptParam>) => {
        if (!selectedScript) return;
        const params = [...(selectedScript.params || [])];
        const merged = { ...params[idx], ...patch };
        // Coerce the default value to the (possibly new) type so it stays valid.
        if (patch.type) {
            merged.defaultValue = patch.type === 'number' ? Number(merged.defaultValue) || 0
                : patch.type === 'boolean' ? merged.defaultValue === true || merged.defaultValue === 'true'
                : String(merged.defaultValue ?? '');
        }
        params[idx] = merged;
        updateParams(params);
    }, [selectedScript, updateParams]);

    const handleRemoveParam = useCallback((idx: number) => {
        if (!selectedScript) return;
        updateParams((selectedScript.params || []).filter((_, i) => i !== idx));
    }, [selectedScript, updateParams]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="rounded-xl overflow-hidden flex flex-col" style={{ width: '90vw', height: '85vh', maxWidth: '1400px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-2">
                        <span className="text-lg">📜</span>
                        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Script Editor</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-emerald)', color: '#fff' }}>
                            {scripts.length} script{scripts.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-xs px-3 py-1 rounded hover:bg-red-500/20 text-red-400 transition-colors">
                        Close
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Script List Sidebar */}
                    <div className="w-56 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                                onClick={() => setShowNewDialog(true)}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-bold transition-colors"
                            >
                                <PlusIcon className="w-3 h-3" /> New Script
                            </button>
                        </div>

                        {showNewDialog && (
                            <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                                <input
                                    type="text"
                                    value={newScriptName}
                                    onChange={e => setNewScriptName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateScript()}
                                    placeholder="Script name..."
                                    className="w-full bg-slate-900 text-white px-2 py-1 rounded text-xs outline-none ring-1 ring-emerald-500 mb-1"
                                    autoFocus
                                />
                                <div className="flex gap-1">
                                    <button onClick={handleCreateScript} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded text-xs">Create</button>
                                    <button onClick={() => setShowNewDialog(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-xs">Cancel</button>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto">
                            {scripts.length === 0 ? (
                                <div className="p-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                    No scripts yet. Create one to get started!
                                </div>
                            ) : (
                                scripts.map(script => (
                                    <div
                                        key={script.id}
                                        onClick={() => setSelectedScriptId(script.id)}
                                        className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors border-b ${
                                            selectedScriptId === script.id
                                                ? 'bg-emerald-500/15 border-emerald-500/30'
                                                : 'hover:bg-slate-700/50 border-transparent'
                                        }`}
                                        style={{ borderBottomColor: selectedScriptId === script.id ? undefined : 'var(--border-subtle)' }}
                                    >
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${script.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                        <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{script.name}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteScript(script.id); }}
                                            className="p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <TrashIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {selectedScript ? (
                            <>
                                {/* Script Toolbar */}
                                <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedScript.name}</span>
                                    <select
                                        value={selectedScript.trigger}
                                        onChange={e => handleUpdateTrigger(e.target.value as VNScript['trigger'])}
                                        className="text-xs bg-slate-800 text-white px-2 py-1 rounded border border-slate-600"
                                    >
                                        <option value="command">Trigger: Event</option>
                                        <option value="onSceneEnter">Trigger: Scene Enter</option>
                                        <option value="onSceneExit">Trigger: Scene Exit</option>
                                        <option value="global">Trigger: Global (Utility)</option>
                                    </select>
                                    <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedScript.enabled}
                                            onChange={e => handleToggleEnabled(selectedScriptId!, e.target.checked)}
                                            className="accent-emerald-500"
                                        />
                                        Enabled
                                    </label>
                                    <div className="flex-1" />
                                    <button
                                        onClick={handleValidate}
                                        className="text-xs px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 transition-colors"
                                    >
                                        Validate
                                    </button>
                                    <button
                                        onClick={handleTestRun}
                                        disabled={isRunning}
                                        className="text-xs px-2.5 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 transition-colors disabled:opacity-50"
                                    >
                                        {isRunning ? 'Running...' : '▶ Test Run'}
                                    </button>
                                    <button
                                        onClick={() => setShowApi(s => !s)}
                                        className={`text-xs px-2.5 py-1 rounded transition-colors ${showApi ? 'bg-violet-600/40 text-violet-200' : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300'}`}
                                        title="Toggle the game API reference"
                                    >
                                        📖 API
                                    </button>
                                    <button
                                        onClick={handleSaveCode}
                                        className="text-xs px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                                    >
                                        Save (Ctrl+S)
                                    </button>
                                </div>

                                {/* Parameters panel — declared params become read-only game.args */}
                                <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Parameters</span>
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>access in script via <code className="font-mono">game.args.name</code></span>
                                        <div className="flex-1" />
                                        <button onClick={handleAddParam} className="text-[11px] px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 flex items-center gap-1">
                                            <PlusIcon className="w-3 h-3" /> Add
                                        </button>
                                    </div>
                                    {(selectedScript.params && selectedScript.params.length > 0) ? (
                                        <div className="space-y-1">
                                            {selectedScript.params.map((p, idx) => (
                                                <div key={p.id} className="flex items-center gap-1">
                                                    <input
                                                        value={p.name}
                                                        onChange={e => handleUpdateParam(idx, { name: e.target.value })}
                                                        placeholder="name"
                                                        className="w-32 bg-slate-900 text-white px-2 py-1 rounded text-xs outline-none border border-slate-700"
                                                    />
                                                    <select
                                                        value={p.type}
                                                        onChange={e => handleUpdateParam(idx, { type: e.target.value as ScriptParam['type'] })}
                                                        className="bg-slate-800 text-white px-1 py-1 rounded text-xs border border-slate-700"
                                                    >
                                                        <option value="string">string</option>
                                                        <option value="number">number</option>
                                                        <option value="boolean">boolean</option>
                                                    </select>
                                                    {p.type === 'boolean' ? (
                                                        <select
                                                            value={String(p.defaultValue)}
                                                            onChange={e => handleUpdateParam(idx, { defaultValue: e.target.value === 'true' })}
                                                            className="bg-slate-800 text-white px-1 py-1 rounded text-xs border border-slate-700"
                                                        >
                                                            <option value="false">false</option>
                                                            <option value="true">true</option>
                                                        </select>
                                                    ) : (
                                                        <input
                                                            value={String(p.defaultValue ?? '')}
                                                            onChange={e => handleUpdateParam(idx, { defaultValue: p.type === 'number' ? (Number(e.target.value) || 0) : e.target.value })}
                                                            placeholder="default"
                                                            type={p.type === 'number' ? 'number' : 'text'}
                                                            className="w-24 bg-slate-900 text-white px-2 py-1 rounded text-xs outline-none border border-slate-700"
                                                        />
                                                    )}
                                                    <input
                                                        value={p.description || ''}
                                                        onChange={e => handleUpdateParam(idx, { description: e.target.value })}
                                                        placeholder="description (optional)"
                                                        className="flex-1 bg-slate-900 text-white px-2 py-1 rounded text-xs outline-none border border-slate-700"
                                                    />
                                                    <button onClick={() => handleRemoveParam(idx)} className="p-1 text-slate-500 hover:text-red-400">
                                                        <TrashIcon className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>No parameters. Add one to accept arguments from RunScript / game.runScript.</div>
                                    )}
                                </div>

                                {/* Validation Errors Banner */}
                                {validationErrors.length > 0 && (
                                    <div className="px-3 py-1 bg-red-500/10 border-b border-red-500/20">
                                        {validationErrors.map((err, i) => (
                                            <div key={i} className="text-xs text-red-400">✖ {err}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Code Editor (+ optional API reference panel) */}
                                <div className="flex-1 min-h-0 flex">
                                    <div className="flex-1 relative min-h-0">
                                    <textarea
                                        ref={textareaRef}
                                        value={editingCode}
                                        onChange={e => setEditingCode(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        spellCheck={false}
                                        className="absolute inset-0 w-full h-full resize-none p-4 text-sm leading-6 outline-none font-mono"
                                        style={{
                                            background: '#0d1117',
                                            color: '#c9d1d9',
                                            tabSize: 2,
                                            caretColor: '#58a6ff',
                                        }}
                                        placeholder="// Write your script here..."
                                    />
                                    {/* Line numbers overlay */}
                                    <div className="absolute left-0 top-0 bottom-0 w-10 pointer-events-none pt-4 text-right pr-2 font-mono text-xs leading-6" style={{ color: '#484f58', background: '#0d1117' }}>
                                        {editingCode.split('\n').map((_, i) => (
                                            <div key={i}>{i + 1}</div>
                                        ))}
                                    </div>
                                    {/* Adjust textarea padding for line numbers */}
                                    <style>{`
                                        .script-editor-textarea { padding-left: 48px !important; }
                                    `}</style>
                                    </div>
                                    {showApi && (
                                        <div className="w-64 flex-shrink-0 border-l overflow-y-auto" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                                            <div className="px-2 py-1 text-[11px] font-bold sticky top-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                                <code>game</code> API — click to insert
                                            </div>
                                            {API_REFERENCE.map(group => (
                                                <div key={group.group} className="py-1">
                                                    <div className="px-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent-lavender, #a78bfa)' }}>{group.group}</div>
                                                    {group.items.map(item => (
                                                        <button
                                                            key={item.sig}
                                                            onClick={() => insertSnippet(item.snippet)}
                                                            title={item.desc}
                                                            className="block w-full text-left px-2 py-0.5 hover:bg-violet-500/10 transition-colors"
                                                        >
                                                            <span className="font-mono text-[11px] text-sky-300">game.{item.sig}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Console Output */}
                                <div className="h-36 border-t flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
                                    <div className="flex items-center justify-between px-3 py-1" style={{ background: 'var(--bg-elevated)' }}>
                                        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Console</span>
                                        <button onClick={() => setConsoleOutput([])} className="text-xs text-slate-400 hover:text-white transition-colors">Clear</button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 font-mono text-xs" style={{ background: '#0d1117', color: '#8b949e' }}>
                                        {consoleOutput.length === 0 ? (
                                            <span className="text-slate-600 italic">Script output will appear here...</span>
                                        ) : (
                                            consoleOutput.map((line, i) => (
                                                <div key={i} className={
                                                    line.startsWith('✖') ? 'text-red-400' :
                                                    line.startsWith('⚠') ? 'text-amber-400' :
                                                    line.startsWith('✓') ? 'text-emerald-400' :
                                                    line.startsWith('▶') ? 'text-sky-400' :
                                                    'text-slate-300'
                                                }>{line}</div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center" style={{ background: '#0d1117' }}>
                                <div className="text-center">
                                    <div className="text-4xl mb-3">📜</div>
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                        {scripts.length === 0
                                            ? 'Create your first script to get started'
                                            : 'Select a script from the sidebar'
                                        }
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScriptEditor;
