import React, { useState, useEffect } from 'react';
import { PlayIcon, ArrowLeftOnRectangleIcon, ArrowDownTrayIcon } from './icons';
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
    const { project } = useProject();

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
        <header className="bg-[var(--bg-secondary)] p-2 flex items-center shadow-md z-10">
            <div className="flex items-center gap-4">
                <button 
                    onClick={onExit}
                    className="bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                    title="Back to Project Hub"
                >
                    <ArrowLeftOnRectangleIcon />
                    Exit
                </button>
                {isEditing ? (
                    <input
                        type="text"
                        value={currentTitle}
                        onChange={(e) => setCurrentTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        className="font-heading bg-[var(--bg-primary)] text-2xl font-bold text-[var(--accent-cyan)] p-1 rounded-md outline-none ring-2 ring-[var(--accent-cyan)]"
                        autoFocus
                    />
                ) : (
                    <h1 
                        className="font-heading text-2xl font-bold text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-tertiary)] p-1 rounded-md"
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
            <div className="flex items-center gap-4">
                <button
                    onClick={handleExport}
                    className="bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                    title="Export Project as .zip"
                >
                    <ArrowDownTrayIcon />
                    Export
                </button>
                <button
                    onClick={() => setShowBuilder(true)}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all"
                    title="Build standalone game (no coding required!)"
                >
                    🎮 Build Game
                </button>
                <button
                    onClick={onPlay}
                    className="btn-primary-gradient text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2"
                >
                    <PlayIcon />
                    Play
                </button>
            </div>
        </header>
        {showBuilder && <GameBuilder project={project} onClose={() => setShowBuilder(false)} />}
    </>
    );
};

export default Header;
