import React, { useState, useEffect } from 'react';
import { PlayIcon, HomeIcon, SaveIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, KeyboardIcon } from './icons';
import { useProject } from '../contexts/ProjectContext';
import { exportProject } from '../utils/projectPackager';
import { saveRecentProject } from './ProjectHub';
import { GameBuilder } from './GameBuilder';
import { isManagerWindow, closeAllManagerWindows } from '../utils/windowManager';
import ConfirmationModal from './ui/ConfirmationModal';
import InfoModal from './ui/InfoModal';
import LoadingOverlay from './ui/LoadingOverlay';
import ThemeSelector from './ThemeSelector';

function isEditorDebugEnabled(): boolean {
    try {
        return window.localStorage.getItem('flourish:editorDebug') === '1';
    } catch {
        return false;
    }
}

function editorDebugLog(...args: unknown[]): void {
    if (!isEditorDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(...args);
}

const Header: React.FC<{
    onPlay: () => void;
    title: string;
    onExit: () => void;
    onTitleChange: (newTitle: string) => void;
    navigationTabs?: React.ReactNode;
    onShowKeyboardShortcuts?: () => void;
}> = ({ onPlay, title, onExit, onTitleChange, navigationTabs, onShowKeyboardShortcuts }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentTitle, setCurrentTitle] = useState(title);
    const [showBuilder, setShowBuilder] = useState(false);
    const [showExitModal, setShowExitModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isExportingQuick, setIsExportingQuick] = useState(false);
    const [exitMode, setExitMode] = useState<'hub' | 'electron' | null>(null);
    const { project, undo, redo, canUndo, canRedo } = useProject();
    const isChildWindow = isManagerWindow();

    useEffect(() => {
        editorDebugLog('showExitModal changed:', showExitModal);
    }, [showExitModal]);

    // Listen for window close event from Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onRequestSaveBeforeQuit) {
            (window as any).electronAPI.onRequestSaveBeforeQuit(() => {
                editorDebugLog('Received quit request from Electron');
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
        setIsExportingQuick(true);
        try {
            const didSave = await exportProject(project);
            if (didSave) {
                // Save to recent projects now that we have a saved file
                saveRecentProject(project);
            }
        } catch (error) {
            console.error("Export failed:", error);
            setErrorMessage(`Failed to export project. ${error instanceof Error ? error.message : 'Unknown error'}`);
            setShowErrorModal(true);
        } finally {
            setIsExportingQuick(false);
        }
    };

    const handleHubClick = () => {
        editorDebugLog('Hub button clicked, showing modal');
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
            
            // Save to recent projects now that we have a saved file
            saveRecentProject(project);
            
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
        <header 
            className="px-3 py-2 flex items-center z-10 relative"
            style={{ 
                background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                borderBottom: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
            }}
        >
            {/* Subtle rainbow accent line */}
            <div 
                className="absolute bottom-0 left-0 right-0 h-[1px]"
                style={{
                    background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-lavender), var(--accent-cyan), var(--accent-mint))',
                    opacity: 0.3
                }}
            />
            
            {/* In manager windows, only show navigation tabs */}
            {isChildWindow ? (
                <div className="flex-1 flex justify-center">
                    {navigationTabs}
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleHubClick}
                            className="bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-pink)] text-[var(--text-secondary)] hover:text-[var(--accent-pink)] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs group"
                            title="Return to Project Hub"
                        >
                            <HomeIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            Hub
                        </button>
                        <div className="w-px h-6 bg-[var(--border-subtle)]" />
                        {isEditing ? (
                            <input
                                type="text"
                                value={currentTitle}
                                onChange={(e) => setCurrentTitle(e.target.value)}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                className="font-heading bg-[var(--bg-primary)] text-sm font-semibold text-[var(--accent-cyan)] py-1 px-2 rounded-lg outline-none ring-2 ring-[var(--accent-cyan)]/50"
                                autoFocus
                            />
                        ) : (
                            <h1 
                                className="font-heading text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-primary)] py-1 px-2 rounded-lg transition-colors"
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
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
                            <button
                                onClick={undo}
                                disabled={!canUndo}
                                className="hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-md flex items-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Undo (Ctrl+Z)"
                            >
                                <ArrowUturnLeftIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={redo}
                                disabled={!canRedo}
                                className="hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-md flex items-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
                            >
                                <ArrowUturnRightIcon className="w-4 h-4" />
                            </button>
                            {onShowKeyboardShortcuts && (
                                <>
                                    <div className="w-px h-4 bg-[var(--border-subtle)]" />
                                    <button
                                        onClick={onShowKeyboardShortcuts}
                                        className="relative p-1.5 rounded-md flex items-center transition-all group overflow-hidden"
                                        style={{
                                            background: 'linear-gradient(135deg, var(--accent-pink), var(--accent-peach), var(--accent-yellow), var(--accent-mint), var(--accent-cyan), var(--accent-lavender))',
                                            backgroundSize: '300% 300%',
                                            animation: 'rainbow-shift 4s ease infinite'
                                        }}
                                        title="⌨️ Keyboard Shortcuts - Click to see all shortcuts!"
                                    >
                                        <KeyboardIcon className="w-4 h-4 text-white relative z-10 group-hover:scale-110 transition-transform" />
                                        <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                </>
                            )}
                        </div>
                        <ThemeSelector />
                        <button
                            onClick={handleExport}
                            className="bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-lavender)] text-[var(--text-secondary)] hover:text-[var(--accent-lavender)] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs group"
                            title="Export Project as .zip"
                        >
                            <SaveIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            Export
                        </button>
                        <button
                            onClick={() => setShowBuilder(true)}
                            className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs shadow-md hover:shadow-lg hover:shadow-green-500/20"
                            title="Build standalone game (no coding required!)"
                        >
                            🎮 Build
                        </button>
                        <button
                            onClick={onPlay}
                            className="btn-primary-gradient text-white font-semibold px-4 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-xs"
                        >
                            <PlayIcon className="w-4 h-4" />
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
            <p className="mb-4 text-[var(--text-secondary)]">Do you want to export your project before leaving?</p>
            <button
                onClick={handleReturnWithoutSaving}
                className="w-full px-4 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
        
        {/* Export Loading Overlay */}
        <LoadingOverlay 
            isVisible={isExportingQuick} 
            message="Exporting Project..." 
            subMessage="Packaging your project files"
        />
    </>
    );
};

export default Header;
