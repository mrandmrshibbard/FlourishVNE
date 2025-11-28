import React, { useState, useEffect } from 'react';
import { PlayIcon, ArrowLeftOnRectangleIcon, ArrowDownTrayIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from './icons';
import { useProject } from '../contexts/ProjectContext';
import { exportProject } from '../utils/projectPackager';
import { GameBuilder } from './GameBuilder';
import { isManagerWindow, closeAllManagerWindows } from '../utils/windowManager';
import ConfirmationModal from './ui/ConfirmationModal';
import InfoModal from './ui/InfoModal';
import ThemeSelector from './ThemeSelector';

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
    const [showExitModal, setShowExitModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [exitMode, setExitMode] = useState<'hub' | 'electron' | null>(null);
    const { project, undo, redo, canUndo, canRedo } = useProject();
    const isChildWindow = isManagerWindow();

    useEffect(() => {
        console.log('showExitModal changed:', showExitModal);
    }, [showExitModal]);

    // Listen for window close event from Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onRequestSaveBeforeQuit) {
            (window as any).electronAPI.onRequestSaveBeforeQuit(() => {
                console.log('Received quit request from Electron');
                setExitMode('electron');
                setShowExitModal(true);
            });
        }
    }, []);

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
            setErrorMessage(`Failed to export project. ${error instanceof Error ? error.message : 'Unknown error'}`);
            setShowErrorModal(true);
        }
    };

    const handleHubClick = () => {
        console.log('Hub button clicked, showing modal');
        setExitMode('hub');
        setShowExitModal(true);
    };

    const handleConfirmReturn = async () => {
        const mode = exitMode;
        setIsExporting(true);
        try {
            const didSave = await exportProject(project);

            if (!didSave) {
                setIsExporting(false);
                return;
            }
            // Wait a moment for the export to complete
            setTimeout(() => {
                setShowExitModal(false);
                setIsExporting(false);

                if (mode === 'electron' && (window as any).electronAPI?.confirmQuit) {
                    (window as any).electronAPI.confirmQuit();
                } else {
                    if (mode === 'hub') {
                        closeAllManagerWindows();
                    }
                    onExit();
                }

                setExitMode(null);
            }, 500);
        } catch (error) {
            console.error("Export failed:", error);
            setIsExporting(false);
            setShowExitModal(false);
            setErrorMessage(`Failed to export project. ${error instanceof Error ? error.message : 'Unknown error'}`);
            setShowErrorModal(true);
            setExitMode(null);
        }
    };

    const handleCancelReturn = () => {
        setShowExitModal(false);
        
        // If called from Electron window close, cancel quit
        if (exitMode === 'electron' && (window as any).electronAPI?.cancelQuit) {
            (window as any).electronAPI.cancelQuit();
        }

        setExitMode(null);
    };

    const handleReturnWithoutSaving = () => {
        setShowExitModal(false);
        const mode = exitMode;
        
        if (mode === 'electron' && (window as any).electronAPI?.confirmQuit) {
            (window as any).electronAPI.confirmQuit();
        } else {
            if (mode === 'hub') {
                closeAllManagerWindows();
            }
            onExit();
        }

        setExitMode(null);
    };
    
    return (
        <>
        <header className="bg-[var(--bg-secondary)] px-1 py-0.5 flex items-center shadow-sm z-10 border-b border-slate-700">
            {/* In manager windows, only show navigation tabs */}
            {isChildWindow ? (
                <div className="flex-1 flex justify-center">
                    {navigationTabs}
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={handleHubClick}
                            className="bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] text-white font-bold px-3 py-1.5 rounded flex items-center gap-0.5 transition-colors text-xs"
                            title="Return to Project Hub"
                        >
                            <ArrowLeftOnRectangleIcon className="w-3.5 h-3.5" />
                            Hub
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
                        <ThemeSelector />
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
                </>
            )}
        </header>
        {!isChildWindow && showBuilder && <GameBuilder project={project} onClose={() => setShowBuilder(false)} />}
        
        {/* Exit Confirmation Modal */}
        <ConfirmationModal
            isOpen={showExitModal}
            onClose={handleCancelReturn}
            onConfirm={handleConfirmReturn}
            title="Save Before Leaving?"
            confirmLabel={isExporting ? "Saving..." : "Save & Leave"}
        >
            <p className="mb-4">Do you want to export your project before leaving?</p>
            <button
                onClick={handleReturnWithoutSaving}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors font-semibold text-white"
                disabled={isExporting}
            >
                Exit Without Saving
            </button>
        </ConfirmationModal>
        
        {/* Error Modal */}
        <InfoModal
            isOpen={showErrorModal}
            onClose={() => setShowErrorModal(false)}
            title="Export Error"
        >
            {errorMessage}
        </InfoModal>
    </>
    );
};

export default Header;
