/**
 * Script Editor Component
 * 
 * A full-featured script editor with syntax highlighting (textarea-based),
 * script management, validation, and test execution.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNScript } from '../types/scripting';
import { createDefaultScript, validateScript, executeScript, ScriptRuntimeContext } from '../features/scripting/ScriptExecutor';
import { VNID } from '../types';
import { PlusIcon, TrashIcon, PencilIcon } from './icons';

interface ScriptEditorProps {
    onClose: () => void;
}

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
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
                                        <option value="command">Trigger: Command</option>
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
                                        onClick={handleSaveCode}
                                        className="text-xs px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                                    >
                                        Save (Ctrl+S)
                                    </button>
                                </div>

                                {/* Validation Errors Banner */}
                                {validationErrors.length > 0 && (
                                    <div className="px-3 py-1 bg-red-500/10 border-b border-red-500/20">
                                        {validationErrors.map((err, i) => (
                                            <div key={i} className="text-xs text-red-400">✖ {err}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Code Editor */}
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
