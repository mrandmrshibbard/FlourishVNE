import React, { useState, useEffect } from 'react';
import { PlayIcon, ArrowLeftOnRectangleIcon, ArrowDownTrayIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from './icons';
import { useProject } from '../contexts/ProjectContext';
import { exportProject } from '../utils/projectPackager';
import { GameBuilder } from './GameBuilder';

const Header: React.FC<{
    onPlay: () => void;
    title: string;
    onExit: () => void;
    onTitleChange: (newTitle: string) => void;
    navigationTabs?: React.ReactNode;
}> = ({ onPlay, title, onExit, onTitleChange, navigationTabs }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentTitle, setCurrentTitle] = useState(title);
    const [showBuilder, setShowBuilder] = useState(false);
    const { project, undo, redo, canUndo, canRedo } = useProject();

    useEffect(() => {
        setCurrentTitle(title);
    }, [title]);

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
        try {
            await exportProject(project);
        } catch (error) {
            console.error("Export failed:", error);
            alert(`Failed to export project. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };
    
    return (
        <>
        <header className="bg-[var(--bg-secondary)] px-1 py-0.5 flex items-center shadow-sm z-10 border-b border-slate-700">
            <div className="flex items-center gap-1">
                <button 
                    onClick={onExit}
                    className="bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] text-white font-bold px-3 py-1.5 rounded flex items-center gap-0.5 transition-colors text-xs"
                    title="Back to Project Hub"
                >
                    <ArrowLeftOnRectangleIcon className="w-3.5 h-3.5" />
                    Exit
                </button>
                {isEditing ? (
                    <input
                        type="text"
                        value={currentTitle}
                        onChange={(e) => setCurrentTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        className="font-heading bg-[var(--bg-primary)] text-xs font-bold text-[var(--accent-cyan)] py-0.5 px-1 rounded outline-none ring-1 ring-[var(--accent-cyan)]"
                        autoFocus
                    />
                ) : (
                    <h1 
                        className="font-heading text-xs font-bold text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-tertiary)] py-0.5 px-1 rounded"
                        onClick={() => setIsEditing(true)}
                        title="Click to edit project title"
                    >
                        {title}
                    </h1>
                )}
            </div>
            <div className="flex-1 flex justify-center">
                {navigationTabs}
            </div>
            <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-white font-bold p-1.5 rounded flex items-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo (Ctrl+Z)"
                    >
                        <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-white font-bold p-1.5 rounded flex items-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
                    >
                        <ArrowUturnRightIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
                <button
                    onClick={handleExport}
                    className="bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] text-white font-bold px-3 py-1.5 rounded flex items-center gap-0.5 transition-colors text-xs"
                    title="Export Project as .zip"
                >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    Export
                </button>
                <button
                    onClick={() => setShowBuilder(true)}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold px-3 py-1.5 rounded flex items-center gap-0.5 transition-all text-xs"
                    title="Build standalone game (no coding required!)"
                >
                    🎮 Build
                </button>
                <button
                    onClick={onPlay}
                    className="btn-primary-gradient text-white font-bold px-3 py-1.5 rounded flex items-center justify-center gap-0.5 text-xs"
                >
                    <PlayIcon className="w-3.5 h-3.5" />
                    Play
                </button>
            </div>
        </header>
        {showBuilder && <GameBuilder project={project} onClose={() => setShowBuilder(false)} />}
    </>
    );
};

export default Header;
