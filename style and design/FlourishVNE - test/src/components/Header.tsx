import React, { useState, useEffect } from 'react';
import { PlayIcon, ArrowLeftOnRectangleIcon, ArrowDownTrayIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, Cog6ToothIcon, UsersIcon, PhotoIcon, WindowIcon, CodeBracketIcon, FolderIcon } from './icons';
import { useProject } from '../contexts/ProjectContext';
import { exportProject } from '../utils/projectPackager';
import { GameBuilder } from './GameBuilder';
import LoadingSpinner from './ui/LoadingSpinner';

const Header: React.FC<{
    onPlay: () => void;
    title: string;
    onExit: () => void;
    onTitleChange: (newTitle: string) => void;
    onBuild?: () => void;
    onExport?: () => void;
}> = ({ onPlay, title, onExit, onTitleChange, onBuild, onExport }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentTitle, setCurrentTitle] = useState(title);
    const [showBuilder, setShowBuilder] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const { project, undo, redo, canUndo, canRedo } = useProject();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle shortcuts when not typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        if (!isSaving) {
                            handleExport();
                        }
                        break;
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                        break;
                    case 'y':
                        e.preventDefault();
                        redo();
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSaving, undo, redo]);

    const handleTitleBlur = () => {
        setIsEditing(false);
        if (currentTitle.trim()) {
            onTitleChange(currentTitle.trim());
        } else {
            setCurrentTitle(title); // revert if empty
        }
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        } else if (e.key === 'Escape') {
            setCurrentTitle(title);
            setIsEditing(false);
        }
    };

    const handleExport = async () => {
        setIsSaving(true);
        try {
            await exportProject(project);
        } catch (error) {
            console.error("Save failed:", error);
            alert(`Failed to save project. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <>
        <header className="bg-[var(--bg-secondary)] p-3 flex justify-between items-center border-b-2 border-slate-700 shadow-lg">
            <div className="flex items-center gap-2">
                <button 
                    onClick={onExit}
                    className="bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] text-white font-bold py-2 px-3 rounded-lg flex items-center gap-2 transition-all hover:scale-105 text-sm shadow-md"
                    title="Back to Project Hub"
                >
                    <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                    Exit
                </button>
                {isEditing ? (
                    <input
                        type="text"
                        value={currentTitle}
                        onChange={(e) => setCurrentTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        className="font-heading bg-[var(--bg-primary)] text-base font-bold text-[var(--accent-cyan)] py-2 px-3 rounded-lg outline-none ring-2 ring-[var(--accent-cyan)]"
                        autoFocus
                    />
                ) : (
                    <h1 
                        className="font-heading text-base font-bold text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-tertiary)] py-2 px-3 rounded-lg transition-colors"
                        onClick={() => setIsEditing(true)}
                        title="Click to edit project title"
                    >
                        {title}
                    </h1>
                )}
                
                {/* Quick Access Buttons - Only show in Electron */}
                {(window as any).electronAPI && (
                    <div className="flex items-center gap-1 ml-3 border-l-2 border-slate-600 pl-3">
                        <button
                            onClick={() => (window as any).electronAPI?.openChildWindow(
                                'characters', 
                                'Character Manager', 
                                1400, 
                                750, 
                                { resizable: true, minWidth: 1200, minHeight: 650 }
                            )}
                            className="btn btn-secondary p-2 hover:scale-110"
                            title="Characters - Manage character sprites and customization"
                        >
                            <UsersIcon className="w-4 h-4 text-blue-400" />
                        </button>
                        <button
                            onClick={() => (window as any).electronAPI?.openChildWindow(
                                'ui', 
                                'UI Screen Manager', 
                                1500, 
                                900, 
                                { resizable: true, minWidth: 1200, minHeight: 750 }
                            )}
                            className="btn btn-secondary p-2 hover:scale-110"
                            title="UI - Manage custom UI screens and menus"
                        >
                            <WindowIcon className="w-4 h-4 text-green-400" />
                        </button>
                        <button
                            onClick={() => (window as any).electronAPI?.openChildWindow(
                                'assets', 
                                'Asset Manager', 
                                1300, 
                                850, 
                                { resizable: true, minWidth: 1100, minHeight: 700 }
                            )}
                            className="btn btn-secondary p-2 hover:scale-110"
                            title="Assets - Import images, audio, and other media"
                        >
                            <FolderIcon className="w-4 h-4 text-yellow-400" />
                        </button>
                        <button
                            onClick={() => (window as any).electronAPI?.openChildWindow(
                                'variables', 
                                'Variable Manager', 
                                1100, 
                                750, 
                                { resizable: true, minWidth: 900, minHeight: 650 }
                            )}
                            className="btn btn-secondary p-2 hover:scale-110"
                            title="Variables - Track game state and player choices"
                        >
                            <CodeBracketIcon className="w-3 h-3 text-orange-400" />
                        </button>
                        <button
                            onClick={() => (window as any).electronAPI?.openChildWindow(
                                'settings', 
                                'Project Settings', 
                                900, 
                                700, 
                                { resizable: true, minWidth: 800, minHeight: 600 }
                            )}
                            className="btn btn-secondary p-2 hover:scale-110"
                            title="Settings - Configure project properties"
                        >
                            <Cog6ToothIcon className="w-4 h-4 text-red-400" />
                        </button>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={onPlay}
                    className="btn-primary-gradient text-white font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 text-sm shadow-lg hover:scale-105 transition-all"
                    title="Play / Test (F5)"
                >
                    <PlayIcon className="w-4 h-4" />
                    Play
                </button>
                <button
                    onClick={() => setShowBuilder(true)}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 transition-all text-sm shadow-lg hover:scale-105"
                    title="Build standalone game (Ctrl+B)"
                >
                    🎮 Build
                </button>
                <button
                    onClick={() => setShowShortcuts(true)}
                    className="btn btn-secondary py-2.5 px-3 flex items-center gap-1 text-sm hover:scale-105"
                    title="Keyboard Shortcuts"
                >
                    <Cog6ToothIcon className="w-4 h-4" />
                    ?
                </button>
                <button
                    onClick={handleExport}
                    disabled={isSaving}
                    className="btn btn-secondary py-2.5 px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:scale-105"
                    title="Save Project as .zip (Ctrl+S)"
                >
                    {isSaving ? (
                        <LoadingSpinner size="sm" />
                    ) : (
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    )}
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </header>
        {showBuilder && <GameBuilder project={project} onClose={() => setShowBuilder(false)} />}
        {showShortcuts && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg max-w-md w-full mx-4">
                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Keyboard Shortcuts</h2>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Save Project</span>
                            <kbd className="bg-[var(--bg-tertiary)] px-2 py-1 rounded text-xs">Ctrl+S</kbd>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Undo</span>
                            <kbd className="bg-[var(--bg-tertiary)] px-2 py-1 rounded text-xs">Ctrl+Z</kbd>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Redo</span>
                            <kbd className="bg-[var(--bg-tertiary)] px-2 py-1 rounded text-xs">Ctrl+Y</kbd>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Redo (Alt)</span>
                            <kbd className="bg-[var(--bg-tertiary)] px-2 py-1 rounded text-xs">Ctrl+Shift+Z</kbd>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowShortcuts(false)}
                        className="w-full mt-4 bg-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/80 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        )}
    </>
);
};

export default Header;
