import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PlayIcon, HomeIcon, SaveIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, KeyboardIcon, SparklesIcon, GlobeIcon, CodeBracketIcon, PuzzlePieceIcon, GamepadIcon, HelpIcon } from './icons';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import { exportProject } from '../utils/projectPackager';
import { saveRecentProject, getRecentProjectInfo } from './ProjectHub';
import { GameBuilder } from './GameBuilder';
import { isManagerWindow, closeAllManagerWindows } from '../utils/windowManager';
import InfoModal from './ui/InfoModal';
import LoadingOverlay from './ui/LoadingOverlay';
import ThemeSelector from './ThemeSelector';
import LocalizationPanel from './LocalizationPanel';
import HelpPanel from './HelpPanel';
import ScriptEditor from './ScriptEditor';
import PluginManagerUI from './PluginManagerUI';


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
    const [showLocalization, setShowLocalization] = useState(false);
    const [showHelpPanel, setShowHelpPanel] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [showScriptEditor, setShowScriptEditor] = useState(false);
    const [showPluginManager, setShowPluginManager] = useState(false);
    const [showExitModal, setShowExitModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isExportingQuick, setIsExportingQuick] = useState(false);
    const [exitMode, setExitMode] = useState<'hub' | 'electron' | null>(null);
    const { project, dispatch, undo, redo, canUndo, canRedo, isDirty, markSaved } = useProject();
    const toast = useToast();
    const { t } = useTranslation(['header', 'common']);
    const isChildWindow = isManagerWindow();

    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;

    useEffect(() => {
        editorDebugLog('showExitModal changed:', showExitModal);
    }, [showExitModal]);

    // Listen for window close event from Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onRequestSaveBeforeQuit) {
            (window as any).electronAPI.onRequestSaveBeforeQuit(() => {
                editorDebugLog('Received quit request from Electron');
                // If no unsaved changes, quit immediately
                if (!isDirtyRef.current) {
                    (window as any).electronAPI.confirmQuit();
                    return;
                }
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

    // If this project was already saved/opened from a file AND its name (title) is unchanged since
    // then, return that file's path so Save writes straight to it (no dialog, no overwrite prompt).
    // A renamed project or a never-saved one returns undefined → the normal save dialog is shown.
    const resolveOverwritePath = (): string | undefined => {
        const saved = getRecentProjectInfo(project.id);
        return (saved?.filePath && saved.title === project.title) ? saved.filePath : undefined;
    };

    const handleExport = async () => {
        setIsExportingQuick(true);
        try {
            const overwritePath = resolveOverwritePath();
            const result = await exportProject(project, overwritePath ? { overwritePath } : undefined);
            if (result.saved) {
                // Save to recent projects now that we have a saved file
                saveRecentProject(project, result.filePath);
                markSaved();
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
        // If no unsaved changes, skip the dialog and exit directly
        if (!isDirty) {
            closeAllManagerWindows();
            onExit();
            return;
        }
        setExitMode('hub');
        setShowExitModal(true);
    };

    const handleConfirmReturn = async () => {
        const mode = exitMode;
        setIsExporting(true);
        try {
            const overwritePath = resolveOverwritePath();
            const result = await exportProject(project, overwritePath ? { overwritePath } : undefined);

            if (!result.saved) {
                setIsExporting(false);
                return;
            }
            
            // Save to recent projects now that we have a saved file
            saveRecentProject(project, result.filePath);
            markSaved();
            
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
            className="px-3 py-2 flex items-center z-50 relative"
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
                    <div className="flex items-center gap-2 min-w-0 flex-shrink">
                        <button
                            onClick={handleHubClick}
                            className="flex-shrink-0 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-pink)] text-[var(--text-secondary)] hover:text-[var(--accent-pink)] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs group"
                            title={t('returnToHub')}
                        >
                            <HomeIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            {t('hub')}
                        </button>
                        <div className="w-px h-6 bg-[var(--border-subtle)] flex-shrink-0" />
                        {isEditing ? (
                            <input
                                type="text"
                                value={currentTitle}
                                onChange={(e) => setCurrentTitle(e.target.value)}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                className="font-heading bg-[var(--bg-primary)] text-sm font-semibold text-[var(--accent-cyan)] py-1 px-2 rounded-lg outline-none ring-2 ring-[var(--accent-cyan)]/50 min-w-0"
                                autoFocus
                            />
                        ) : (
                            // Truncate the project name so a long title can't push the tab bar off-screen
                            // on narrower / lower-aspect-ratio windows. Full name on hover via title attr.
                            <h1
                                className="font-heading text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-primary)] py-1 px-2 rounded-lg transition-colors truncate min-w-0 max-w-[8rem] xl:max-w-[14rem]"
                                onClick={() => setIsEditing(true)}
                                title={title}
                            >
                                {title}
                            </h1>
                        )}
                    </div>
                    {/* Left-align the tab bar (was centered) so it sits next to the title and the
                        rightmost tabs stay clear of the right-hand controls on narrow windows. */}
                    <div className="flex-1 min-w-0 flex justify-start pl-2">
                        {navigationTabs}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
                            <button
                                onClick={undo}
                                disabled={!canUndo}
                                className="hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-md flex items-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title={t('undo')}
                            >
                                <ArrowUturnLeftIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={redo}
                                disabled={!canRedo}
                                className="hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-md flex items-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title={t('redo')}
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
                                        title={t('keyboardShortcuts')}
                                    >
                                        <KeyboardIcon className="w-4 h-4 text-white relative z-10 group-hover:scale-110 transition-transform" />
                                        <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                </>
                            )}
                        </div>
                        <ThemeSelector />
                        <div className="relative">
                            <button
                                onClick={() => setShowToolsMenu(!showToolsMenu)}
                                className="bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-lavender)] text-[var(--text-secondary)] hover:text-[var(--accent-lavender)] font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs group"
                                title={t('toolsMenu')}
                            >
                                <SparklesIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                {t('tools')}
                                <svg className={`w-3 h-3 transition-transform ${showToolsMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showToolsMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowToolsMenu(false)} />
                                    <div
                                        className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border overflow-hidden"
                                        style={{
                                            background: 'var(--bg-secondary)',
                                            borderColor: 'var(--border-subtle)',
                                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
                                        }}
                                    >
                                        <button
                                            onClick={() => { setShowLocalization(true); setShowToolsMenu(false); }}
                                            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--accent-mint)]"
                                        >
                                            <GlobeIcon className="w-4 h-4" />
                                            {t('localization')}
                                        </button>
                                        <div className="h-px mx-2" style={{ background: 'var(--border-subtle)' }} />
                                        <button
                                            onClick={() => { setShowScriptEditor(true); setShowToolsMenu(false); }}
                                            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-emerald-400"
                                        >
                                            <CodeBracketIcon className="w-4 h-4" />
                                            {t('scriptEditor')}
                                        </button>
                                        <div className="h-px mx-2" style={{ background: 'var(--border-subtle)' }} />
                                        <button
                                            onClick={() => { setShowPluginManager(true); setShowToolsMenu(false); }}
                                            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-violet-400"
                                        >
                                            <PuzzlePieceIcon className="w-4 h-4" />
                                            {t('pluginManager')}
                                        </button>
                                        <div className="h-px mx-2" style={{ background: 'var(--border-subtle)' }} />
                                        <button
                                            onClick={() => { setShowHelpPanel(true); setShowToolsMenu(false); }}
                                            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)]"
                                        >
                                            <HelpIcon className="w-4 h-4" />
                                            {t('helpDocs')}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <button
                            onClick={handleExport}
                            className="bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-lavender)] text-[var(--text-secondary)] hover:text-[var(--accent-lavender)] font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs group"
                            title={t('saveToDisk')}
                        >
                            <SaveIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            {t('common:save')}
                        </button>
                        <div className="flex flex-col gap-0.5">
                            <button
                                onClick={onPlay}
                                className="btn-primary-gradient text-white font-semibold px-3 py-1 rounded-lg flex items-center justify-center gap-1 text-[11px] leading-tight"
                            >
                                <PlayIcon className="w-3.5 h-3.5" />
                                {t('play')}
                            </button>
                            <button
                                onClick={() => setShowBuilder(true)}
                                className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold px-3 py-1 rounded-lg flex items-center justify-center gap-1 transition-all text-[11px] leading-tight shadow-sm hover:shadow-md hover:shadow-green-500/20"
                                title={t('buildStandalone')}
                            >
                                <GamepadIcon className="w-3.5 h-3.5" />
                                {t('build')}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </header>
        {!isChildWindow && showBuilder && <GameBuilder project={project} onClose={() => setShowBuilder(false)} />}
        
        {/* Exit Confirmation Modal */}
        {showExitModal && ReactDOM.createPortal(
            <div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) handleCancelReturn(); }}
                style={{ animation: 'fade-in 0.2s ease-out' }}
            >
                <div
                    className="bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl shadow-2xl w-full max-w-sm p-6 m-4 border border-[var(--border-default)]"
                    style={{
                        animation: 'modal-enter 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 60px rgba(168, 85, 247, 0.1)'
                    }}
                >
                    <h2 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">{t('saveBeforeLeaving')}</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-5">{t('saveBeforeLeavingPrompt')}</p>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleConfirmReturn}
                            disabled={isExporting}
                            className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-purple)] hover:shadow-lg hover:shadow-[var(--accent-pink)]/25 transition-all text-white font-semibold text-sm disabled:opacity-60"
                        >
                            <span className="flex items-center justify-center gap-2">
                                <SaveIcon className="w-4 h-4" />
                                {isExporting ? t('saving') : t('saveAndLeave')}
                            </span>
                        </button>
                        <button
                            onClick={handleCancelReturn}
                            disabled={isExporting}
                            className="w-full px-4 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all font-medium text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                            {t('common:cancel')}
                        </button>
                        <div className="flex justify-center pt-1">
                            <button
                                onClick={handleReturnWithoutSaving}
                                disabled={isExporting}
                                className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors underline underline-offset-2 disabled:opacity-40"
                            >
                                {t('exitWithoutSaving')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )}
        
        {/* Error Modal */}
        <InfoModal
            isOpen={showErrorModal}
            onClose={() => setShowErrorModal(false)}
            title={t('exportError')}
        >
            {errorMessage}
        </InfoModal>
        
        {/* Export Loading Overlay */}
        <LoadingOverlay 
            isVisible={isExportingQuick}
            message={t('exportingProject')}
            subMessage={t('packagingFiles')}
        />
        
        {!isChildWindow && (
            <LocalizationPanel
                isOpen={showLocalization}
                onClose={() => setShowLocalization(false)}
                project={project}
            />
        )}
        
        {!isChildWindow && (
            <HelpPanel
                isOpen={showHelpPanel}
                onClose={() => setShowHelpPanel(false)}
            />
        )}
        
        {!isChildWindow && showScriptEditor && (
            <ScriptEditor onClose={() => setShowScriptEditor(false)} />
        )}
        
        {!isChildWindow && showPluginManager && (
            <PluginManagerUI onClose={() => setShowPluginManager(false)} />
        )}
    </>
    );
};

export default Header;
